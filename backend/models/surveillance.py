"""Epidemic Surveillance models: signals, outbreaks, disease tracking."""
from typing import Optional
from datetime import datetime, date
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class SurveillanceSignal(Base, TimestampMixin):
    """Automated outbreak / unusual case clustering signal."""
    __tablename__ = 'surveillance_signals'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    signal_id:    Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    signal_date:  Mapped[date]          = mapped_column(Date, index=True)
    department:   Mapped[str]           = mapped_column(String(30))
    test_code:    Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    disease:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Malaria|TB|MDR_Klebsiella|MRSA|Cholera|Typhoid...
    case_count_7d:Mapped[int]           = mapped_column(Integer, default=0)
    baseline_rate:Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pct_increase: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    alert_level:  Mapped[str]           = mapped_column(String(15), default='WATCH')
    # WATCH|WARNING|ALERT|EMERGENCY
    ai_confidence:Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # low|medium|high
    suspected_pathogen:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    recommended_action:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_confirmed: Mapped[bool]          = mapped_column(Boolean, default=False)
    confirmed_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    resolved:     Mapped[bool]          = mapped_column(Boolean, default=False)
    resolved_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    district:     Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_generated: Mapped[bool]          = mapped_column(Boolean, default=True)


class DiseaseTracking(Base, TimestampMixin):
    """Daily disease case tracking for epidemiology dashboard."""
    __tablename__ = 'disease_tracking'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    track_date:  Mapped[date]          = mapped_column(Date, index=True)
    disease:     Mapped[str]           = mapped_column(String(80), index=True)
    department:  Mapped[str]           = mapped_column(String(30))
    new_cases:   Mapped[int]           = mapped_column(Integer, default=0)
    total_cases: Mapped[int]           = mapped_column(Integer, default=0)
    positive_rate:Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # %
    hospital_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    district:    Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
