"""Molecular Biology Department models: PCR, GeneXpert, Viral Load, Genetic Analysis."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class PCRResult(Base, TimestampMixin):
    """PCR test result — MTB, viral, STI, respiratory panel."""
    __tablename__ = 'pcr_results'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    pcr_id:           Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # PCR category
    pcr_category:     Mapped[str]           = mapped_column(String(20))
    # TB|VIRAL|STI|RESPIRATORY|FUNGAL|OTHER
    test_name:        Mapped[str]           = mapped_column(String(150))
    # e.g. "GeneXpert MTB/RIF Ultra", "HIV RNA", "Chlamydia trachomatis"
    target_organism:  Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    # Instrument
    instrument:       Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # GeneXpert|Cobas|Abbott m2000|BioFire|manual
    cartridge_type:   Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    run_number:       Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Result
    result:           Mapped[str]           = mapped_column(String(20), default='PENDING')
    # PENDING|DETECTED|NOT_DETECTED|INVALID|ERROR|INDETERMINATE
    ct_value:         Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    semi_quant:       Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # VERY_LOW|LOW|MEDIUM|HIGH (GeneXpert MTB semi-quantification)

    # Resistance markers (TB-specific)
    rifampicin_resistance: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # DETECTED|NOT_DETECTED|INDETERMINATE
    resistance_markers: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)
    # {"INH": "R", "PZA": "S", "EMB": "S", "FQ": "S"}

    # TB classification (filled from GeneXpert + DST)
    tb_classification: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    # SENSITIVE_TB|RR_TB|MDR_TB|XDR_TB|PRE_XDR_TB

    specimen_type:    Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    specimen_quality: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # ADEQUATE|INADEQUATE|SALIVA_REJECTED

    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    critical_reason:  Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # MDR_TB|XDR_TB|HIGH_VIRAL_LOAD|HIV_DETECTED

    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    # PENDING|RUNNING|COMPLETED|VALIDATED|RELEASED
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    run_started_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    run_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class ViralLoad(Base, TimestampMixin):
    """Viral load quantification — HIV, HBV, HCV."""
    __tablename__ = 'viral_loads'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    vl_id:            Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Virus
    virus:            Mapped[str]           = mapped_column(String(10))
    # HIV|HBV|HCV|CMV|EBV
    assay_name:       Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Abbott RealTime HIV-1, Cobas AmpliPrep/TaqMan
    instrument:       Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Quantitative result
    copies_per_ml:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    iu_per_ml:        Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    log10_value:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lower_limit_detection: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upper_limit_quantification: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Qualitative interpretation
    detectable:       Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    suppressed:       Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # suppressed = < 1000 copies/mL (WHO threshold for HIV treatment success)
    vl_category:      Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # UNDETECTABLE|SUPPRESSED|VIREMIC|HIGH_VIREMIA|VERY_HIGH

    # ART context (HIV)
    on_art:           Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    art_regimen:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    art_months:       Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    previous_vl:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vl_trend:         Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # DECLINING|STABLE|RISING|REBOUNDING

    specimen_type:    Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # PLASMA|SERUM|DBS (Dried Blood Spot)

    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class GeneticAnalysis(Base, TimestampMixin):
    """Genetic / mutation analysis — cancer markers, hereditary disease, pharmacogenomics."""
    __tablename__ = 'genetic_analyses'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    ga_id:            Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    analysis_type:    Mapped[str]           = mapped_column(String(30))
    # CANCER_MUTATION|HEREDITARY|PHARMACOGENOMICS|MICROBIAL_RESISTANCE
    gene_target:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # BRCA1, BRCA2, KRAS, EGFR, etc.
    mutation_detected:Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    mutation_type:    Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # SNP|INDEL|CNV|FUSION|TRANSLOCATION
    pathogenicity:    Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # PATHOGENIC|LIKELY_PATHOGENIC|VUS|LIKELY_BENIGN|BENIGN
    clinical_significance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method:           Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # Sanger|NGS|Array|PCR-RFLP|MLPA

    result_summary:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_vcf_path:     Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class MolecularCriticalBook(Base, TimestampMixin):
    """Immutable archive for molecular critical results — MDR-TB, XDR-TB, high VL."""
    __tablename__ = 'molecular_critical_book'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    entry_number:     Mapped[str]           = mapped_column(String(20), unique=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    archived_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    result_type:      Mapped[str]           = mapped_column(String(20))
    # PCR|VIRAL_LOAD|GENETIC
    result_ref_id:    Mapped[int]           = mapped_column(Integer)
    test_name:        Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    critical_reason:  Mapped[str]           = mapped_column(String(100))
    # MDR_TB|XDR_TB|HIV_DETECTED|HIGH_VL|DRUG_RESISTANCE|PATHOGENIC_MUTATION
    severity:         Mapped[str]           = mapped_column(String(10), default='CRITICAL')

    clinician_notified: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notification_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notification_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    readback_confirmed: Mapped[bool]         = mapped_column(Boolean, default=False)
    public_health_notified: Mapped[bool]     = mapped_column(Boolean, default=False)
    # MDR-TB requires public health notification

    pqc_hash:         Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    archived_at:      Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    archived_by = relationship('User', foreign_keys=[archived_by_id])
