"""
Anatomical Pathology source models.

Four registers, four models — one per pathology workflow:
  • HistopathologyReport — biopsy / resection / margins / grading
  • CytologyResult       — PAP (Bethesda), FNAC, LBC, fluid cytology
  • IHCResult            — ER/PR/HER2/Ki-67/PD-L1 + special stains
  • ImageAnalysisResult  — AI-assisted slide quantification

Columns mirror the schemas already defined in routers/records.py
(anapath_histology, cytology_book, ihc_book, image_analysis_book) so the
generic register page can render them without remapping.

Workflow (Phase 3 — specialist sign-off):
  DRAFT  → IHC_ORDERED (histo only) → PENDING_PATHOLOGIST → VALIDATED → RELEASED
Validation auto-archives malignant diagnoses to CriticalResultBook via
services.book_service.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Text, DateTime, LargeBinary, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


# ── HISTOPATHOLOGY ────────────────────────────────────────────────────────────

class HistopathologyReport(Base, TimestampMixin):
    """Surgical biopsy / resection report — the gold standard of anapath."""
    __tablename__ = 'anapath_histology'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    accession_no:    Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Specimen
    specimen_type:   Mapped[str]           = mapped_column(String(50))
    # Core biopsy|Excision biopsy|Surgical resection|TURP chips|Curettings|Total gastrectomy|Colectomy|Mastectomy|Other
    organ_site:      Mapped[str]           = mapped_column(String(120))
    clinical_history:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    blocks_count:    Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slides_count:    Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Diagnosis
    diagnosis_category: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Benign|Pre-malignant|Malignant|Inflammatory|Normal/Reactive|Inconclusive
    tumour_type:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    grade:           Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # G1 - Well diff.|G2 - Moderate|G3 - Poorly diff.|G4 - Undifferentiated|Not applicable
    stage:           Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    margin_status:   Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Clear (>2mm)|Close (<2mm)|Involved|Not applicable
    margin_distance_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ln_examined:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ln_positive:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pTNM:            Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    full_report:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    macroscopic:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    microscopic:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # IHC orchestration
    ihc_ordered:     Mapped[str]           = mapped_column(String(20), default='No')
    # No|Yes - pending|Completed
    ihc_completed_at:Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Workflow / lock
    flag:            Mapped[Optional[str]] = mapped_column(String(3), nullable=True)  # H/HH if Malignant
    is_critical:     Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:    Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pathologist_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    status:          Mapped[str]           = mapped_column(String(25), default='DRAFT')
    # DRAFT|IHC_ORDERED|PENDING_PATHOLOGIST|VALIDATED|RELEASED|AMENDED
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    pathologist  = relationship('User', foreign_keys=[pathologist_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])
    ihcs         = relationship('IHCResult', back_populates='histology')


# ── CYTOLOGY ──────────────────────────────────────────────────────────────────

class CytologyResult(Base, TimestampMixin):
    """PAP / FNAC / LBC / fluid cytology — Bethesda system reporting."""
    __tablename__ = 'anapath_cytology'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    accession_no:    Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    cyto_type:       Mapped[str]           = mapped_column(String(30))
    # PAP Smear|LBC|FNAC|Fluid cytology|Sputum cytology|Urine cytology|Nipple discharge
    specimen_site:   Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    adequacy:        Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Satisfactory|Satisfactory + TZ|Unsatisfactory

    # PAP-specific (Bethesda) or general result
    bethesda_category:Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # NILM|ASC-US|LSIL|ASC-H|HSIL|SCC|AGC|AIS|Adenocarcinoma|Malignant - other|Negative for malignancy|Suspicious for malignancy
    organism_seen:   Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # Candida, Trichomonas, BV
    reactive_changes:Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    recommendation:  Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # Routine screening|Repeat in 6 months|Colposcopy referral|Biopsy|MDT
    full_report:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    flag:            Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:     Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:    Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cytopathologist_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    status:          Mapped[str]           = mapped_column(String(20), default='DRAFT')
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient         = relationship('Patient')
    lab_request     = relationship('LabRequest')
    cytopathologist = relationship('User', foreign_keys=[cytopathologist_id])
    validated_by    = relationship('User', foreign_keys=[validated_by_id])


# ── IMMUNOHISTOCHEMISTRY ──────────────────────────────────────────────────────

class IHCResult(Base, TimestampMixin):
    """One IHC stain — typically multiple rows per HistopathologyReport."""
    __tablename__ = 'anapath_ihc'

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
    accession_no:    Mapped[str]           = mapped_column(String(25), index=True)
    histology_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('anapath_histology.id'), nullable=True)
    lab_request_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:             Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    marker:          Mapped[str]           = mapped_column(String(40))
    # ER|PR|HER2|Ki-67|p53|PD-L1|CD3|CD20|CD10|BCL2|BCL6|Synaptophysin|Chromogranin|S100|...
    clone_antibody:  Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    intensity:       Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 0 - Negative|1+ Weak|2+ Moderate|3+ Strong
    percent_positive:Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    h_score:         Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    interpretation:  Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Positive|Negative|Equivocal (2+)
    notes:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    flag:            Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:     Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:    Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:          Mapped[str]           = mapped_column(String(20), default='PENDING')
    entered_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    histology    = relationship('HistopathologyReport', back_populates='ihcs')
    patient      = relationship('Patient')
    validated_by = relationship('User', foreign_keys=[validated_by_id])


# ── IMAGE ANALYSIS (AI quantification) ────────────────────────────────────────

class ImageAnalysisResult(Base, TimestampMixin):
    """AI quantification on H&E / IHC / WSI slides — reviewed by pathologist."""
    __tablename__ = 'anapath_image_analysis'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    analysis_id:      Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    linked_accession: Mapped[Optional[str]] = mapped_column(String(25), index=True, nullable=True)
    histology_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('anapath_histology.id'), nullable=True)
    patient_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    image_type:       Mapped[str]           = mapped_column(String(30))
    # H&E slide|IHC slide|Cytology smear|Frozen section|Whole slide image (WSI)
    image_path:       Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ai_model_version: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    ai_cellularity:        Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_mitoses:            Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_necrosis:           Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_ki67_estimate:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_grade_suggestion:   Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)
    # G1|G2|G3|G4|Inconclusive
    ai_confidence:         Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_raw_json:           Mapped[Optional[str]]   = mapped_column(Text, nullable=True)

    pathologist_decision:  Mapped[Optional[str]]   = mapped_column(String(50), nullable=True)
    # Accepted with modification|Accepted as-is|Rejected - manual review
    pathologist_notes:     Mapped[Optional[str]]   = mapped_column(Text, nullable=True)

    flag:             Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:           Mapped[str]           = mapped_column(String(20), default='PENDING')

    patient      = relationship('Patient')
    histology    = relationship('HistopathologyReport')
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class AnapathImage(Base):
    """Stored pathology image bytes (microscopy / macroscopy / imaging / upload),
    tied to a patient and/or accession. Persists in the DB (no external storage);
    served via /api/v1/public/anapath-image/{id}."""
    __tablename__ = 'anapath_images'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    patient_id:     Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)
    accession:      Mapped[Optional[str]] = mapped_column(String(40), index=True, nullable=True)
    image_type:     Mapped[str]           = mapped_column(String(20), default='upload')  # microscopy|macroscopy|imaging|upload
    caption:        Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    data:           Mapped[bytes]         = mapped_column(LargeBinary)
    content_type:   Mapped[str]           = mapped_column(String(50), default='image/jpeg')
    checksum:       Mapped[str]           = mapped_column(String(64), default='')
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
