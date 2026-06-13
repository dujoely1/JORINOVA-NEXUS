"""Patient model — PID/LID dual identity."""
from typing import Optional
from datetime import date
from sqlalchemy import String, Boolean, Integer, ForeignKey, Date, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class Patient(Base, TimestampMixin):
    __tablename__ = 'patients'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    pid:          Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    unique_lab_id:Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True, index=True, comment='LID — global RW-XXXXXXX')

    family_name:  Mapped[str]           = mapped_column(String(100))
    other_names:  Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    date_of_birth:Mapped[Optional[date]]= mapped_column(Date, nullable=True)
    gender:       Mapped[Optional[str]] = mapped_column(String(1), nullable=True)  # M/F
    blood_group:  Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    phone:        Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email:        Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    address:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    national_id:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    insurance_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    insurance_provider: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)

    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)
    hospital      = relationship('Hospital', back_populates='patients')
    lab_requests  = relationship('LabRequest', back_populates='patient')

    @property
    def full_name(self) -> str:
        return f'{self.family_name} {self.other_names or ""}'.strip()

    @property
    def age(self) -> Optional[int]:
        if not self.date_of_birth:
            return None
        from datetime import date as d
        today = d.today()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )
