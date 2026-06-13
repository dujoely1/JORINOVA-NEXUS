"""User / Staff model."""
from typing import Optional
from sqlalchemy import String, Boolean, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = 'users'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    username:    Mapped[str]           = mapped_column(String(150), unique=True, index=True)
    email:       Mapped[str]           = mapped_column(String(254), unique=True, index=True)
    first_name:  Mapped[str]           = mapped_column(String(150), default='')
    last_name:   Mapped[str]           = mapped_column(String(150), default='')
    hashed_password: Mapped[str]       = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default='lab_technician')
    # Roles: super_admin | lab_manager | lab_technician | pathologist |
    #        receptionist | doctor | nurse | phlebotomist | pharmacist |
    #        finance | radiographer | it_admin | viewer
    department:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    phone:       Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    profile_photo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    face_encoding:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fingerprint_hash:Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_active:   Mapped[bool]          = mapped_column(Boolean, default=True)
    is_superuser:Mapped[bool]          = mapped_column(Boolean, default=False)
    two_factor_enabled: Mapped[bool]   = mapped_column(Boolean, default=False)
    totp_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    login_attempts: Mapped[int]        = mapped_column(Integer, default=0)
    voice_code:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    preferred_language: Mapped[str]    = mapped_column(String(5), default='en')

    hospital_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)
    hospital     = relationship('Hospital', back_populates='staff', foreign_keys=[hospital_id])
    login_logs   = relationship('LoginLog', back_populates='user', cascade='all, delete-orphan')

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip() or self.username


class LoginLog(Base):
    __tablename__ = 'login_logs'

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]           = mapped_column(Integer, ForeignKey('users.id', ondelete='CASCADE'))
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    success:    Mapped[bool]          = mapped_column(Boolean, default=False)
    method:     Mapped[str]           = mapped_column(String(20), default='password')
    from sqlalchemy import DateTime, func
    timestamp   = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User', back_populates='login_logs')
