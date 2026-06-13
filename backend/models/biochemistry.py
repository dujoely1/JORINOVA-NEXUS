"""Biochemistry Department models: Worklist, WorklistItem, BiochemResult, BiochemBook."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class BiochemWorklist(Base, TimestampMixin):
    __tablename__ = 'biochem_worklists'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    worklist_id:  Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    analyzer_name:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    department_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_departments.id'), nullable=True)
    priority:     Mapped[str]           = mapped_column(String(10), default='ROUTINE')
    status:       Mapped[str]           = mapped_column(String(15), default='pending')
    created_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    items        = relationship('WorklistItem', back_populates='worklist', cascade='all, delete-orphan')
    created_by   = relationship('User', foreign_keys=[created_by_id])


class WorklistItem(Base):
    __tablename__ = 'worklist_items'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    worklist_id:    Mapped[int]           = mapped_column(Integer, ForeignKey('biochem_worklists.id'))
    lab_request_id: Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    test_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    section:        Mapped[str]           = mapped_column(String(10), default='GENERAL')
    lid:            Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    priority:       Mapped[str]           = mapped_column(String(10), default='ROUTINE')
    status:         Mapped[str]           = mapped_column(String(15), default='pending')
    position:       Mapped[int]           = mapped_column(Integer, default=1)

    worklist     = relationship('BiochemWorklist', back_populates='items')
    lab_request  = relationship('LabRequest')
    test         = relationship('TestCatalog')
    results      = relationship('BiochemResult', back_populates='worklist_item')


class BiochemResult(Base, TimestampMixin):
    __tablename__ = 'biochem_results'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    worklist_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('worklist_items.id'), nullable=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    test_id:          Mapped[int]           = mapped_column(Integer, ForeignKey('test_catalog.id'))
    section:          Mapped[str]           = mapped_column(String(10), default='GENERAL')
    result_value:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    numeric_value:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    unit:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reference_min:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    reference_max:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    reference_range_text: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    flag:             Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    qualitative_value:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    result_source:    Mapped[str]           = mapped_column(String(10), default='MANUAL')
    analyzer_name:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    entry_mode:       Mapped[str]           = mapped_column(String(15), default='SINGLE')
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    authorized:       Mapped[bool]          = mapped_column(Boolean, default=False)
    authorized_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    authorized_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    entered_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    entered_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    status:           Mapped[str]           = mapped_column(String(10), default='PENDING')
    requires_document:Mapped[bool]          = mapped_column(Boolean, default=False)
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_layer:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    worklist_item= relationship('WorklistItem', back_populates='results')
    lab_request  = relationship('LabRequest')
    patient      = relationship('Patient')
    test         = relationship('TestCatalog')
    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
    authorized_by= relationship('User', foreign_keys=[authorized_by_id])


class BiochemBook(Base):
    __tablename__ = 'biochem_critical_book'

    id:                 Mapped[int]           = mapped_column(Integer, primary_key=True)
    entry_number:       Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    patient_id:         Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    lab_request_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    test_name:          Mapped[str]           = mapped_column(String(120))
    result_value:       Mapped[str]           = mapped_column(String(200))
    unit:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    flag:               Mapped[str]           = mapped_column(String(3))
    reference_range:    Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    section:            Mapped[str]           = mapped_column(String(10))
    validated_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    clinician_notified: Mapped[bool]          = mapped_column(Boolean, default=False)
    clinician_name:     Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notification_method:Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    read_back_confirmed:Mapped[bool]          = mapped_column(Boolean, default=False)
    pqc_hash:           Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    archived_at:        Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient      = relationship('Patient')
    validated_by = relationship('User', foreign_keys=[validated_by_id])
