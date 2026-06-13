"""
ShiftHandover source model.

End-of-shift register: outgoing staff document workload, equipment issues,
pending work, IQC status, and hand it to the incoming staff.

Required by ISO 15189 §5.2.6 (personnel competence + continuity) and the
Rwandan SOP-LAB-016 daily handover template. Each row is one shift on one
department.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime, date
from sqlalchemy import String, Boolean, Integer, ForeignKey, Text, DateTime, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class ShiftHandover(Base, TimestampMixin):
    __tablename__ = 'shift_handovers'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    handover_no:       Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    shift_date:        Mapped[date]          = mapped_column(Date, index=True)
    shift:             Mapped[str]           = mapped_column(String(15), index=True)
    # morning|afternoon|night  (matches the shift filter in records.py)
    department:        Mapped[str]           = mapped_column(String(30), index=True)
    # ALL|HEM|BIOCHEM|MICRO|MOL|SERO|URN|BB|ANAPATH|TOX|RECEPTION

    outgoing_staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    outgoing_staff_name:Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    incoming_staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    incoming_staff_name:Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # Workload counters
    samples_received:  Mapped[int]           = mapped_column(Integer, default=0)
    samples_validated: Mapped[int]           = mapped_column(Integer, default=0)
    samples_pending:   Mapped[int]           = mapped_column(Integer, default=0)
    critical_results:  Mapped[int]           = mapped_column(Integer, default=0)
    rejected_samples:  Mapped[int]           = mapped_column(Integer, default=0)

    # Equipment + IQC
    equipment_issues:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    iqc_status:        Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # All PASS|Warnings noted|Rejections - escalated
    iqc_failures:      Mapped[int]           = mapped_column(Integer, default=0)

    # Continuity
    pending_tasks:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_incidents:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sign-off
    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)  # H if unresolved criticals
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    incoming_signed_at:Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='OPEN')
    # OPEN|HANDED_OVER|VALIDATED (incoming accepted)|AMENDED

    outgoing_staff = relationship('User', foreign_keys=[outgoing_staff_id])
    incoming_staff = relationship('User', foreign_keys=[incoming_staff_id])
    validated_by   = relationship('User', foreign_keys=[validated_by_id])
