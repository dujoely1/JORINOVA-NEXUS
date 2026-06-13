"""
Billing Models — JORINOVA NEXUS ALIS-X
========================================
Handles inline billing at reception: auto-billing from test catalog prices
plus manual add-on items.

Status flow:
  DRAFT → CONFIRMED → PAID
            ↓
         CANCELLED

Payment methods:
  CASH | INSURANCE | RSSB | MOMO | CREDIT
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy import (
    Boolean, Float, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from .base import TimestampMixin


class BillingRecord(Base, TimestampMixin):
    """
    One billing record per lab request.
    Created at reception inline — either auto-generated or manually confirmed.
    """
    __tablename__ = 'billing_records'
    __table_args__ = (
        Index('ix_bill_request',  'lab_request_id'),
        Index('ix_bill_patient',  'patient_id'),
        Index('ix_bill_status',   'status'),
        UniqueConstraint('lab_request_id', name='uq_bill_per_request'),
    )

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)

    # Foreign keys
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    created_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    confirmed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    # Status
    status:          Mapped[str]           = mapped_column(String(15), default='DRAFT')
    # DRAFT | CONFIRMED | PAID | CANCELLED

    # Amounts — all in RWF
    subtotal_amount: Mapped[float]         = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float]         = mapped_column(Float, default=0.0)
    total_amount:    Mapped[float]         = mapped_column(Float, default=0.0)
    paid_amount:     Mapped[float]         = mapped_column(Float, default=0.0)
    currency:        Mapped[str]           = mapped_column(String(5),  default='RWF')

    # Payment
    payment_method:  Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # CASH | INSURANCE | RSSB | MOMO | CREDIT
    insurance_name:  Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    insurance_id:    Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    momo_ref:        Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)

    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    lab_request  = relationship('LabRequest')
    patient      = relationship('Patient')
    created_by   = relationship('User', foreign_keys=[created_by_id])
    confirmed_by = relationship('User', foreign_keys=[confirmed_by_id])
    items        = relationship(
        'BillingItem',
        back_populates='billing_record',
        cascade='all, delete-orphan',
        order_by='BillingItem.id',
    )


class BillingItem(Base, TimestampMixin):
    """
    One line item inside a BillingRecord.
    Auto-generated items come from TestCatalog.price (is_auto_billed=True).
    Manually-added items (is_auto_billed=False) may be any service or supply.
    """
    __tablename__ = 'billing_items'
    __table_args__ = (
        Index('ix_bitem_record', 'billing_record_id'),
        Index('ix_bitem_test',   'test_id'),
    )

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    billing_record_id: Mapped[int]           = mapped_column(Integer, ForeignKey('billing_records.id'))

    # Test reference (nullable — manually-added items may have no test_id)
    test_id:           Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('test_catalog.id'), nullable=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)

    # Item details
    item_code:         Mapped[str]           = mapped_column(String(30),  default='')
    item_name:         Mapped[str]           = mapped_column(String(200))
    description:       Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    quantity:          Mapped[int]           = mapped_column(Integer, default=1)
    unit_price:        Mapped[float]         = mapped_column(Float, default=0.0)
    total_price:       Mapped[float]         = mapped_column(Float, default=0.0)
    # total_price is always quantity × unit_price (pre-computed for speed)

    # Flags
    is_auto_billed:    Mapped[bool]          = mapped_column(Boolean, default=True)
    # True  = generated automatically from TestCatalog price
    # False = manually added by receptionist
    is_waived:         Mapped[bool]          = mapped_column(Boolean, default=False)
    waiver_reason:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Relationships
    billing_record = relationship('BillingRecord', back_populates='items')
    test           = relationship('TestCatalog')
