"""Serology / Immunology models: rapid tests, ELISA, viral markers."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class SerologyResult(Base, TimestampMixin):
    """Serology test result — HIV, HBsAg, HCV, VDRL, Widal, CRP, etc."""
    __tablename__ = 'serology_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    sero_id:         Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    test_code:        Mapped[str]           = mapped_column(String(20))
    test_name:        Mapped[str]           = mapped_column(String(100))
    test_category:    Mapped[str]           = mapped_column(String(20), default='SEROLOGY')
    # HIV|HEPATITIS|STI|AUTOIMMUNE|TUMOUR_MARKER|ALLERGY

    # Qualitative result
    qualitative:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # REACTIVE|NON_REACTIVE|POSITIVE|NEGATIVE|INDETERMINATE|EQUIVOCAL

    # Quantitative / ratio
    numeric_value:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    sco_ratio:        Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Signal/Cutoff
    titre:            Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # e.g. 1:128

    # Method
    method:           Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # RAPID|ELISA|CLIA|WB|TPHA
    result_source:    Mapped[str]           = mapped_column(String(10), default='MANUAL')

    # Flags
    flag:             Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    bsl_2_alert:      Mapped[bool]          = mapped_column(Boolean, default=False)
    confirmatory_required: Mapped[bool]     = mapped_column(Boolean, default=False)
    confirmatory_done:Mapped[bool]          = mapped_column(Boolean, default=False)

    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
