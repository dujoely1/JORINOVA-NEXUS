"""ALIS-X centralized bootstrap.

This becomes the single authoritative startup initialization entrypoint
for all runtime paths.

Goals:
- deterministic RNG state
- ensure all ORM models are registered before mapper configuration
"""

from __future__ import annotations

import logging

from core.determinism import initialize_determinism

log = logging.getLogger('bootstrap')


def initialize_application(*, configure_mappers_first: bool = False) -> None:
    """Initialize deterministic runtime + ORM registry.

    Order is important:
      1) determinism
      2) import models (register classes)
      3) (optionally) configure_mappers
    """

    initialize_determinism()

    if configure_mappers_first:
        # Rare case; keep backward compatibility. Default is False.
        from sqlalchemy.orm import configure_mappers

        configure_mappers()

    # Import models to register all ORM classes with SQLAlchemy Base
    import models  # noqa: F401

    if not configure_mappers_first:
        from sqlalchemy.orm import configure_mappers

        configure_mappers()

    log.info('Bootstrap complete (determinism + ORM registry).')

