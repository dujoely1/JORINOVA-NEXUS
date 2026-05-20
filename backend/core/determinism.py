"""ALIS-X deterministic runtime initialization.

This module centralizes all RNG/determinism knobs so every startup path
(migrations, FastAPI server, workers, seed scripts) behaves consistently.
"""

from __future__ import annotations

import os
import random

GLOBAL_SEED = int(os.getenv("GLOBAL_SEED", "42"))


def initialize_determinism() -> None:
    """Initialize deterministic runtime state globally.

    Must run before any code that uses:
      - random / Faker
      - numpy.random
      - langdetect (language detection)

    Safe to call multiple times.
    """

    random.seed(GLOBAL_SEED)

    # Optional numpy determinism
    try:
        import numpy as np  # type: ignore

        np.random.seed(GLOBAL_SEED)
    except Exception:
        pass

    # Deterministic langdetect
    try:
        from langdetect import DetectorFactory

        DetectorFactory.seed = 0
    except Exception:
        pass

