"""
ResultAmendment — append-only audit table for corrections to validated lab results.

Once a result is validated (status='VALIDATED' or 'RELEASED'), the source row
becomes immutable. Corrections create a ResultAmendment entry capturing the
before/after snapshot, the amender, the reason, and a PQC hash for tamper
evidence. The book views surface the amendment chain so reviewers always see
the original value and every correction.

Polymorphic over result types — uses (source_table, source_id) so a single
table covers HemResult, BiochemResult, CoagResult, SerologyResult,
DipstickResult, PCRResult, ViralLoad, MicroCulture, ParasitologyResult,
and the generic LabResult.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class ResultAmendment(Base):
    __tablename__ = 'result_amendments'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    amendment_number: Mapped[str]           = mapped_column(String(40), unique=True, index=True)
    # Polymorphic pointer
    source_table:     Mapped[str]           = mapped_column(String(40), index=True)
    source_id:        Mapped[int]           = mapped_column(Integer, index=True)
    department:       Mapped[str]           = mapped_column(String(30), index=True)
    # Lineage
    patient_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True, index=True)
    lab_request_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True, index=True)
    replaces_amendment_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('result_amendments.id'), nullable=True
    )
    # What changed
    test_name:        Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    before_value:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_value:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    before_flag:      Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    after_flag:       Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    before_snapshot:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON blob
    after_snapshot:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON blob
    # Why
    reason:           Mapped[str]           = mapped_column(String(40))
    # transcription_error|clinician_clarification|analyzer_recheck|critical_recheck|other
    reason_detail:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Who / when
    amended_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    amended_at:       Mapped[datetime]      = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )
    # Tamper-evidence
    pqc_hash:         Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # Flow back-references
    critical_book_entry: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # If this amendment promoted the result into a critical book, the entry# is logged here.

    amended_by = relationship('User', foreign_keys=[amended_by_id])
    patient    = relationship('Patient')
    replaces   = relationship('ResultAmendment', remote_side=[id])
