"""Laboratory workflow models: LabRequest, Sample, LabResult, CriticalBook."""
from typing import Optional
from datetime import datetime
from sqlalchemy import (String, Boolean, Integer, Float, ForeignKey,
                        Text, DateTime, JSON, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class LabRequest(Base, TimestampMixin):
    __tablename__ = 'lab_requests'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    lab_id:        Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    patient_id:    Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    requested_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    received_by_id: Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    doctor_name:   Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ward:          Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    diagnosis:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status:        Mapped[str]           = mapped_column(String(20), default='pending')
    # pending|received|in_progress|validated|released|cancelled
    emergency_level: Mapped[str]         = mapped_column(String(10), default='routine')
    # routine|urgent|stat
    is_high_risk:  Mapped[bool]          = mapped_column(Boolean, default=False)
    request_date:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    received_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pid:           Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:           Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    patient        = relationship('Patient', back_populates='lab_requests')
    requested_by   = relationship('User', foreign_keys=[requested_by_id])
    received_by    = relationship('User', foreign_keys=[received_by_id])
    samples        = relationship('Sample', back_populates='lab_request', cascade='all, delete-orphan')
    results        = relationship('LabResult', back_populates='lab_request')


class Sample(Base, TimestampMixin):
    __tablename__ = 'samples'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    sid:          Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    barcode:      Mapped[str]           = mapped_column(String(50), unique=True, index=True)
    lab_request_id:Mapped[int]          = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    department_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_departments.id'), nullable=True)
    tube_type:    Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    volume_ml:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    status:       Mapped[str]           = mapped_column(String(20), default='received')
    # received|processing|analysis|validated|released|rejected|disposed
    is_high_risk: Mapped[bool]          = mapped_column(Boolean, default=False)
    tat_start:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    label_printed:Mapped[bool]          = mapped_column(Boolean, default=False)

    lab_request  = relationship('LabRequest', back_populates='samples')
    results      = relationship('LabResult', back_populates='sample')


class LabResult(Base, TimestampMixin):
    __tablename__ = 'lab_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    sample_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('samples.id'), nullable=True)
    test_id:         Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('test_catalog.id'), nullable=True)
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    authorized_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    # Denormalized quick refs
    pid:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sid:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Result data
    result_type:      Mapped[str]           = mapped_column(String(15), default='QUANTITATIVE')
    value:            Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    numeric_value:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    unit:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    qualitative_value:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Reference
    reference_min:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    reference_max:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    flag:             Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    # N|L|H|LL|HH|POS|NEG

    # Source tracking
    result_source:    Mapped[str]           = mapped_column(String(10), default='MANUAL')  # MANUAL|AUTOMATED
    entry_mode:       Mapped[str]           = mapped_column(String(15), default='SINGLE')
    analyzer_name:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Workflow state
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    authorized:       Mapped[bool]          = mapped_column(Boolean, default=False)
    authorized_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:           Mapped[str]           = mapped_column(String(10), default='PENDING')
    # PENDING|VALIDATED|REJECTED|RELEASED

    # Critical
    requires_document:    Mapped[bool]          = mapped_column(Boolean, default=False)
    critical_doc_uploaded:Mapped[bool]          = mapped_column(Boolean, default=False)

    # AI interpretation
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_layer:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    entered_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lab_request  = relationship('LabRequest', back_populates='results')
    sample       = relationship('Sample', back_populates='results')
    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
    authorized_by= relationship('User', foreign_keys=[authorized_by_id])
    test         = relationship('TestCatalog')


class CriticalResultBook(Base):
    __tablename__ = 'critical_result_book'

    id:                 Mapped[int]           = mapped_column(Integer, primary_key=True)
    entry_number:       Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    patient_id:         Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    lab_request_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    test_name:          Mapped[str]           = mapped_column(String(120))
    result_value:       Mapped[str]           = mapped_column(String(200))
    unit:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    flag:               Mapped[str]           = mapped_column(String(3))
    reference_range:    Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    validated_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    clinician_notified: Mapped[bool]          = mapped_column(Boolean, default=False)
    clinician_name:     Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notification_method:Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    read_back_confirmed:Mapped[bool]          = mapped_column(Boolean, default=False)
    pqc_hash:           Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    archived_at:        Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient      = relationship('Patient')
    validated_by = relationship('User', foreign_keys=[validated_by_id])
