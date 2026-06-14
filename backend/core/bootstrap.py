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


# ── Deterministic, production-safe credential bootstrapping ───────────────────
# Admin/owner passwords are controlled EXCLUSIVELY via environment variables.
# In production we NEVER invent a random password: if a required variable is
# absent when an account must be created, we FAIL FAST with a clear message.
# A random password is permitted ONLY in explicit development mode and is then
# flagged as temporary.
import os  # noqa: E402
import secrets  # noqa: E402


class MissingCredentialError(RuntimeError):
    """Raised at startup/seeding when a required secret is not configured."""


def is_dev_mode() -> bool:
    """True only for local/dev. Production must run with DEBUG=false and no
    DEV_MODE override, which forbids any random credential generation."""
    if os.environ.get('DEV_MODE', '').strip().lower() in ('1', 'true', 'yes', 'on'):
        return True
    try:
        from core.config import get_settings
        return bool(get_settings().debug)
    except Exception:
        return False


def resolve_seed_password(env_key: str) -> tuple[str, bool]:
    """Resolve the password for a seeded account.

    Returns (password, was_generated):
      • env var set            -> use it (deterministic).
      • unset, dev mode        -> temporary random one (was_generated=True).
      • unset, production       -> raise MissingCredentialError (fail fast).
    """
    pw = os.environ.get(env_key)
    if pw:
        return pw, False
    if is_dev_mode():
        return secrets.token_urlsafe(12), True
    raise MissingCredentialError(
        f'{env_key} is required for production deployment. '
        f'Set {env_key} in the environment (.env) before starting, '
        f'or set DEV_MODE=true for LOCAL development only (never in production).'
    )

