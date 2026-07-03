"""Trusted-device registry — revocable per-user devices.

A separate table (auto-created by create_all_tables(), no migration needed on the
pilot DB). Each row is one device (phone / browser) that has completed a full
login (password + 2FA). The client generates a stable random device id, stored in
its localStorage and sent as the `X-Device-Id` header; the login embeds that id in
the JWT (`did`). If a device is revoked, get_current_user rejects its token, so
that phone must sign in again. Revoking = "sign this device out"; a fresh full
login re-trusts it.
"""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TrustedDevice(Base):
    __tablename__ = 'trusted_devices'
    __table_args__ = (UniqueConstraint('user_id', 'device_id', name='uq_user_device'),)

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    user_id:      Mapped[int]  = mapped_column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    device_id:    Mapped[str]  = mapped_column(String(64), index=True)   # client-generated UUID
    device_name:  Mapped[str | None] = mapped_column(String(120), nullable=True)
    user_agent:   Mapped[str | None] = mapped_column(String(300), nullable=True)
    ip_address:   Mapped[str | None] = mapped_column(String(64), nullable=True)
    revoked:      Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at    = mapped_column(DateTime(timezone=True), nullable=True)
    created_at    = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user = relationship('User')
