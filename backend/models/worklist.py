"""
Worklist Preparation Models
============================
Handles sample reception, automatic test routing, SID/CID/rack number
generation, and specimen label tracking.

SID (Specimen ID): {3-LETTER-ACRONYM}-{NN}  e.g. HEM-01, SER-01, URI-01
  - Scoped per patient + lab_request (barcode)
  - Increments for rejections within the same request
  - Resets to 01 for each new barcode/new day

CID (Culture ID):  C-{NN}  e.g. C-01, C-02
  - Global per microbiology department per day
  - Used on culture plates (blood culture, urine culture, etc.)

Rack No: 1, 2, 3 ...
  - Global per department per shift
  - Resets each shift (or daily — configurable via shift settings)
  - Used for analyzer ordering and tube rack position
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Index,
    Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


# ── Specimen Type Master ──────────────────────────────────────────────────────

class SpecimenTypeConfig(Base):
    """
    Master catalogue of specimen types.
    The 3-letter acronym is the prefix for SIDs (HEM, SER, URI …).
    """
    __tablename__ = 'specimen_type_config'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    acronym:         Mapped[str]           = mapped_column(String(3),  unique=True, index=True)
    name:            Mapped[str]           = mapped_column(String(80))
    description:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Primary department this specimen goes to (may route to multiple)
    primary_department: Mapped[str]        = mapped_column(String(40))
    # Tube / container colour for visual identification
    tube_color:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # True → generates a Culture ID (CID) for plate labelling
    generates_cid:   Mapped[bool]          = mapped_column(Boolean, default=False)
    # Typical collection volume
    volume_ml:       Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active:       Mapped[bool]          = mapped_column(Boolean, default=True)
    sort_order:      Mapped[int]           = mapped_column(Integer, default=0)


# ── Daily Counters ────────────────────────────────────────────────────────────

class DailySIDCounter(Base):
    """
    Per-patient, per-lab-request, per-specimen-type daily counter.
    Drives the NN suffix in HEM-01, HEM-02 (rejection replacement).
    One row per (patient_id, lab_request_id, acronym, counter_date).
    """
    __tablename__ = 'daily_sid_counter'
    __table_args__ = (
        UniqueConstraint('patient_id', 'lab_request_id', 'acronym', 'counter_date',
                         name='uq_sid_counter'),
    )

    id:             Mapped[int]  = mapped_column(Integer, primary_key=True)
    patient_id:     Mapped[int]  = mapped_column(Integer, ForeignKey('patients.id'))
    lab_request_id: Mapped[int]  = mapped_column(Integer, ForeignKey('lab_requests.id'))
    acronym:        Mapped[str]  = mapped_column(String(3))
    counter_date:   Mapped[date] = mapped_column(Date)
    last_number:    Mapped[int]  = mapped_column(Integer, default=0)


class DailyRackCounter(Base):
    """
    Per-department, per-shift sequential rack/position number.
    First sample in hematology today = 1, second = 2 …
    Resets every shift (configurable).
    Used by analysts for analyzer loading order and tube rack positions.
    """
    __tablename__ = 'daily_rack_counter'
    __table_args__ = (
        UniqueConstraint('department', 'counter_date', 'shift_name',
                         name='uq_rack_counter'),
    )

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    department:   Mapped[str]  = mapped_column(String(40))
    counter_date: Mapped[date] = mapped_column(Date)
    shift_name:   Mapped[str]  = mapped_column(String(20), default='Morning')
    last_number:  Mapped[int]  = mapped_column(Integer, default=0)


# ─── 24-hour Cross-Shift Counter ───────────────────────────────────────────────

class Daily24hRackCounter(Base):
    """
    Cross-shift, cross-midnight rack/position counter.
    Unlike DailyRackCounter (resets each shift), this counter increments
    continuously from 1 until midnight, then starts again at 1 the next day.

    Layout per rack (24-slot grid):
        Floor   = rack_number // 24  (0-indexed floor row)
        Column  = rack_number %  24  (0-indexed slot within floor)
        Slot #  = column + 1         (1-indexed slot label shown on tube)

    Example for rack_number = 31:
        Floor   = 31 // 24  = 1
        Column  = 31 %  24  = 7
        Slot #  = 8          → Floor-1 slot-8

    Rack increment happens when there is NO ActiveReception entry with
    rack_number == None for the given department-date; that is the moment
    a new active reception is being opened and the sample is first to use
    a new rack slot.
    """
    __tablename__ = 'daily_24h_rack_counter'
    __table_args__ = (
        UniqueConstraint('department', 'counter_date', name='uq_24h_rack_counter'),
        {'extend_existing': True},
    )

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    department:   Mapped[str]  = mapped_column(String(40), index=True)
    counter_date: Mapped[date] = mapped_column(Date,                          index=True)
    last_number:  Mapped[int]  = mapped_column(Integer, default=0)


# ─── 24-h Reception ─────────────────────────────────────────────────────────────

class SampleTable(Base):
    """
    One row per reception container opened on the analyser (receipt plate).
    Combines the pre_analytical QC state, AI suggestion note, and the
    post-analytical sample passed/failed/rerun verdict in a single table
    so the UI can show a complete quality arc per rack slot.

    Naming  :  <dept-abbr>_stain_<date>  (e.g. HEM_stain_2025-05-20)
    Suffixes :  derived from analyst_metadata  @ su_ass (serial upload assembly)
                OR explicit suffix arg passed at slot-open time.
    """
    __tablename__ = 'sample_tables'
    __table_args__ = {'extend_existing': True}

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)

    # Identity
    table_name:      Mapped[str]           = mapped_column(String(80),  unique=True, index=True)
    department:      Mapped[str]           = mapped_column(String(40),  index=True)
    worklist_date:   Mapped[date]          = mapped_column(Date,        index=True)
    shift_name:      Mapped[str]           = mapped_column(String(20),  default='Morning')

    # Rack slot geometry
    rack_number:     Mapped[int]           = mapped_column(Integer,     index=True)
    column:          Mapped[int]           = mapped_column(Integer)          # 0-indexed within floor
    slot_number:     Mapped[int]           = mapped_column(Integer)          # 1-indexed label

    # Patient / specimen link
    patient_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    lab_request_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    worklist_entry_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('worklist_entries.id'), nullable=True)
    sid:             Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    barcode:         Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # ── Pre-analytical ────────────────────────────────────────────────────────
    pre_analytical:  Mapped[str]           = mapped_column(String(20), default='PASS')
    # PASS | FAIL | PENDING

    # ── AI suggestion ─────────────────────────────────────────────────────────
    ai_suggestion:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_confidence:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Post-analytical ───────────────────────────────────────────────────────
    post_analytical: Mapped[str]           = mapped_column(String(20), default='PASS')
    # PASS | FAIL | RERUN

    # Audit
    opened_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    opened_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_closed:       Mapped[bool]          = mapped_column(Boolean, default=False)
    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    patient     = relationship('Patient')
    lab_request = relationship('LabRequest')
    worklist_entry = relationship('WorklistEntry')
    opened_by   = relationship('User', foreign_keys=[opened_by_id])


class DailyCIDCounter(Base):
    """
    Global microbiology culture-plate counter per day.
    Plate 1 = C-01, plate 2 = C-02 … regardless of patient.
    """
    __tablename__ = 'daily_cid_counter'
    __table_args__ = (
        UniqueConstraint('counter_date', name='uq_cid_counter'),
    )

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    counter_date: Mapped[date] = mapped_column(Date)
    last_number:  Mapped[int]  = mapped_column(Integer, default=0)


# ── Worklist Entry ────────────────────────────────────────────────────────────

class WorklistEntry(Base, TimestampMixin):
    """
    One row per (department × specimen_type) group within a lab request.
    Multiple tests that need the same specimen type in the same department
    share a single WorklistEntry (same tube / SID).

    Status flow:
      PENDING → RECEIVED → IN_PROGRESS → COMPLETED → RELEASED
                              ↓
                           REJECTED → (new WorklistEntry with is_rejection=True)
    """
    __tablename__ = 'worklist_entries'
    __table_args__ = (
        Index('ix_wl_dept_date', 'department', 'worklist_date'),
        Index('ix_wl_patient',   'patient_id'),
        Index('ix_wl_request',   'lab_request_id'),
    )

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)

    # Links
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    assigned_to_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    # Routing
    department:      Mapped[str]           = mapped_column(String(40), index=True)
    specimen_acronym:Mapped[str]           = mapped_column(String(3))
    specimen_name:   Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # Identifiers
    sid:             Mapped[str]           = mapped_column(String(12), unique=True, index=True)
    # e.g. HEM-01
    rack_number:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # short position number for rack/analyzer (1, 2, 3…)
    cid:             Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # C-01 for microbiology culture plates (NULL for non-culture)

    # Barcode value on the tube (same as lab_request.lab_id unless aliquoted)
    barcode:         Mapped[str]           = mapped_column(String(50), index=True)

    # Priority: routine | urgent | stat
    priority:        Mapped[str]           = mapped_column(String(10), default='routine')

    # Status
    status:          Mapped[str]           = mapped_column(String(15), default='PENDING')
    # PENDING | RECEIVED | IN_PROGRESS | COMPLETED | RELEASED | REJECTED

    # Rejection chain
    is_rejection_replacement: Mapped[bool] = mapped_column(Boolean, default=False)
    original_entry_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('worklist_entries.id'), nullable=True)
    rejection_reason:Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Tests list stored as comma-separated test names for display
    test_names:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    test_ids:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-sep IDs

    # Tube
    tube_color:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    volume_ml:       Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_high_risk:    Mapped[bool]          = mapped_column(Boolean, default=False)

    # TAT tracking
    worklist_date:   Mapped[date]          = mapped_column(Date, index=True)
    shift_name:      Mapped[str]           = mapped_column(String(20), default='Morning')
    received_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Label printing
    label_printed:   Mapped[bool]          = mapped_column(Boolean, default=False)
    label_print_count: Mapped[int]         = mapped_column(Integer, default=0)

    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    lab_request  = relationship('LabRequest')
    patient      = relationship('Patient')
    assigned_to  = relationship('User', foreign_keys=[assigned_to_id])
    original     = relationship('WorklistEntry', remote_side='WorklistEntry.id',
                                foreign_keys=[original_entry_id])
    labels       = relationship('SpecimenLabel', back_populates='worklist_entry',
                                cascade='all, delete-orphan')


# ── Specimen Label Audit ──────────────────────────────────────────────────────

class SpecimenLabel(Base):
    """
    Audit record for every printed specimen label.
    Immutable — one row per print action.
    """
    __tablename__ = 'specimen_labels'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    worklist_entry_id: Mapped[int]           = mapped_column(
        Integer, ForeignKey('worklist_entries.id'))
    label_type:        Mapped[str]           = mapped_column(String(15), default='TUBE')
    # TUBE | PLATE | ALIQUOT | CASSETTE | REQUEST

    # What is actually encoded in the barcode on this label
    barcode_value:     Mapped[str]           = mapped_column(String(50))
    sid:               Mapped[str]           = mapped_column(String(12))
    cid:               Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    printed_at:        Mapped[datetime]      = mapped_column(
        DateTime(timezone=True), server_default=func.now())
    printed_by_id:     Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('users.id'), nullable=True)
    print_count:       Mapped[int]           = mapped_column(Integer, default=1)

    worklist_entry = relationship('WorklistEntry', back_populates='labels')
    printed_by     = relationship('User', foreign_keys=[printed_by_id])
