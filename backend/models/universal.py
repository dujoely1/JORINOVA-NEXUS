"""
Universal Operators – lab-neutral staff roles that span any department.
12 roles run the full hospital cycle; always fill all 12 positions before stopping.
"""

ENUMERATED_OPERATORS = [
    # ── Lab-side ──────────────────────────────────────────────────────────────
    ('LAB_TECH',         'Lab Technician',        'Performs analyser runs and manual tests',                1),
    ('PATHOLOGIST',      'Pathologist',           'Reviews morphology and authorises reports',              2),
    ('QC_OFFICER',       'QC Officer',            'Manages QC schedules and investigates breaches',         3),
    ('DATA_STEWARD',     'Data Steward',          'Handles QC/LIS data-logging and quality records',        4),
    ('RESULT_COORD',     'Result Coordinator',    'Routes reports to clinicians and manages courier pickups',5),
    ('COURIER',          'Courier',               'Physically transports specimens and reports',            6),
    # ── Clinical ─────────────────────────────────────────────────────────────
    ('UNIT_DOCTOR',      'Unit Doctor',           'Requests tests, interprets results at ward level',       7),
    ('NURSE',            'Nurse',                 'Collects specimens and enters clinical notes',           8),
    ('CLINICIAN',        'Clinician',             'Authorises reports and provides specialist input',       9),
    ('GYNAECOLOGIST',    'Gynaecologist',         'Supervises obstetric/lab investigation pathway',        10),
    ('ONCOLOGIST',        'Oncologist',            'Interprets tumour-marker trajectories',                11),
    ('RADIOLOGIST',      'Radiologist',           'Correlates imaging with lab results',                  12),
]


ROLETYPE_ORDER = {row[0]: row[2] for row in ENUMERATED_OPERATORS}


from typing import Optional
from datetime import date, datetime
from sqlalchemy import (String, Boolean, Integer, Float, ForeignKey,
                        DateTime, Text, Date, Time, func, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class UniversalOperator(Base, TimestampMixin):
    """
    One row per physical person who touches the LIS.
    Carries all 12 possible role flags so a single staff member can
    operate in several roles without duplication.
    """
    __tablename__ = 'universal_operators'
    __table_args__ = {'extend_existing': True}

    id:            Mapped[int]  = mapped_column(Integer, primary_key=True)
    short_name:    Mapped[str]  = mapped_column(String(40), unique=True, index=True)
    full_name:     Mapped[str]  = mapped_column(String(120))
    role_type:     Mapped[str]  = mapped_column(String(30), index=True)
    # PRIMARY role flag – used for quick filtering
    roles:         Mapped[str]  = mapped_column(Text)       # JSON list of all role flags
    email:         Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    phone:         Mapped[Optional[str]] = mapped_column(String(20),  nullable=True)

    # Working hours per day (0–24 float, e.g. 8.0)
    default_hours_per_day: Mapped[float] = mapped_column(Float, default=8.0)
    # Preferred start/end strings "HH:MM"
    shift_start:   Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    shift_end:     Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    is_active:     Mapped[bool] = mapped_column(Boolean, default=True)
    hospital_id:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    departments = relationship(
        'LaboratoryDepartment',
        secondary='department_operators',
        back_populates='assigned_operators',
    )

    @property
    def role_priority(self) -> int:
        return ROLETYPE_ORDER.get(self.role_type, 99)


class DepartmentOperator(Base, TimestampMixin):
    """Junction: operator ↔ department. Enables "show all HEM staff" queries."""
    __tablename__ = 'department_operators'
    __table_args__ = (
        UniqueConstraint('operator_id', 'department_id', name='uq_dept_operator'),
        {'extend_existing': True},
    )

    id:            Mapped[int]  = mapped_column(Integer, primary_key=True)
    operator_id:   Mapped[int]  = mapped_column(Integer, ForeignKey('universal_operators.id'))
    department_id: Mapped[int]  = mapped_column(Integer, ForeignKey('lab_departments.id'))
    is_lead:       Mapped[bool] = mapped_column(Boolean, default=False)
    notes:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    operator   = relationship('UniversalOperator', overlaps='departments,assigned_operators')
    department = relationship('LaboratoryDepartment', overlaps='assigned_operators,departments')


class OperatorShiftLog(Base, TimestampMixin):
    """Daily on-duty log for each operator."""
    __tablename__ = 'operator_shift_logs'
    __table_args__ = (
        UniqueConstraint('operator_id', 'shift_date', 'shift_name', name='uq_op_shift'),
        {'extend_existing': True},
    )

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    operator_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('universal_operators.id'))
    shift_date:   Mapped[date]          = mapped_column(Date, index=True)
    shift_name:   Mapped[str]           = mapped_column(String(20), default='Morning')
    clock_in:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    clock_out:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hours_worked: Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
    status:       Mapped[str]           = mapped_column(String(15), default='SCHEDULED')
    notes:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    operator = relationship('UniversalOperator')
