"""Two-factor backup / recovery codes.

A separate table (not a column on users) so it is auto-created by
create_all_tables() with no migration on the existing pilot DB. Each row is one
single-use recovery code, stored only as a hash. Used when the user loses their
authenticator device.
"""
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class TwoFactorBackupCode(Base):
    __tablename__ = 'two_factor_backup_codes'

    id:        Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id:   Mapped[int] = mapped_column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    used:      Mapped[bool] = mapped_column(Boolean, default=False)
    used_at    = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User')
