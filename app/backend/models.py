from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.sql import func
from database import Base


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
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_employees_national_id", "national_id"),)
