from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    national_id = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String)
    trade = Column(String)
    experience = Column(String)
    education = Column(String)
    status = Column(String, default="Pending")
    remarks = Column(String)
    # Extended fields
    driving_license_no = Column(String)
    driving_license_type = Column(String)
    last_employer = Column(String)
    supporting_doc_path = Column(String)
    age = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
