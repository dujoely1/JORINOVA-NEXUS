"""
rag_embed — semantic retrieval over the medical-knowledge index.

Lazy loader for the artefacts produced by `scripts/build_rag_embeddings.py`:
  backend/ai_services/rag_index/{chunks.json, vectors.npy, model.txt}

Designed to degrade cleanly:
  - If sentence-transformers / numpy are missing  → return None (caller falls back)
  - If the index files don't exist                → return None (re-run the builder)
  - If anything errors at runtime                 → log and return None

Heavy resources (the embedding model + matrix) are loaded once on first
successful call and kept in module globals. Re-running the builder script
does NOT auto-reload — restart the backend or call `reset()` to pick up
new vectors.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger('alis_x.rag_embed')

INDEX_DIR = Path(__file__).parent / 'rag_index'
CHUNKS_PATH  = INDEX_DIR / 'chunks.json'
VECTORS_PATH = INDEX_DIR / 'vectors.npy'
MODEL_PATH   = INDEX_DIR / 'model.txt'

# Lazy-initialised — touched only when retrieve_embed is first called.
_model = None
_chunks: Optional[list[dict]] = None
_vectors = None        # numpy float32 [N, dim], L2-normalised
_load_failed = False   # set on first failure so we don't retry every call


def reset() -> None:
    """Clear cached model + vectors so the next call reloads from disk."""
    global _model, _chunks, _vectors, _load_failed
    _model = None
    _chunks = None
    _vectors = None
    _load_failed = False


def is_available() -> bool:
    """Cheap check: are the artefacts on disk and deps importable?"""
    if not (CHUNKS_PATH.is_file() and VECTORS_PATH.is_file() and MODEL_PATH.is_file()):
        return False
    try:
        import numpy  # noqa
        import sentence_transformers  # noqa
        return True
    except ImportError:
        return False


def _ensure_loaded() -> bool:
    """Load chunks + vectors + model into module globals. Returns True if ready."""
    global _model, _chunks, _vectors, _load_failed
    if _load_failed:
        return False
    if _model is not None and _chunks is not None and _vectors is not None:
        return True
    if not (CHUNKS_PATH.is_file() and VECTORS_PATH.is_file() and MODEL_PATH.is_file()):
        log.info('rag_embed: index artefacts not found — run scripts/build_rag_embeddings.py')
        _load_failed = True
        return False
    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
        _chunks  = json.loads(CHUNKS_PATH.read_text(encoding='utf-8'))
        _vectors = np.load(VECTORS_PATH)
        model_name = MODEL_PATH.read_text(encoding='utf-8').strip()
        log.info('rag_embed: loading model %s for %d chunks', model_name, len(_chunks))
        _model = SentenceTransformer(model_name)
        return True
    except Exception as exc:
        log.warning('rag_embed: load failed (%s); falling back to keyword retrieval', exc)
        _load_failed = True
        return False


def retrieve_embed(query: str, k: int = 5, min_score: float = 0.25) -> Optional[list[dict]]:
    """
    Semantic top-k retrieval. Returns a list of chunk dicts shaped like
    the keyword retriever ({kind, key, text, ...}) plus a `score` field.

    Returns None (NOT an empty list) when the index is unavailable, so
    the caller can distinguish "no hits" from "subsystem off".

    `min_score` filters out borderline matches; cosine ≈ 0.25 is the
    usual line between "topically related" and "unrelated" for MiniLM.
    """
    if not query or not query.strip():
        return []
    if not _ensure_loaded():
        return None
    try:
        qv = _model.encode([query], normalize_embeddings=True).astype('float32')[0]
        scores = _vectors @ qv         # cosine == dot after normalisation
        import numpy as np
        # argpartition is faster than a full sort for top-k; sort the small slice
        top_idx = np.argpartition(-scores, min(k, len(scores) - 1))[:k]
        top_idx = top_idx[np.argsort(-scores[top_idx])]
        out: list[dict] = []
        for i in top_idx:
            s = float(scores[i])
            if s < min_score:
                continue
            out.append({**_chunks[i], 'score': round(s, 3)})
        return out
    except Exception as exc:
        log.warning('rag_embed: query failed (%s)', exc)
        return None


def diagnostics() -> dict:
    """Lightweight introspection for an admin endpoint."""
    return {
        'available':       is_available(),
        'loaded':          _model is not None,
        'load_failed':     _load_failed,
        'chunks_indexed':  (len(_chunks) if _chunks is not None else None),
        'vector_dim':      (int(_vectors.shape[1]) if _vectors is not None else None),
        'model_file':      str(MODEL_PATH.relative_to(MODEL_PATH.parent.parent.parent)),
    }
