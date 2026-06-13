"""Centralized SQLAlchemy model registry.

Importing this package ensures ALL ORM models are registered with the
shared SQLAlchemy Base before mapper configuration, migrations, or seeding.

Usage:
    import models  # from backend/ (scripts/ will have backend on sys.path)
"""

# Core models
from . import user  # noqa: F401
from . import patient  # noqa: F401
from . import core_config  # noqa: F401
from . import laboratory  # noqa: F401

# Department / clinical models
from . import hematology  # noqa: F401
from . import biochemistry  # noqa: F401
from . import coagulation  # noqa: F401
from . import blood_bank  # noqa: F401
from . import serology  # noqa: F401
from . import urinalysis  # noqa: F401
from . import microbiology  # noqa: F401
from . import molecular  # noqa: F401
from . import quality  # noqa: F401

# Operations
from . import inventory  # noqa: F401
from . import worklist  # noqa: F401
from . import billing  # noqa: F401
from . import notifications  # noqa: F401
from . import audit  # noqa: F401
from . import rejection  # noqa: F401
from . import staffhub  # noqa: F401
from . import surveillance  # noqa: F401

# Voice / biometric / escalation / rejection extras
from . import voice_settings  # noqa: F401
from . import escalation  # noqa: F401
from . import voice_biometric  # noqa: F401

# Sync / offline-first
from . import sync_queue  # noqa: F401

# Universal operators (12 roles, cross-department)
from . import universal  # noqa: F401

# Security — 2FA backup/recovery codes
from . import two_factor_backup  # noqa: F401


