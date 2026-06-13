"""Shared model base with timestamps — SQLAlchemy 2.0 declared_attr pattern."""
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import mapped_column, Mapped, declared_attr


class TimestampMixin:
    """Provides created_at / updated_at columns via declared_attr (SQLAlchemy 2.0 mixin)."""

    @declared_attr
    def created_at(cls) -> Mapped[datetime]:
        return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @declared_attr
    def updated_at(cls) -> Mapped[datetime]:
        return mapped_column(DateTime(timezone=True), server_default=func.now(),
                             onupdate=func.now(), nullable=False)
