"""Blood Bank models."""
from typing import Optional
from datetime import date, datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class Donor(Base, TimestampMixin):
    __tablename__ = 'donors'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    donor_id:      Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    family_name:   Mapped[str]           = mapped_column(String(80))
    other_names:   Mapped[str]           = mapped_column(String(100), default='')
    blood_group:   Mapped[str]           = mapped_column(String(4))
    date_of_birth: Mapped[Optional[date]]= mapped_column(Date, nullable=True)
    gender:        Mapped[str]           = mapped_column(String(1))
    phone:         Mapped[str]           = mapped_column(String(20), default='')
    national_id:   Mapped[Optional[str]] = mapped_column(String(30), unique=True, nullable=True)
    is_eligible:   Mapped[bool]          = mapped_column(Boolean, default=True)
    deferral_reason:Mapped[Optional[str]]= mapped_column(Text, nullable=True)
    deferral_until: Mapped[Optional[date]]= mapped_column(Date, nullable=True)
    total_donations:Mapped[int]          = mapped_column(Integer, default=0)
    last_donation:  Mapped[Optional[date]]= mapped_column(Date, nullable=True)
    hospital_id:    Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)

    blood_bags   = relationship('BloodBag', back_populates='donor')

    @property
    def full_name(self) -> str:
        return f'{self.family_name} {self.other_names}'.strip()


class BloodBag(Base, TimestampMixin):
    __tablename__ = 'blood_bags'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    bag_number:     Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    donor_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('donors.id'), nullable=True)
    component:      Mapped[str]           = mapped_column(String(6), default='PRBC')
    # WB|PRBC|FFP|PLT|CRYO|ALB|GRAN
    blood_group:    Mapped[str]           = mapped_column(String(4), index=True)
    volume_ml:      Mapped[int]           = mapped_column(Integer, default=450)
    status:         Mapped[str]           = mapped_column(String(20), default='quarantine', index=True)
    # quarantine|available|reserved|issued|transfused|discarded|expired|in_transit
    collection_date:Mapped[date]          = mapped_column(Date)
    expiry_date:    Mapped[date]          = mapped_column(Date, index=True)
    is_irradiated:  Mapped[bool]          = mapped_column(Boolean, default=False)
    is_leukoreduced:Mapped[bool]          = mapped_column(Boolean, default=False)
    hospital_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)
    reserved_for_patient_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    issued_to_patient_id:   Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('patients.id'), nullable=True)
    issued_at:      Mapped[Optional[datetime]]   = mapped_column(DateTime(timezone=True), nullable=True)
    issued_by_id:   Mapped[Optional[int]]        = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:          Mapped[Optional[str]]        = mapped_column(Text, nullable=True)

    donor           = relationship('Donor', back_populates='blood_bags')
    crossmatches    = relationship('CrossmatchRecord', back_populates='blood_bag')
    hv_reports      = relationship('HaemovigilanceReport', back_populates='blood_bag')

    @property
    def days_to_expiry(self) -> int:
        from datetime import date as d
        return (self.expiry_date - d.today()).days

    @property
    def expiry_status(self) -> str:
        d = self.days_to_expiry
        if d < 0:  return 'expired'
        if d <= 3: return 'critical'
        if d <= 7: return 'warning'
        return 'ok'


class CrossmatchRecord(Base):
    __tablename__ = 'crossmatch_records'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    blood_bag_id:   Mapped[int]           = mapped_column(Integer, ForeignKey('blood_bags.id'))
    patient_id:     Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    performed_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    result:         Mapped[str]           = mapped_column(String(20), default='pending')
    # pending|compatible|incompatible|weak_pos
    method:         Mapped[str]           = mapped_column(String(60), default='Indirect Antiglobulin Test (IAT)')
    ai_flag:        Mapped[bool]          = mapped_column(Boolean, default=False)
    ai_note:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validated_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    performed_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    validated_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    blood_bag     = relationship('BloodBag', back_populates='crossmatches')
    patient       = relationship('Patient')
    performed_by  = relationship('User', foreign_keys=[performed_by_id])


