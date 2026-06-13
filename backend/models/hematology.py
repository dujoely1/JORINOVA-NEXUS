"""Hematology models: CBC, ESR, Coagulation, Peripheral Smear, Malaria."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class HemResult(Base, TimestampMixin):
    """CBC and complete blood count result."""
    __tablename__ = 'hem_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    hem_id:          Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # CBC parameters
    hgb:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Haemoglobin g/dL
    rbc:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # RBC x10^12/L
    wbc:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # WBC x10^3/µL
    plt:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Platelets x10^3/µL
    hct:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Haematocrit %
    mcv:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # fL
    mch:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # pg
    mchc:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # g/dL
    rdw:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # %
    # Differential
    neut_pct:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lymph_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mono_pct:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    eos_pct:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baso_pct:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    neut_abs:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lymph_abs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Special
    retic_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    esr:       Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Flags
    hgb_flag:  Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    wbc_flag:  Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    plt_flag:  Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    overall_flag: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)

    result_source:    Mapped[str]           = mapped_column(String(10), default='MANUAL')
    analyzer_name:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    critical_notified:Mapped[bool]          = mapped_column(Boolean, default=False)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_classification:Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class MalariaResult(Base, TimestampMixin):
    """Malaria RDT and blood smear results."""
    __tablename__ = 'malaria_results'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    mal_id:          Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    test_type:        Mapped[str]           = mapped_column(String(20))  # RDT|SMEAR|BOTH
    rdt_result:       Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # POS|NEG|INVALID
    rdt_brand:        Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    smear_result:     Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    species:          Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # P.falciparum, P.vivax...
    parasitemia_pct:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parasitemia_grade:Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # +, ++, +++, ++++
    staining:         Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # Giemsa|Leishman
    preparation:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # thick|thin
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class PeripheralSmear(Base, TimestampMixin):
    """Peripheral blood smear morphology report."""
    __tablename__ = 'peripheral_smears'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    smear_id:        Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    microscopist_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # RBC morphology
    rbc_morphology:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # e.g. normocytic normochromic, microcytic hypochromic, sickle cells present
    wbc_morphology:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plt_morphology:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Abnormal cells
    blast_pct:        Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    blast_type:       Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    abnormal_lymph:   Mapped[bool]          = mapped_column(Boolean, default=False)
    sickle_cells:     Mapped[bool]          = mapped_column(Boolean, default=False)
    # Staining
    staining_method:  Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Conclusion
    morphology_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    leukemia_flag:    Mapped[bool]          = mapped_column(Boolean, default=False)
    urgent_review:    Mapped[bool]          = mapped_column(Boolean, default=False)
    image_url:        Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    microscopist = relationship('User', foreign_keys=[microscopist_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
