"""Notifications model: in-app alerts, SMS queue, critical value alerts."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class Notification(Base, TimestampMixin):
    """In-app notification record."""
    __tablename__ = 'notifications'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    recipient_id: Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    sender_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    notif_type:   Mapped[str]           = mapped_column(String(30))
    # CRITICAL_RESULT|LAB_RESULT_READY|SYSTEM_ALERT|QC_FAILURE|ESCALATION|REMINDER
    title:        Mapped[str]           = mapped_column(String(200))
    body:         Mapped[str]           = mapped_column(Text)
    priority:     Mapped[str]           = mapped_column(String(10), default='NORMAL')
    # CRITICAL|HIGH|NORMAL|LOW

    # Related entity
    entity_type:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    entity_id:    Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    patient_pid:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    action_url:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Status
    is_read:      Mapped[bool]          = mapped_column(Boolean, default=False)
    read_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged: Mapped[bool]          = mapped_column(Boolean, default=False)
    ack_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Delivery
    delivered_sms:   Mapped[bool] = mapped_column(Boolean, default=False)
    delivered_email: Mapped[bool] = mapped_column(Boolean, default=False)

    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    recipient = relationship('User', foreign_keys=[recipient_id])
    sender    = relationship('User', foreign_keys=[sender_id])


class SMSQueue(Base, TimestampMixin):
    """SMS message queue for patient notifications."""
    __tablename__ = 'sms_queue'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    phone_number:Mapped[str]           = mapped_column(String(20))
    message:     Mapped[str]           = mapped_column(Text)
    sms_type:    Mapped[str]           = mapped_column(String(30))
    # RESULT_READY|CRITICAL_VALUE|APPOINTMENT|GENERIC
    patient_pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    patient_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    status:      Mapped[str]           = mapped_column(String(15), default='QUEUED')
    # QUEUED|SENT|DELIVERED|FAILED
    sent_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_msg:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    retry_count: Mapped[int]           = mapped_column(Integer, default=0)
    hospital_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