class HaemovigilanceReport(Base):
    __tablename__ = 'haemovigilance_reports'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    report_id:        Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    blood_bag_id:     Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('blood_bags.id'), nullable=True)
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    reaction_type:    Mapped[str]           = mapped_column(String(20))
    # fnhtr|allergic|abo_haemo|del_haemo|taco|trali|septic|gvhd|near_miss|wrong_blood|other
    severity:         Mapped[str]           = mapped_column(String(10))
    # mild|moderate|severe|fatal|near_miss
    onset_time:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    transfusion_stopped: Mapped[bool]       = mapped_column(Boolean, default=True)
    volume_transfused_ml:Mapped[int]        = mapped_column(Integer, default=0)
    symptoms:         Mapped[str]           = mapped_column(Text)
    clinical_management: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outcome:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reported_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    is_notified_to_rbc: Mapped[bool]        = mapped_column(Boolean, default=False)
    reported_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    hospital_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)

    blood_bag    = relationship('BloodBag', back_populates='hv_reports')
    patient      = relationship('Patient')
    reported_by  = relationship('User', foreign_keys=[reported_by_id])


class BloodRequest(Base, TimestampMixin):
    __tablename__ = 'blood_requests'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    request_id:       Mapped[str]           = mapped_column(String(20), unique=True, index=True)
    patient_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('patients.id'))
    blood_group:      Mapped[str]           = mapped_column(String(4))
    component:        Mapped[str]           = mapped_column(String(6), default='PRBC')
    units_requested:  Mapped[int]           = mapped_column(Integer, default=1)
    urgency:          Mapped[str]           = mapped_column(String(15), default='routine')
    clinical_indication: Mapped[str]        = mapped_column(Text)
    status:           Mapped[str]           = mapped_column(String(15), default='pending')
    # pending|crossmatch|ready|issued|transfused|cancelled
    ward:             Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    doctor_name:      Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    requested_by_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    hospital_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)

    patient      = relationship('Patient')
    requested_by = relationship('User', foreign_keys=[requested_by_id])


class ApheresisCollection(Base, TimestampMixin):
    """Apheresis (machine) collection session — plateletpheresis / plasmapheresis /
    RBC / multicomponent. Records the procedure and links to the bag produced."""
    __tablename__ = 'apheresis_collections'

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True)
    collection_no:  Mapped[str]           = mapped_column(String(25), unique=True, index=True)
    donor_id:       Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('donors.id'), nullable=True)
    machine:        Mapped[Optional[str]] = mapped_column(String(60), nullable=True)   # e.g. Trima / Amicus / Spectra
    procedure_type: Mapped[str]           = mapped_column(String(30), default='PLATELETPHERESIS')
    # PLATELETPHERESIS|PLASMAPHERESIS|RBC_APHERESIS|MULTICOMPONENT|GRANULOCYTE
    component:      Mapped[str]           = mapped_column(String(6), default='PLT')   # PLT|FFP|PRBC|GRAN
    blood_group:    Mapped[str]           = mapped_column(String(4), default='')
    volume_ml:      Mapped[int]           = mapped_column(Integer, default=200)
    duration_min:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bag_id:         Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('blood_bags.id'), nullable=True)
    operator_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ComponentProduction(Base, TimestampMixin):
    """Component production — split a whole-blood unit into components
    (PRBC + FFP + PLT/CRYO). Records the source unit and produced bags."""
    __tablename__ = 'component_production'

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
    source_bag_id:    Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('blood_bags.id'), nullable=True)
    source_bag_number:Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    method:           Mapped[str]           = mapped_column(String(40), default='manual')   # centrifugation method
    produced_json:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON list of produced bags
    produced_by_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)


class UnitScreening(Base, TimestampMixin):
    """Blood Bank immunoserology / TTI screening of a donated unit. All-non-reactive
    + negative antibody screen → unit may be released from quarantine; any reactive
    → discarded. (Immunoserology lives inside Blood Bank, not the general serology lab.)"""
    __tablename__ = 'unit_screening'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    bag_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('blood_bags.id'), nullable=True)
    bag_number:    Mapped[Optional[str]] = mapped_column(String(25), index=True, nullable=True)
    hiv:           Mapped[str]           = mapped_column(String(3), default='NR')   # NR|R|ND
    hbsag:         Mapped[str]           = mapped_column(String(3), default='NR')
    hcv:           Mapped[str]           = mapped_column(String(3), default='NR')
    syphilis:      Mapped[str]           = mapped_column(String(3), default='NR')
    malaria:       Mapped[str]           = mapped_column(String(3), default='NR')
    abo_confirm:   Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    rh_confirm:    Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    antibody_screen: Mapped[str]         = mapped_column(String(4), default='NEG')  # NEG|POS|ND
    result:        Mapped[str]           = mapped_column(String(4), default='PASS')  # PASS|FAIL
    screened_by_id:Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    notes:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
