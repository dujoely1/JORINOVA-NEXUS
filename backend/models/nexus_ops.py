"""Nexus operations models — genomics (MedGenome), AI reflex-test suggestions,
and incoming clinic orders (interoperability intake). Auto-created by
create_all_tables(); no migration needed."""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GenomicEntry(Base):
    """A genomic finding recorded by AI or manually (MedGenome module)."""
    __tablename__ = 'genomic_entries'
    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    patient_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True, index=True)
    pid:           Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    gene:          Mapped[str]           = mapped_column(String(60))
    variant:       Mapped[Optional[str]] = mapped_column(String(120), nullable=True)   # e.g. c.35G>A / p.Gly12Asp
    zygosity:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)     # het / hom
    classification:Mapped[Optional[str]] = mapped_column(String(40), nullable=True)     # pathogenic / VUS / benign
    method:        Mapped[str]           = mapped_column(String(20), default='manual')  # ai | manual
    interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at     = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReflexSuggestion(Base):
    """An additional test the Lab AI suggests; a doctor approves → LabRequest + SMS."""
    __tablename__ = 'reflex_suggestions'
    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    patient_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True, index=True)
    pid:           Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lab_request_id:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    trigger:       Mapped[Optional[str]] = mapped_column(String(160), nullable=True)    # what result triggered it
    suggested_test:Mapped[str]           = mapped_column(String(120))
    reason:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_confidence: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    status:        Mapped[str]           = mapped_column(String(15), default='pending', index=True)  # pending|approved|declined
    approved_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    decided_at     = mapped_column(DateTime(timezone=True), nullable=True)
    created_at     = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExchangeOffer(Base):
    """A near-expiry stock item offered to another hospital (inter-facility exchange)."""
    __tablename__ = 'exchange_offers'
    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    item_name:     Mapped[str]           = mapped_column(String(200))
    category:      Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    quantity:      Mapped[float]         = mapped_column(default=0)
    unit:          Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    expiry_date:   Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    lot_number:    Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    to_hospital:   Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status:        Mapped[str]           = mapped_column(String(15), default='offered', index=True)  # offered|accepted|sent|declined
    note:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at     = mapped_column(DateTime(timezone=True), server_default=func.now())


class IncomingOrder(Base):
    """A test order received from an external clinic system (interoperability intake)."""
    __tablename__ = 'incoming_orders'
    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    source:        Mapped[str]           = mapped_column(String(60), default='clinic')  # clinic | rbc | hl7
    external_ref:  Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    patient_name:  Mapped[str]           = mapped_column(String(160))
    pid:           Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    national_id:   Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    gender:        Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    dob:           Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    district:      Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    ward:          Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    tests:         Mapped[str]           = mapped_column(Text, default='')              # comma-separated
    priority:      Mapped[str]           = mapped_column(String(15), default='routine')
    status:        Mapped[str]           = mapped_column(String(15), default='pending', index=True)  # pending|accepted|rejected
    lab_request_id:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    received_at    = mapped_column(DateTime(timezone=True), server_default=func.now())
