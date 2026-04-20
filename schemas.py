from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ── Auth ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Employee ───────────────────────────────────────────────────────────────
class EmployeeBase(BaseModel):
    name: Optional[str] = None
    national_id: str
    phone: Optional[str] = None
    trade: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None
    status: Optional[str] = "Pending"
    remarks: Optional[str] = None
    driving_license_no: Optional[str] = None
    driving_license_type: Optional[str] = None
    last_employer: Optional[str] = None
    supporting_doc_path: Optional[str] = None
    age: Optional[int] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    status: Optional[str] = None
    remarks: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None
    driving_license_no: Optional[str] = None
    driving_license_type: Optional[str] = None
    last_employer: Optional[str] = None
    age: Optional[int] = None


class EmployeeOut(EmployeeBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProcessResult(BaseModel):
    inserted: int
    duplicates: int
    message: str
