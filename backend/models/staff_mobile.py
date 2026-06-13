"""
Staff Mobile Hub models — backend for the Android companion app.

New, self-contained tables (auto-created by create_all_tables on startup, so
no migration is needed). They support: device registration/approval, staff
inventory requests, and field-activity / GeoTrack reports with offline-safe
deduplication via a client-supplied transaction id (`txn_id`).
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base
from .base import TimestampMixin


class MobileDevice(Base, TimestampMixin):
    """An Android device registered to a user. Must be approved by an admin
    before it can act on the user's behalf (photo capture, field reports)."""
    __tablename__ = 'mobile_devices'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    device_id:      Mapped[str]           = mapped_column(String(120), unique=True, index=True)
    device_name:    Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    platform:       Mapped[str]           = mapped_column(String(20), default='android')
    push_token:     Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_approved:    Mapped[bool]          = mapped_column(Boolean, default=False)
    approved_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    approved_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class StaffInventoryRequest(Base, TimestampMixin):
    """A staff request for consumables / reagents / equipment from the app."""
    __tablename__ = 'staff_inventory_requests'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    staff_user_id: Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    item_name:     Mapped[str]           = mapped_column(String(200))
    item_code:     Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    quantity:      Mapped[float]         = mapped_column(Float, default=1.0)
    unit:          Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reason:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status:        Mapped[str]           = mapped_column(String(20), default='PENDING')
    # PENDING|APPROVED|REJECTED|FULFILLED
    handled_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    handled_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    txn_id:        Mapped[Optional[str]] = mapped_column(String(80), unique=True, nullable=True)


class FieldActivity(Base, TimestampMixin):
    """A field-work / outreach / GeoTrack report from the mobile app.
    Photos and sample data are stored as JSON strings; GPS is optional."""
    __tablename__ = 'field_activities'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    staff_user_id: Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    activity_type: Mapped[str]           = mapped_column(String(40), default='OUTREACH')
    # OUTREACH|INVESTIGATION|SAMPLE_COLLECTION|CHECK_IN|CHECK_OUT
    title:         Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    photo_urls:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON list
    sample_data:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    status:        Mapped[str]           = mapped_column(String(20), default='OPEN')
    occurred_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    txn_id:        Mapped[Optional[str]] = mapped_column(String(80), unique=True, nullable=True)
