"""Audit trail model — immutable log of every system action."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class AuditLog(Base):
    """Immutable audit trail. NEVER update or delete rows."""
    __tablename__ = 'audit_logs'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    entity_type:  Mapped[str]           = mapped_column(String(30))
    # PATIENT|LAB|INVENTORY|RESULT|SUPPLIER|SYSTEM|SECURITY|BILLING
    entity_id:    Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    action:       Mapped[str]           = mapped_column(String(20))
    # CREATE|UPDATE|DELETE|VIEW|APPROVE|REJECT|TRANSFER|SCAN|LOGIN|LOGOUT
    performed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    performed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    user_role:    Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source:       Mapped[str]           = mapped_column(String(20), default='MANUAL')
    # MANUAL|AUTOMATED|AI|DEVICE|INTEGRATION|SYSTEM
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    department:   Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    patient_pid:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    patient_lid:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sample_sid:   Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    ip_address:   Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    device_info:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    session_id:   Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    metadata_json:Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON blob
    audit_chain_id:Mapped[Optional[str]]= mapped_column(String(60), nullable=True)
    timestamp:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # NOTE: No TimestampMixin — audit logs use their own timestamp, never updated
