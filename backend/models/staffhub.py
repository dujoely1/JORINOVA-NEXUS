"""StaffHub models: staff profiles, shifts, attendance, performance."""
from typing import Optional
from datetime import datetime, date, time
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, Date, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class StaffProfile(Base, TimestampMixin):
    """Extended staff profile linked to User."""
    __tablename__ = 'staff_profiles'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'), unique=True)
    staff_number: Mapped[Optional[str]] = mapped_column(String(30), unique=True, nullable=True)
    department:   Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    designation:  Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    qualification:Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone:        Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    national_id:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    hire_date:    Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contract_type:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # PERMANENT|CONTRACT|LOCUM|INTERN
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Performance
    total_points: Mapped[float]         = mapped_column(Float, default=100.0)
    photo_url:    Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    user        = relationship('User', foreign_keys=[user_id])
    shifts      = relationship('ShiftAssignment', back_populates='staff')
    marks       = relationship('PerformanceMark', back_populates='staff')


class Shift(Base, TimestampMixin):
    """Shift definition (Morning, Afternoon, Night)."""
    __tablename__ = 'shifts'

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
    name:       Mapped[str]           = mapped_column(String(30))  # Morning|Afternoon|Night
    start_time: Mapped[time]          = mapped_column(Time)
    end_time:   Mapped[time]          = mapped_column(Time)
    department: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active:  Mapped[bool]          = mapped_column(Boolean, default=True)
    hospital_id:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class ShiftAssignment(Base, TimestampMixin):
    """Weekly timetable: staff assigned to shift on a date."""
    __tablename__ = 'shift_assignments'

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
    staff_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('staff_profiles.id'))
    shift_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('shifts.id'))
    shift_date: Mapped[date]          = mapped_column(Date, index=True)
    status:     Mapped[str]           = mapped_column(String(15), default='SCHEDULED')
    # SCHEDULED|PRESENT|ABSENT|LATE|ON_LEAVE
    check_in:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    check_out:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes:      Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    staff = relationship('StaffProfile', back_populates='shifts')
    shift = relationship('Shift')


class LeaveRequest(Base, TimestampMixin):
    """Staff leave request."""
    __tablename__ = 'leave_requests'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    staff_id:    Mapped[int]           = mapped_column(Integer, ForeignKey('staff_profiles.id'))
    leave_type:  Mapped[str]           = mapped_column(String(20))  # ANNUAL|SICK|MATERNITY|STUDY|EMERGENCY
    start_date:  Mapped[date]          = mapped_column(Date)
    end_date:    Mapped[date]          = mapped_column(Date)
    days:        Mapped[int]           = mapped_column(Integer, default=1)
    reason:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status:      Mapped[str]           = mapped_column(String(15), default='PENDING')
    # PENDING|APPROVED|REJECTED
    approved_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    note:        Mapped[Optional[str]] = mapped_column(String(300), nullable=True)


class PerformanceMark(Base, TimestampMixin):
    """Performance mark: positive/negative for staff."""
    __tablename__ = 'performance_marks'

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
    staff_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('staff_profiles.id'))
    mark_type:  Mapped[str]           = mapped_column(String(20))  # AUTO|MANUAL
    category:   Mapped[str]           = mapped_column(String(20))
    # TAT_BREACH|QC_FAILURE|MINOR_FAULT|MAJOR_FAULT|CRITICAL_FAULT|EXCEPTIONAL|INNOVATION
    points:     Mapped[float]         = mapped_column(Float)  # negative = deduction, positive = award
    description:Mapped[str]           = mapped_column(String(300))
    issued_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    ref_entity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ref_id:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pqc_signed: Mapped[bool]          = mapped_column(Boolean, default=False)
    pqc_hash:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    staff     = relationship('StaffProfile', back_populates='marks')
    issued_by = relationship('User', foreign_keys=[issued_by_id])
