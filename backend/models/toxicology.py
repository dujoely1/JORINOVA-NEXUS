"""
Toxicology source models.

Three registers, three models:
  • DrugScreenResult  — UDS panels (cannabis, opiates, cocaine, etc.) + confirmatory
  • TDMResult         — Therapeutic drug monitoring (vancomycin, digoxin, tacrolimus...)
  • PoisoningCase     — Acute poisonings (paracetamol, OP, CO, heavy metals)

Columns mirror routers/records.py: uds_book, tdm_book, poisoning_book.

Critical workflow:
  - UDS: positive overall_result → flag for confirmatory GC-MS (clinical, not critical)
  - TDM: interpretation='Toxic' → critical archive
  - Poisoning: severity in {Severe,Critical} OR outcome='Death' → critical archive
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


# ── URINE DRUG SCREEN ─────────────────────────────────────────────────────────

class DrugScreenResult(Base, TimestampMixin):
    """Urine drug screen — POCT immunoassay panel + optional GC-MS confirmation."""
    __tablename__ = 'tox_drug_screen'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    screen_id:         Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    panel_type:        Mapped[str]           = mapped_column(String(20), default='Standard 5')
    # Standard 5|Extended 10|Workplace|Forensic
    collection_time:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    chain_of_custody:  Mapped[bool]          = mapped_column(Boolean, default=False)
    cup_lot:           Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # Standard 5
    thc:               Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Negative|Positive
    opiates:           Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cocaine:           Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    amphetamines:      Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    benzodiazepines:   Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Extended
    methadone:         Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    mdma:              Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    barbiturates:      Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    pcp:               Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    tricyclics:        Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Validity
    creatinine_mg_dl:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    specimen_valid:    Mapped[bool]          = mapped_column(Boolean, default=True)

    overall_result:    Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Negative|Positive
    confirmatory_required: Mapped[str]       = mapped_column(String(20), default='No')
    # No|Yes - pending|Completed
    confirmatory_method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # GC-MS|LC-MS/MS
    confirmatory_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='PENDING')
    entered_by_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    validated_by = relationship('User', foreign_keys=[validated_by_id])


# ── THERAPEUTIC DRUG MONITORING ───────────────────────────────────────────────

class TDMResult(Base, TimestampMixin):
    """Therapeutic drug monitoring — trough/peak levels with dosing guidance."""
    __tablename__ = 'tox_tdm'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    tdm_id:            Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    drug_name:         Mapped[str]           = mapped_column(String(40))
    # Vancomycin|Gentamicin|Amikacin|Digoxin|Phenytoin|Carbamazepine|Valproate|Lithium|Clozapine|Tacrolimus|Cyclosporin|Sirolimus|Methotrexate|Theophylline|Phenobarbitone
    level_type:        Mapped[str]           = mapped_column(String(30))
    # Trough (pre-dose)|Peak (post-dose)|Random
    dose_time:         Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sample_time:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hours_post_dose:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    concentration:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # mg/L, ng/mL, µmol/L
    therapeutic_low:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    therapeutic_high:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    therapeutic_range: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    interpretation:    Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Sub-therapeutic|Therapeutic|Toxic
    dose_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pharmacist_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='PENDING')
    entered_by_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    pharmacist   = relationship('User', foreign_keys=[pharmacist_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


# ── POISONING CASES ───────────────────────────────────────────────────────────

class PoisoningCase(Base, TimestampMixin):
    """Acute poisoning case — toxin level + clinical management + outcome."""
    __tablename__ = 'tox_poisoning'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    case_no:           Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    lab_request_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('lab_requests.id'), nullable=True)
    patient_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    poison_type:       Mapped[str]           = mapped_column(String(40))
    # Paracetamol|Salicylate|Organophosphate|Lead (Pb)|Mercury (Hg)|Arsenic (As)|Carbon Monoxide|Methanol|Ethanol|Cyanide|Iron|Digoxin OD|Lithium OD|Other
    exposure_route:    Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Ingestion|Inhalation|Dermal|Injection|Eye
    exposure_time:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    intentional:       Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    result_value:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    toxic_threshold:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nomogram_zone:     Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # for paracetamol Rumack-Matthew

    severity:          Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    # Mild|Moderate|Severe|Critical
    antidote_given:    Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # N-acetylcysteine|Atropine|Naloxone|Methylene blue|...
    antidote_time:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decontamination:   Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # gastric lavage|charcoal|whole-bowel irrigation
    clinical_management: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    outcome:           Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Recovered|Improved|Transferred ICU|Death|Unknown
    public_health_notified: Mapped[bool]     = mapped_column(Boolean, default=False)

    flag:              Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:            Mapped[str]           = mapped_column(String(20), default='PENDING')
    entered_by_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    patient      = relationship('Patient')
    lab_request  = relationship('LabRequest')
    validated_by = relationship('User', foreign_keys=[validated_by_id])
