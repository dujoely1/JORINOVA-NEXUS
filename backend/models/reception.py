"""
Reception (OPD + IPD) source model.

One model `ReceptionVisit` with a `visit_type` discriminator covers both
reception books:

  reception_opd  → visit_type='OPD' (walk-in / referred outpatient)
  reception_ipd  → visit_type='IPD' (ward / inpatient sample request)

This is the front-door log: every patient that arrived for lab services
(walk-in, ward request, ED) gets a row here, independent of whether a
LabRequest is ultimately created. Lets the reception book be queried
even before tests are decided.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class ReceptionVisit(Base, TimestampMixin):
    """One row per reception arrival — OPD or IPD."""
    __tablename__ = 'reception_visits'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    visit_no:          Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    visit_type:        Mapped[str]           = mapped_column(String(5), index=True)  # OPD|IPD|ED
    patient_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    lid:               Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)

    # Patient snapshot at visit time
    patient_name:      Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    age:               Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "42y" / "6m" — string for flexibility
    sex:               Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    phone:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Clinical context
    referring_doctor:  Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    attending_doctor:  Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # IPD only
    ward:              Mapped[Optional[str]] = mapped_column(String(60), nullable=True)   # IPD only
    bed_number:        Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # IPD only
    clinical_indication:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tests_ordered:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)         # comma list / JSON

    # Sample logistics (IPD)
    sample_collected_at:Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    # Billing (OPD inline)
    payment_method:    Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    amount_rwf:        Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Urgency
    urgency:           Mapped[str]           = mapped_column(String(10), default='routine')
    # routine|urgent|stat

    # Workflow
    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='REGISTERED')
    # REGISTERED|PHLEBOTOMY|RECEIVED|BILLED|VALIDATED|CANCELLED
    receptionist_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    receptionist = relationship('User', foreign_keys=[receptionist_id])
    received_by  = relationship('User', foreign_keys=[received_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
