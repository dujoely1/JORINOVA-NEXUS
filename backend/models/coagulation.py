"""Coagulation and haemostasis models."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class CoagResult(Base, TimestampMixin):
    """Coagulation test result (PT, INR, aPTT, Fibrinogen, D-Dimer, etc.)."""
    __tablename__ = 'coag_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    coag_id:         Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    test_code:        Mapped[str]           = mapped_column(String(20))
    # PT|INR|APTT|FIBRIN|DDIMER|TT|REPTILASE
    test_name:        Mapped[str]           = mapped_column(String(80))
    numeric_value:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit:             Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    flag:             Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    reference_lo:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reference_hi:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result_source:    Mapped[str]           = mapped_column(String(10), default='MANUAL')
    analyzer_name:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    clinical_context: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Anticoagulant monitoring
    anticoagulant:    Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    anticoag_target:  Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    anticoag_status:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # THERAPEUTIC|SUBTHERAPEUTIC|SUPRATHERAPEUTIC
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    critical_notified:Mapped[bool]          = mapped_column(Boolean, default=False)
    clinician_notified:Mapped[Optional[str]]= mapped_column(String(100), nullable=True)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class CoagIQC(Base, TimestampMixin):
    """Coagulation Internal Quality Control record."""
    __tablename__ = 'coag_iqc'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    analyte_code: Mapped[str]           = mapped_column(String(15))
    analyte_name: Mapped[str]           = mapped_column(String(50))
    control_level:Mapped[str]           = mapped_column(String(5))   # L1|L2|L3
    lot_number:   Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    target_mean:  Mapped[float]         = mapped_column(Float)
    sd:           Mapped[float]         = mapped_column(Float)
    result_value: Mapped[float]         = mapped_column(Float)
    z_score:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    westgard_rule:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status:       Mapped[str]           = mapped_column(String(10), default='PASS')
    analyzer_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    operator_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    operator_name:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
