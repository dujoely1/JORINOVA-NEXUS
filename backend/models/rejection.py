"""Sample rejection records — immutable audit book per ISO 15189."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class SampleRejection(Base, TimestampMixin):
    """
    Permanent record of every rejected specimen.
    Cannot be deleted — supports QA reporting and trend analysis.
    """
    __tablename__ = 'sample_rejections'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    rejection_id:     Mapped[str]           = mapped_column(String(25), unique=True, index=True)

    # Sample identifiers
    sid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    lab_request_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)

    # Rejection details
    rejection_code:   Mapped[str]           = mapped_column(String(10))        # e.g. SQ-001
    rejection_name:   Mapped[str]           = mapped_column(String(100))        # e.g. Gross Haemolysis
    rejection_category: Mapped[str]         = mapped_column(String(30))        # specimen_quality
    severity:         Mapped[str]           = mapped_column(String(15))         # critical|high|moderate|low

    # Specimen info
    specimen_type:    Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tube_type:        Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    collection_site:  Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    collected_by:     Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    collected_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Rejection details
    rejected_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    rejected_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rejection_note:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrective_action:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recollect_required:Mapped[bool]         = mapped_column(Boolean, default=True)

    # Notification
    ward_notified:    Mapped[bool]          = mapped_column(Boolean, default=False)
    ward_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    requester_name:   Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # QA tracking
    recollection_done:Mapped[bool]          = mapped_column(Boolean, default=False)
    recollection_sid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    resolved:         Mapped[bool]          = mapped_column(Boolean, default=False)
    department:       Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    hospital_id:      Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Audit
    rejected_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    rejected_by = relationship('User', foreign_keys=[rejected_by_id])
