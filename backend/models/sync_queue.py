"""Sync queue models — offline operation storage and device tracking."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Text, Boolean, DateTime, JSON, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class SyncOperation(Base):
    """Server-side record of a sync operation received from a client device."""
    __tablename__ = 'sync_operations'

    id          : Mapped[int]           = mapped_column(Integer, primary_key=True)
    queue_id    : Mapped[str]           = mapped_column(String(36), unique=True, index=True)
    device_id   : Mapped[str]           = mapped_column(String(32), index=True)
    user_id     : Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    # Operation details
    endpoint    : Mapped[str]           = mapped_column(String(200))
    method      : Mapped[str]           = mapped_column(String(10))   # POST|PATCH|PUT|DELETE
    payload     : Mapped[Optional[dict]]= mapped_column(JSON, nullable=True)

    # Outcome
    status      : Mapped[str]           = mapped_column(String(20), default='received')
    # received | applied | conflict | failed | skipped
    result      : Mapped[Optional[dict]]= mapped_column(JSON, nullable=True)
    conflict_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error       : Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timing
    client_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    applied_at  : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship('User', foreign_keys=[user_id])

    def __repr__(self):
        return f'<SyncOp {self.queue_id} {self.method} {self.endpoint} [{self.status}]>'


class DeviceSync(Base, TimestampMixin):
    """Tracks last-seen state per device for delta sync."""
    __tablename__ = 'device_sync'

    id          : Mapped[int]           = mapped_column(Integer, primary_key=True)
    device_id   : Mapped[str]           = mapped_column(String(32), unique=True, index=True)
    user_id     : Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seq    : Mapped[int]           = mapped_column(Integer, default=0)
    network_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 4g | 5g | leo_satellite | geo_satellite | wifi | offline
    ops_synced  : Mapped[int]           = mapped_column(Integer, default=0)
    ops_failed  : Mapped[int]           = mapped_column(Integer, default=0)
    user_agent  : Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    user = relationship('User', foreign_keys=[user_id])
