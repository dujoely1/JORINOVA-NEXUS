"""Urinalysis models: dipstick, microscopy, special tests."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class DipstickResult(Base, TimestampMixin):
    """11-parameter urine dipstick result."""
    __tablename__ = 'dipstick_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    dip_id:          Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Macroscopic
    colour:      Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    appearance:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # CLEAR|TURBID|HAEMATURIC

    # Dipstick parameters (semi-quantitative)
    ph:          Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sg:          Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Specific gravity
    blood:       Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # NEG|TRACE|1+|2+|3+
    protein:     Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    glucose:     Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    ketones:     Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    bilirubin:   Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    urobilinogen:Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    nitrite:     Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # NEG|POS
    leukocytes:  Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # NEG|TRACE|1+|2+|3+

    # Derived flags
    uti_suspected:       Mapped[bool]  = mapped_column(Boolean, default=False)
    microscopy_required: Mapped[bool]  = mapped_column(Boolean, default=False)
    culture_referred:    Mapped[bool]  = mapped_column(Boolean, default=False)
    overall_flag:        Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # NORMAL|ABNORMAL

    result_source:  Mapped[str]          = mapped_column(String(10), default='MANUAL')
    analyzer_name:  Mapped[Optional[str]]= mapped_column(String(80), nullable=True)
    is_validated:   Mapped[bool]         = mapped_column(Boolean, default=False)
    validated_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:         Mapped[str]          = mapped_column(String(15), default='PENDING')
    notes:          Mapped[Optional[str]]= mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
    microscopy   = relationship('UrineМicroscopy', back_populates='dipstick', uselist=False)


class UrineМicroscopy(Base, TimestampMixin):
    """Urine microscopy result."""
    __tablename__ = 'urine_microscopy'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    micro_id:        Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    dipstick_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('dipstick_results.id'), nullable=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    preparation:     Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rbc_hpf:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # e.g. 0-3, 5-10
    wbc_hpf:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    squamous_epi:    Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # FEW|MODERATE|MANY
    transitional_epi:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    hyaline_casts:   Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    path_casts:      Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bacteria:        Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # NONE|FEW|MODERATE|MANY
    yeast:           Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    crystals:        Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    additional:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    culture_referred:Mapped[bool]          = mapped_column(Boolean, default=False)
    culture_reason:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_validated:    Mapped[bool]          = mapped_column(Boolean, default=False)
    status:          Mapped[str]           = mapped_column(String(15), default='PENDING')

    dipstick  = relationship('DipstickResult', back_populates='microscopy')
    entered_by= relationship('User', foreign_keys=[entered_by_id])
