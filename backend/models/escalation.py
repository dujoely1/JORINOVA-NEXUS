"""Head of Department escalation records."""
from enum import Enum as PyEnum
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class EscalationStatus(str, PyEnum):
    PENDING  = 'pending'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    EXPIRED  = 'expired'


class EscalationRecord(Base, TimestampMixin):
    """
    Audit-grade record of every safety escalation.
    Created when a user persists on a DANGEROUS command or triggers BLOCKED.
    """
    __tablename__ = 'escalation_records'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:         Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    user_name:       Mapped[str]           = mapped_column(String(100))
    user_role:       Mapped[str]           = mapped_column(String(50))

    command_text:    Mapped[str]           = mapped_column(Text)
    danger_category: Mapped[str]           = mapped_column(String(80))
    reason:          Mapped[str]           = mapped_column(Text)

    status:          Mapped[str]           = mapped_column(String(15), default='pending')
    # pending | approved | rejected | expired

    # HoD response
    reviewed_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    reviewed_by_name:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    review_note:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Context
    hospital_id:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    department:      Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    ip_address:      Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    session_id:      Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # Action outcome
    action_executed: Mapped[bool]          = mapped_column(Boolean, default=False)
    execution_note:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user       = relationship('User', foreign_keys=[user_id])
    reviewed_by= relationship('User', foreign_keys=[reviewed_by_id])
