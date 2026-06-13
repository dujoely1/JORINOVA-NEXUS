"""Inventory models."""
from typing import Optional
from datetime import date, datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


class InventoryItem(Base, TimestampMixin):
    __tablename__ = 'inventory_items'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    item_code:    Mapped[str]           = mapped_column(String(30), unique=True, index=True)
    name:         Mapped[str]           = mapped_column(String(200))
    category:     Mapped[str]           = mapped_column(String(30), index=True)
    unit:         Mapped[str]           = mapped_column(String(20))
    quantity:     Mapped[float]         = mapped_column(Float, default=0)
    min_stock:    Mapped[float]         = mapped_column(Float, default=0)
    unit_cost:    Mapped[float]         = mapped_column(Float, default=0)
    lot_number:   Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    expiry_date:  Mapped[Optional[date]]= mapped_column(Date, nullable=True, index=True)
    location:     Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)
    notes:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    movements    = relationship('StockMovement', back_populates='item')

    @property
    def is_low_stock(self) -> bool:
        return self.quantity <= self.min_stock

    @property
    def days_to_expiry(self) -> Optional[int]:
        if not self.expiry_date:
            return None
        return (self.expiry_date - date.today()).days


class StockMovement(Base):
    __tablename__ = 'stock_movements'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    item_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('inventory_items.id'))
    movement_type:Mapped[str]           = mapped_column(String(20))
    # IN|OUT|ADJUSTMENT|TRANSFER|CONSUMED|EXPIRED|RETURNED
    quantity:     Mapped[float]         = mapped_column(Float)
    quantity_before:Mapped[float]       = mapped_column(Float, default=0)
    quantity_after: Mapped[float]       = mapped_column(Float, default=0)
    unit_cost:    Mapped[Optional[float]]= mapped_column(Float, nullable=True)
    reference:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # e.g. PO number, lab request ID
    reason:       Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    performed_by_id:Mapped[Optional[int]]= mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    hospital_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('hospitals.id'), nullable=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    item         = relationship('InventoryItem', back_populates='movements')
    performed_by = relationship('User', foreign_keys=[performed_by_id])
