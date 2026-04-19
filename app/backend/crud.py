from sqlalchemy.orm import Session
from sqlalchemy import or_
from models import Employee
from schemas import EmployeeCreate, EmployeeUpdate
from typing import List, Optional


def get_employees(
    db: Session,
    search: Optional[str] = None,
    trade: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    query = db.query(Employee)
    if search:
        query = query.filter(
            or_(
                Employee.name.ilike(f"%{search}%"),
                Employee.national_id.ilike(f"%{search}%"),
                Employee.phone.ilike(f"%{search}%"),
            )
        )
    if trade:
        query = query.filter(Employee.trade.ilike(f"%{trade}%"))
    if status:
        query = query.filter(Employee.status == status)
    total = query.count()
    return query.offset(skip).limit(limit).all(), total


def get_employee(db: Session, employee_id: int):
    return db.query(Employee).filter(Employee.id == employee_id).first()


def bulk_insert_employees(db: Session, employees: List[EmployeeCreate]):
    inserted = 0
    duplicates = 0
    existing_ids = {
        row[0] for row in db.query(Employee.national_id).all()
    }
    new_records = []
    for emp in employees:
        if emp.national_id in existing_ids:
            duplicates += 1
        else:
            existing_ids.add(emp.national_id)
            new_records.append(Employee(**emp.model_dump()))
            inserted += 1
    if new_records:
        db.bulk_save_objects(new_records)
        db.commit()
    return inserted, duplicates


def update_employee(db: Session, employee_id: int, data: EmployeeUpdate):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(emp, field, value)
    db.commit()
    db.refresh(emp)
    return emp


def get_stats(db: Session):
    total = db.query(Employee).count()
    pending = db.query(Employee).filter(Employee.status == "Pending").count()
    employed = db.query(Employee).filter(Employee.status == "Employed").count()
    return {"total": total, "pending": pending, "employed": employed}
