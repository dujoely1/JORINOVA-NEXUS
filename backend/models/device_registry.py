"""
Hospital-wide device registry + dynamic (metadata-driven) attributes.

NEW tables only — created automatically by create_all_tables(), so this adds to
the system without migrating or touching existing tables/data.

  HospitalDevice    every device in the ecosystem (phones, tablets, computers,
                    analyzers, IoT fridges/centrifuges, barcode scanners).
  EntityAttribute   generic key/value store giving any record extra fields
                    WITHOUT a schema change (the "dynamic / extensible" model).
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class HospitalDevice(Base):
    __tablename__ = 'hospital_devices'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    device_id:    Mapped[str]           = mapped_column(String(120), unique=True, index=True)
    device_type:  Mapped[str]           = mapped_column(String(40), default='phone')
    # phone | tablet | computer | analyzer | iot | scanner
    device_name:  Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    location:     Mapped[Optional[str]] = mapped_column(String(160), nullable=True)  # ward / lab / dept
    assigned_staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    status:       Mapped[str]           = mapped_column(String(20), default='active')  # active | inactive
    security_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    rbac_permissions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of module keys
    device_metadata:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON (vendor, model, ip…)
    last_sync_time:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    assigned_staff = relationship('User', foreign_keys=[assigned_staff_id])


class EntityAttribute(Base):
    """Dynamic, metadata-driven extra fields for any entity (EAV pattern).

    Lets new fields be added at runtime without altering tables — e.g.
    ('staff', 42, 'badge_color', 'blue') or ('analyzer', 7, 'firmware', '3.2').
    """
    __tablename__ = 'entity_attributes'
    __table_args__ = (UniqueConstraint('entity_type', 'entity_id', 'key', name='uq_entity_attr'),)

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str]           = mapped_column(String(40), index=True)   # staff | device | patient …
    entity_id:   Mapped[int]           = mapped_column(Integer, index=True)
    key:         Mapped[str]           = mapped_column(String(80))
    value:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    value_type:  Mapped[str]           = mapped_column(String(20), default='string')  # string|number|bool|json
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
