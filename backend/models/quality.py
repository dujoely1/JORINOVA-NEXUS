"""Quality Management models: IQC, EQA, SOP, NCR, CAPA."""
from typing import Optional
from datetime import datetime, date
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class IQCResult(Base, TimestampMixin):
    """Internal Quality Control result (for Levey-Jennings charts)."""
    __tablename__ = 'iqc_results'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    department:   Mapped[str]           = mapped_column(String(20))
    analyte_code: Mapped[str]           = mapped_column(String(20))
    analyte_name: Mapped[str]           = mapped_column(String(80))
    control_level:Mapped[str]           = mapped_column(String(5))     # L1|L2|L3
    lot_number:   Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_mean:  Mapped[float]         = mapped_column(Float)
    sd:           Mapped[float]         = mapped_column(Float)
    result_value: Mapped[float]         = mapped_column(Float)
    unit:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    z_score:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    westgard_rule:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 1_2s|1_3s|2_2s|R_4s|4_1s|10x|PASS
    status:       Mapped[str]           = mapped_column(String(10), default='PASS')
    analyzer_name:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    operator_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    operator_name:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    run_date:     Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class EQAResult(Base, TimestampMixin):
    """External Quality Assurance participation record."""
    __tablename__ = 'eqa_results'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    scheme:        Mapped[str]           = mapped_column(String(30))   # RCPA|UK_NEQAS|CAP|RNCL|WHO
    cycle:         Mapped[str]           = mapped_column(String(20))   # 2026/01
    department:    Mapped[str]           = mapped_column(String(20))
    analyte:       Mapped[str]           = mapped_column(String(80))
    your_result:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_value:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit:          Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sdi:           Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Standard Deviation Index
    score:         Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # % score
    method:        Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status:        Mapped[str]           = mapped_column(String(15), default='PENDING')
    # PENDING|SUBMITTED|PASSED|FAILED|BORDERLINE
    comment:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)


class SOP(Base, TimestampMixin):
    """Standard Operating Procedure document record."""
    __tablename__ = 'sops'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    sop_number:    Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    title:         Mapped[str]           = mapped_column(String(200))
    department:    Mapped[str]           = mapped_column(String(30))
    version:       Mapped[str]           = mapped_column(String(10), default='v1.0')
    effective_date:Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    review_date:   Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    author:        Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    approved_by:   Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    approved_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    scope:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status:        Mapped[str]           = mapped_column(String(15), default='CURRENT')
    # CURRENT|DUE_REVIEW|OBSOLETE|DRAFT
    file_url:      Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    hospital_id:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class NCR(Base, TimestampMixin):
    """Non-Conformity Report."""
    __tablename__ = 'ncr_records'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    ncr_number:      Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    ncr_type:        Mapped[str]           = mapped_column(String(40))
    department:      Mapped[str]           = mapped_column(String(30))
    severity:        Mapped[str]           = mapped_column(String(10), default='MINOR')  # MINOR|MAJOR|CRITICAL
    description:     Mapped[str]           = mapped_column(Text)
    immediate_action:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    root_cause:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    capa_required:   Mapped[bool]          = mapped_column(Boolean, default=False)
    status:          Mapped[str]           = mapped_column(String(20), default='OPEN')
    # OPEN|INVESTIGATION|CLOSED
    reported_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    reported_by:     Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    closed_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hospital_id:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    capa_actions = relationship('CAPA', back_populates='ncr')


class CAPA(Base, TimestampMixin):
    """Corrective and Preventive Action."""
    __tablename__ = 'capa_actions'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    capa_number:   Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    ncr_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('ncr_records.id'), nullable=True)
    capa_type:     Mapped[str]           = mapped_column(String(15))   # CORRECTIVE|PREVENTIVE
    description:   Mapped[str]           = mapped_column(Text)
    root_cause:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_taken:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    effectiveness_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to:   Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    assigned_to_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    target_date:   Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effectiveness_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    status:        Mapped[str]           = mapped_column(String(20), default='OPEN')
    # OPEN|IN_PROGRESS|VERIFICATION|CLOSED|OVERDUE
    hospital_id:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    ncr = relationship('NCR', back_populates='capa_actions')
