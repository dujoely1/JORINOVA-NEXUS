"""Core configuration models: Hospital, Department, TestCatalog, ReferenceRange, InterpretationRule, ReflexRule."""
from typing import Optional
from datetime import datetime
from sqlalchemy import (String, Boolean, Integer, Float, ForeignKey,
                        Text, DateTime, JSON, func, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class Hospital(Base, TimestampMixin):
    __tablename__ = 'hospitals'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    name:          Mapped[str]           = mapped_column(String(200), unique=True, index=True)
    address:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    district:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    province:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email:         Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    hospital_type: Mapped[str]           = mapped_column(String(20), default='public')
    has_lab:       Mapped[bool]          = mapped_column(Boolean, default=True)
    rbc_code:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, default=True)

    staff        = relationship('User', back_populates='hospital', foreign_keys='User.hospital_id')
    departments  = relationship('LaboratoryDepartment', back_populates='hospital', cascade='all, delete-orphan')
    patients     = relationship('Patient', back_populates='hospital')


class LaboratoryDepartment(Base):
    __tablename__ = 'lab_departments'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    code:         Mapped[str]           = mapped_column(String(10), unique=True, index=True)
    name:         Mapped[str]           = mapped_column(String(100))
    abbreviation: Mapped[str]           = mapped_column(String(10))
    color_hex:    Mapped[str]           = mapped_column(String(7), default='#0099FF')
    tube_color:   Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    order:        Mapped[int]           = mapped_column(Integer, default=0)
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)

    hospital     = relationship('Hospital', back_populates='departments')
    tests        = relationship('TestCatalog', back_populates='department')
    ref_ranges   = relationship('ReferenceRange', back_populates='department')
    assigned_operators = relationship(
        'UniversalOperator',
        secondary='department_operators',
        back_populates='departments',
    )


class TestCatalog(Base):
    __tablename__ = 'test_catalog'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    code:            Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    name:            Mapped[str]           = mapped_column(String(200))
    short_name:      Mapped[str]           = mapped_column(String(50), default='')
    unit:            Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    specimen_type:   Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tube_type:       Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    tat_hours:       Mapped[float]         = mapped_column(Float, default=2.0)
    price:           Mapped[float]         = mapped_column(Float, default=0.0)
    reference_range: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method:          Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    loinc_code:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active:       Mapped[bool]          = mapped_column(Boolean, default=True)
    order_in_dept:   Mapped[int]           = mapped_column(Integer, default=0)
    department_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_departments.id'), nullable=True)

    department          = relationship('LaboratoryDepartment', back_populates='tests')
    ref_ranges          = relationship('ReferenceRange', back_populates='test')
    interpretation_rules= relationship('TestInterpretationRule', back_populates='test', cascade='all, delete-orphan')
    reflex_rules        = relationship('ReflexTestRule', back_populates='trigger_test', foreign_keys='ReflexTestRule.trigger_test_id', cascade='all, delete-orphan')


class ReferenceRange(Base, TimestampMixin):
    __tablename__ = 'reference_ranges'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    test_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_departments.id'), nullable=True)
    min_value:     Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    max_value:     Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    critical_low:  Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    critical_high: Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    unit:          Mapped[str]           = mapped_column(String(50), default='')
    expected_value:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sex:           Mapped[str]           = mapped_column(String(1), default='')
    age_min_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    age_max_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    method:        Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    version:       Mapped[int]           = mapped_column(Integer, default=1)
    is_active:     Mapped[bool]          = mapped_column(Boolean, default=True)
    source:        Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    test           = relationship('TestCatalog', back_populates='ref_ranges')
    department     = relationship('LaboratoryDepartment', back_populates='ref_ranges')

    def flag_value(self, value: float) -> str:
        if self.critical_low is not None and value <= self.critical_low:
            return 'LL'
        if self.critical_high is not None and value >= self.critical_high:
            return 'HH'
        if self.min_value is not None and value < self.min_value:
            return 'L'
        if self.max_value is not None and value > self.max_value:
            return 'H'
        return 'N'


class TestInterpretationRule(Base):
    __tablename__ = 'test_interpretation_rules'
    __table_args__ = (UniqueConstraint('test_id', 'flag_trigger', 'sex', 'age_group', name='uq_interp_rule'),)

    id:                        Mapped[int]           = mapped_column(Integer, primary_key=True)
    test_id:                   Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    flag_trigger:              Mapped[str]           = mapped_column(String(15), index=True)
    interpretation:            Mapped[str]           = mapped_column(Text)
    clinical_significance:     Mapped[str]           = mapped_column(String(15), default='NORMAL')
    possible_causes:           Mapped[list]          = mapped_column(JSON, default=list)
    recommended_actions:       Mapped[list]          = mapped_column(JSON, default=list)
    requires_doctor_confirmation: Mapped[bool]       = mapped_column(Boolean, default=False)
    doctor_message:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    doctor_urgency:            Mapped[str]           = mapped_column(String(10), default='')
    sex:                       Mapped[str]           = mapped_column(String(1), default='')
    age_group:                 Mapped[str]           = mapped_column(String(10), default='ANY')
    sort_order:                Mapped[int]           = mapped_column(Integer, default=0)
    is_active:                 Mapped[bool]          = mapped_column(Boolean, default=True)

    test = relationship('TestCatalog', back_populates='interpretation_rules')


class ReflexTestRule(Base):
    __tablename__ = 'reflex_test_rules'

    id:                  Mapped[int]           = mapped_column(Integer, primary_key=True)
    trigger_test_id:     Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    trigger_flag:        Mapped[str]           = mapped_column(String(15), index=True)
    suggested_test_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    suggestion_type:     Mapped[str]           = mapped_column(String(15), default='RECOMMENDED')
    reason:              Mapped[str]           = mapped_column(Text)
    note_to_doctor:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    suggested_department:Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    sort_order:          Mapped[int]           = mapped_column(Integer, default=0)
    is_active:           Mapped[bool]          = mapped_column(Boolean, default=True)

    trigger_test   = relationship('TestCatalog', back_populates='reflex_rules', foreign_keys=[trigger_test_id])
    suggested_test = relationship('TestCatalog', foreign_keys=[suggested_test_id])
