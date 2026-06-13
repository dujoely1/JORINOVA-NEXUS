"""
Advanced Molecular & Genomics source models.

Three registers backing the advanced molecular books:
  • SequencingRun      — WGS/WES/panel/RNA-seq runs with QC metrics
  • NovelPattern       — Unknown mutations / emerging variants detected by AI
  • GenomicPrediction  — Pharmacogenomics, cancer risk, ACMG classification

Columns mirror routers/records.py: sequencing_book, novel_pattern_book,
genomic_prediction.

Critical workflow:
  - SequencingRun: pathogenic_variants > 0 → flag (not auto-critical)
  - NovelPattern: alert_level in {Alert,Emergency} OR predicted_impact=Pathogenic → critical
  - GenomicPrediction: acmg_class in {Pathogenic,Likely Pathogenic} → critical (cancer risk)
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


# ── NGS SEQUENCING ────────────────────────────────────────────────────────────

class SequencingRun(Base, TimestampMixin):
    """A single NGS run — captures sequencer metrics + variant call summary."""
    __tablename__ = 'mol_sequencing_run'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    run_id:            Mapped[str]           = mapped_column(String(40), unique=True, index=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    ngs_type:          Mapped[str]           = mapped_column(String(40))
    # WGS|WES|Gene panel|RNA-seq|Targeted amplicon|Metagenomics
    panel_name:        Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sequencer:         Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # Illumina NovaSeq|Illumina MiSeq|Oxford Nanopore|Ion Torrent|PacBio
    library_kit:       Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    flowcell_id:       Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # QC metrics
    target_coverage:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # ×
    mean_coverage:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pct_above_20x:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    q30_score:         Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_reads_m:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mapping_rate:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duplication_rate:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    qc_pass:           Mapped[bool]          = mapped_column(Boolean, default=False)

    # Variant call summary
    variants_found:        Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pathogenic_variants:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vus_variants:          Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_vcf_path:          Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    annotation_summary:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    analyst_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='RUNNING')
    # RUNNING|QC_PENDING|VARIANT_CALLING|PENDING|VALIDATED|RELEASED|AMENDED|FAILED
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    analyst      = relationship('User', foreign_keys=[analyst_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
    patterns     = relationship('NovelPattern', back_populates='run')


# ── NOVEL PATTERN DISCOVERY ───────────────────────────────────────────────────

class NovelPattern(Base, TimestampMixin):
    """
    AI-flagged unknown mutation / emerging pathogen strain / unusual variant
    combination. The early-warning side of genomics.
    """
    __tablename__ = 'mol_novel_pattern'

    id:                  Mapped[int]           = mapped_column(Integer, primary_key=True)
    novel_id:            Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    run_id:              Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('mol_sequencing_run.id'), nullable=True)
    lab_request_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:          Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    pid:                 Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    genome_position:     Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # chr17:43044295
    gene_name:           Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    transcript:          Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    mutation_type:       Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # SNV|Indel|CNV|Fusion|Structural|Unknown
    sequence_change:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # c.5266dupC, p.Q1756Pfs
    organism:            Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # for pathogen-side novelty

    database_match:      Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # No match found|Partial match|New strain variant|Known but unusual combination
    closest_match:       Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ai_confidence:       Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 0-100
    predicted_impact:    Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Benign|Uncertain|Likely pathogenic|Pathogenic
    alert_level:         Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    # Watch|Warning|Alert|Emergency

    publication_status:  Mapped[str]           = mapped_column(String(40), default='Internal only')
    # Internal only|Shared with WHO|Submitted to ClinVar|Published
    submission_ref:      Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    assigned_geneticist_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    flag:                Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:         Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:        Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:              Mapped[str]           = mapped_column(String(20), default='PENDING')
    notes:               Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient            = relationship('Patient')
    lab_request        = relationship('LabRequest')
    run                = relationship('SequencingRun', back_populates='patterns')
    assigned_geneticist= relationship('User', foreign_keys=[assigned_geneticist_id])
    validated_by       = relationship('User', foreign_keys=[validated_by_id])


# ── GENOMIC PREDICTION (clinical genomics) ────────────────────────────────────

class GenomicPrediction(Base, TimestampMixin):
    """
    Clinical-grade genomic prediction — pharmacogenomics, hereditary cancer
    risk, carrier screening, polygenic risk scores. ACMG-classified variants.
    """
    __tablename__ = 'mol_genomic_prediction'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    prediction_id:     Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    run_id:            Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('mol_sequencing_run.id'), nullable=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    analysis_type:     Mapped[str]           = mapped_column(String(40))
    # Pharmacogenomics|Hereditary cancer risk|Carrier screening|Prenatal aneuploidy|Drug metabolism|Polygenic risk score
    gene_target:       Mapped[str]           = mapped_column(String(120))  # CYP2C19, BRCA1/BRCA2, MLH1...
    mutation_detected: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    zygosity:          Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # Heterozygous|Homozygous|Compound het
    acmg_class:        Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Pathogenic|Likely Pathogenic|VUS|Likely Benign|Benign

    risk_score:        Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    risk_percent:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    clinical_significance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drug_metabolism_phenotype: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # PM/IM/EM/UM
    recommended_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    family_counselling: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Recommended|Completed|Not required
    geneticist_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='PENDING')
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    run          = relationship('SequencingRun')
    geneticist   = relationship('User', foreign_keys=[geneticist_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
