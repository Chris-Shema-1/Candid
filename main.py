import os
import io
import logging
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd

import models
import crud
import schemas
import utils
import auth
from database import engine, get_db, check_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DOCS_DIR = os.path.join(UPLOAD_DIR, "docs")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)

models.Base.metadata.create_all(bind=engine)
check_connection()

# Seed default admin on first run
_db = next(get_db())
try:
    auth.seed_admin(_db)
finally:
    _db.close()

app = FastAPI(title="Candidate Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_state = {"last_file": None, "last_file_dupes": 0}


# ── Static routes ──────────────────────────────────────────────────────────
@app.get("/")
def serve_home():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/login")
def serve_login():
    return FileResponse(os.path.join(STATIC_DIR, "login.html"))


# ── Auth endpoints ─────────────────────────────────────────────────────────
@app.post("/login", response_model=schemas.TokenResponse)
def login(form: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(401, "Invalid username or password.")
    token = auth.create_access_token({"sub": user.username})
    return schemas.TokenResponse(access_token=token)


@app.post("/register", response_model=schemas.TokenResponse)
def register(form: schemas.RegisterRequest, db: Session = Depends(get_db)):
    user = auth.create_user(db, form.username, form.password)
    token = auth.create_access_token({"sub": user.username})
    return schemas.TokenResponse(access_token=token)


# ── Protected: Upload ──────────────────────────────────────────────────────
@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Invalid file format. Upload CSV or Excel only.")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Uploaded file is empty.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    logger.info(f"File uploaded by {current_user.username}: {filename}")

    try:
        df = utils.read_file(filepath)
    except Exception as e:
        raise HTTPException(400, str(e))

    if df.empty:
        raise HTTPException(400, "File contains no data.")

    df_norm = utils.normalize_columns(df.copy())
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


# ── Protected: Process ─────────────────────────────────────────────────────
@app.post("/process", response_model=schemas.ProcessResult)
def process_file(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
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
    logger.info(f"Processed by {current_user.username}: inserted={inserted}, duplicates={total_dupes}")

    return schemas.ProcessResult(
        inserted=inserted,
        duplicates=total_dupes,
        message=f"Successfully inserted {inserted} records. {total_dupes} duplicates skipped.",
    )


# ── Protected: Employees ───────────────────────────────────────────────────
@app.get("/employees")
def list_employees(
    search: Optional[str] = Query(None),
    trade: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
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


@app.get("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    emp = crud.get_employee(db, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found.")
    return emp


@app.put("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def update_employee(
    employee_id: int,
    data: schemas.EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    emp = crud.update_employee(db, employee_id, data)
    if not emp:
        raise HTTPException(404, "Employee not found.")
    return emp


# ── Protected: Upload supporting document ─────────────────────────────────
@app.post("/employees/{employee_id}/doc")
async def upload_doc(
    employee_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    emp = crud.get_employee(db, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".pdf", ".jpg", ".jpeg", ".png"):
        raise HTTPException(400, "Only PDF and image files are allowed.")

    content = await file.read()
    if not content:
        raise HTTPException(400, "File is empty.")

    filename = f"{employee_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    filepath = os.path.join(DOCS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    rel_path = f"uploads/docs/{filename}"
    crud.update_employee(db, employee_id, schemas.EmployeeUpdate())
    emp.supporting_doc_path = rel_path
    db.commit()
    db.refresh(emp)

    return {"supporting_doc_path": rel_path}


# ── Protected: Serve supporting document ─────────────────────────────────────
@app.get("/docs/{filename}")
def serve_doc(
    filename: str,
    download: bool = Query(False),
    current_user: models.User = Depends(auth.get_current_user),
):
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join(DOCS_DIR, safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(404, "Document not found.")

    ext = os.path.splitext(safe_name)[1].lower()
    media_types = {
        ".pdf":  "application/pdf",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    disposition = f'attachment; filename="{safe_name}"' if download else "inline"

    return FileResponse(filepath, media_type=media_type,
                        headers={"Content-Disposition": disposition})


# ── Protected: Export ──────────────────────────────────────────────────────
@app.get("/export")
def export_employees(
    search: Optional[str] = Query(None),
    trade: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    employees = crud.get_employees_for_export(db, search=search, trade=trade, status=status)
    if not employees:
        raise HTTPException(404, "No records match the current filters.")

    rows = [
        {
            "ID": e.id,
            "Name": e.name,
            "National ID": e.national_id,
            "Phone": e.phone,
            "Trade": e.trade,
            "Experience": e.experience,
            "Education": e.education,
            "Age": e.age,
            "Driving License No": e.driving_license_no,
            "Driving License Type": e.driving_license_type,
            "Last Employer": e.last_employer,
            "Status": e.status,
            "Remarks": e.remarks,
            "Created At": e.created_at,
        }
        for e in employees
    ]

    df = pd.DataFrame(rows)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    filename = f"candidates_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Public: Stats + Trades ─────────────────────────────────────────────────
@app.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    stats = crud.get_stats(db)
    stats["last_duplicates"] = _state.get("last_file_dupes", 0)
    return stats


@app.get("/trades")
def get_trades(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    rows = db.query(models.Employee.trade).distinct().filter(
        models.Employee.trade != None, models.Employee.trade != ""
    ).all()
    return [r[0] for r in rows]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
