import os
import logging
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional

import models
import crud
import schemas
import utils
from database import engine, get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Candidate Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory store for last uploaded file path (single-user MVP)
_state = {"last_file": None, "last_file_dupes": 0}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Invalid file format. Upload CSV or Excel only.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    if not content:
        raise HTTPException(400, "Uploaded file is empty.")

    with open(filepath, "wb") as f:
        f.write(content)

    logger.info(f"File uploaded: {filename}")

    try:
        df = utils.read_file(filepath)
    except Exception as e:
        raise HTTPException(400, str(e))

    if df.empty:
        raise HTTPException(400, "File contains no data.")

    df_norm = utils.normalize_columns(df)
    valid, msg = utils.validate_columns(df_norm)
    if not valid:
        raise HTTPException(422, msg)

    preview = df_norm.head(10).fillna("").to_dict(orient="records")
    _state["last_file"] = filepath

    return {
        "filename": filename,
        "total_rows": len(df),
        "columns": list(df_norm.columns),
        "preview": preview,
    }


@app.post("/process", response_model=schemas.ProcessResult)
def process_file(db: Session = Depends(get_db)):
    if not _state["last_file"]:
        raise HTTPException(400, "No file uploaded. Please upload a file first.")

    filepath = _state["last_file"]
    if not os.path.exists(filepath):
        raise HTTPException(400, "Uploaded file not found. Please re-upload.")

    try:
        df = utils.read_file(filepath)
        df, file_dupes = utils.clean_dataframe(df)
    except Exception as e:
        raise HTTPException(422, str(e))

    if df.empty:
        raise HTTPException(422, "No valid records found after cleaning.")

    records = utils.df_to_records(df)
    employees = [schemas.EmployeeCreate(**r) for r in records]
    inserted, db_dupes = crud.bulk_insert_employees(db, employees)
    total_dupes = file_dupes + db_dupes

    _state["last_file_dupes"] = total_dupes
    logger.info(f"Processed: inserted={inserted}, duplicates={total_dupes}")

    return schemas.ProcessResult(
        inserted=inserted,
        duplicates=total_dupes,
        message=f"Successfully inserted {inserted} records. {total_dupes} duplicates skipped.",
    )


@app.get("/employees")
def list_employees(
    search: Optional[str] = Query(None),
    trade: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    skip = (page - 1) * limit
    employees, total = crud.get_employees(db, search=search, trade=trade, status=status, skip=skip, limit=limit)
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": [schemas.EmployeeOut.model_validate(e) for e in employees],
    }


@app.put("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def update_employee(employee_id: int, data: schemas.EmployeeUpdate, db: Session = Depends(get_db)):
    emp = crud.update_employee(db, employee_id, data)
    if not emp:
        raise HTTPException(404, "Employee not found.")
    return emp


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    stats = crud.get_stats(db)
    stats["last_duplicates"] = _state.get("last_file_dupes", 0)
    return stats


@app.get("/trades")
def get_trades(db: Session = Depends(get_db)):
    from models import Employee
    rows = db.query(Employee.trade).distinct().filter(Employee.trade != None, Employee.trade != "").all()
    return [r[0] for r in rows]
