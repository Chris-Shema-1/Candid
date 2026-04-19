from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class EmployeeBase(BaseModel):
    name: Optional[str] = None
    national_id: str
    phone: Optional[str] = None
    trade: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None
    status: Optional[str] = "Pending"
    remarks: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    status: Optional[str] = None
    remarks: Optional[str] = None


class EmployeeOut(EmployeeBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProcessResult(BaseModel):
    inserted: int
    duplicates: int
    message: str
