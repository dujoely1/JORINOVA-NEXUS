"""Microbiology Department models: Culture, Antibiogram, Parasitology, MDR tracking."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class MicroCulture(Base, TimestampMixin):
    """Bacteriology culture result — blood, urine, stool, sputum, wound, CSF."""
    __tablename__ = 'micro_cultures'

    id:                Mapped[int]           = mapped_column(Integer, primary_key=True)
    culture_id:        Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:    Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:        Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:               Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sid:               Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Specimen
    specimen_type:     Mapped[str]           = mapped_column(String(30))
    # blood|urine|stool|sputum|wound|csf|throat|ear|eye|other
    specimen_notes:    Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Gram stain (primary microscopy)
    gram_stain_done:   Mapped[bool]          = mapped_column(Boolean, default=False)
    gram_stain_result: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    gram_stain_morphology: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # gram_positive_cocci|gram_negative_rods|gram_positive_rods|etc

    # Culture growth
    growth_status:     Mapped[str]           = mapped_column(String(20), default='PENDING')
    # PENDING|NO_GROWTH|GROWTH|CONTAMINATED
    growth_days:       Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    colony_morphology: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Organism identification
    organism_identified: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    organism_count:      Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    identification_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # MDR flags
    is_mrsa:           Mapped[bool]          = mapped_column(Boolean, default=False)
    is_esbl:           Mapped[bool]          = mapped_column(Boolean, default=False)
    is_cro:            Mapped[bool]          = mapped_column(Boolean, default=False)
    # CRO = Carbapenem-Resistant Organism
    is_vrsa:           Mapped[bool]          = mapped_column(Boolean, default=False)
    mdr_note:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status
    status:            Mapped[str]           = mapped_column(String(15), default='PENDING')
    # PENDING|IN_PROGRESS|PRELIMINARY|FINAL|VALIDATED
    is_validated:      Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:       Mapped[bool]          = mapped_column(Boolean, default=False)
    critical_notified: Mapped[bool]          = mapped_column(Boolean, default=False)
    clinician_notified:Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notification_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    readback_confirmed:Mapped[bool]          = mapped_column(Boolean, default=False)

    ai_interpretation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    final_report_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    antibiogram_entries = relationship('Antibiogram', back_populates='culture', cascade='all, delete-orphan')
    entered_by    = relationship('User', foreign_keys=[entered_by_id])
    validated_by  = relationship('User', foreign_keys=[validated_by_id])


class Antibiogram(Base, TimestampMixin):
    """Antibiotic sensitivity result linked to a culture."""
    __tablename__ = 'antibiograms'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    culture_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('micro_cultures.id'))
    antibiotic:   Mapped[str]           = mapped_column(String(100))
    drug_class:   Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    interpretation: Mapped[str]         = mapped_column(String(1))
    # S=Sensitive, I=Intermediate, R=Resistant
    mic_value:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mic_unit:     Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    disk_zone_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    method:       Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # disk_diffusion|MIC|VITEK|automated
    notes:        Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    culture = relationship('MicroCulture', back_populates='antibiogram_entries')


class ParasitologyResult(Base, TimestampMixin):
    """Parasitology result — blood and intestinal parasites."""
    __tablename__ = 'parasitology_results'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    para_id:          Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    entered_by_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    validated_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Specimen / category
    category:         Mapped[str]           = mapped_column(String(20))
    # BLOOD|STOOL|URINE|CSF|SKIN
    specimen_type:    Mapped[str]           = mapped_column(String(40))

    # Parasite
    parasite_name:    Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    # e.g. Plasmodium falciparum, Giardia lamblia, Ascaris lumbricoides
    parasite_species: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stage:            Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # trophozoite|ring_form|gametocyte|cyst|ova|larva

    # Result
    result:           Mapped[str]           = mapped_column(String(10), default='PENDING')
    # PENDING|POSITIVE|NEGATIVE|TRACE|SUSPICIOUS
    quantity:         Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # e.g. "+", "++", "+++", "1+/HPF", parasitemia %
    parasitemia_pct:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Staining & method
    staining_technique: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # Giemsa|ZN|Wet_mount|Formalin_ether|Auramine
    preparation:      Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    # thick_smear|thin_smear|wet_mount|concentration

    # Malaria RDT (Rapid Diagnostic Test)
    rdt_done:         Mapped[bool]          = mapped_column(Boolean, default=False)
    rdt_result:       Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rdt_brand:        Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    is_validated:     Mapped[bool]          = mapped_column(Boolean, default=False)
    validated_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_critical:      Mapped[bool]          = mapped_column(Boolean, default=False)
    status:           Mapped[str]           = mapped_column(String(15), default='PENDING')
    ai_interpretation:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    entered_by   = relationship('User', foreign_keys=[entered_by_id])
    validated_by = relationship('User', foreign_keys=[validated_by_id])


class MicroCriticalBook(Base, TimestampMixin):
    """Immutable audit-grade critical result archive — MRSA, sepsis, MDR organisms."""
    __tablename__ = 'micro_critical_book'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    entry_number:     Mapped[str]           = mapped_column(String(20), unique=True)
    lab_request_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('lab_requests.id'))
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    archived_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)

    pid:              Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lid:              Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    result_type:      Mapped[str]           = mapped_column(String(20))
    # CULTURE|PARASITOLOGY|ANTIBIOGRAM
    result_ref_id:    Mapped[int]           = mapped_column(Integer)
    organism:         Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    critical_reason:  Mapped[str]           = mapped_column(String(100))
    # MRSA|ESBL|CRO|SEPSIS|HIGH_PARASITEMIA|MDR
    severity:         Mapped[str]           = mapped_column(String(10), default='CRITICAL')

    clinician_notified: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notification_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notification_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    readback_confirmed: Mapped[bool]         = mapped_column(Boolean, default=False)
    rbc_notified:     Mapped[bool]           = mapped_column(Boolean, default=False)

    pqc_hash:         Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    archived_at:      Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    archived_by = relationship('User', foreign_keys=[archived_by_id])
