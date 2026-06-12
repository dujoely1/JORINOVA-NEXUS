"""
Track 8 — build sentence-transformer embeddings + FAISS index for the
JORINOVA medical knowledge base.

The current `medical_rag.retrieve()` does keyword-overlap retrieval. It's
fast and works for exact words but misses semantic matches:
  - Query "stain for mold"   misses the KOH / GMS chunks (no word overlap)
  - Query "low platelets"    misses thrombocytopenia chunks
  - Query "kidney function"  misses creatinine/urea chunks

This script builds an embedding index so semantic queries hit. The
keyword index stays as the fast path; `medical_rag.py` gains a new
`retrieve_embed(query, k)` that uses this.

INPUT:  backend/ai_services/medical_knowledge.py (already-loaded via
        medical_rag._build_chunks())
OUTPUT: backend/ai_services/rag_index/
          chunks.json   — list of {kind, key, text}
          vectors.npy   — float32 [N, 384] embeddings (one per chunk)
          model.txt     — name of the sentence-transformer used
          (FAISS index is rebuilt in-memory on first use — fast for <10 k chunks)

USAGE:
    python scripts/build_rag_embeddings.py            # build
    python scripts/build_rag_embeddings.py --test     # build + sanity-test 5 queries

REQUIREMENTS:
    pip install sentence-transformers numpy
    (faiss-cpu optional — falls back to plain numpy cosine if missing)

RUNTIME: ~30 s on CPU (downloads ~80 MB model on first run, cached thereafter).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# Make sure the backend package is importable
sys.path.insert(0, str(REPO / 'backend'))

# 22 M params, 384-dim — best speed/quality trade-off for CPU
DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

OUT_DIR = REPO / 'backend' / 'ai_services' / 'rag_index'


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--model', default=DEFAULT_MODEL,
                    help=f'sentence-transformers model name (default: {DEFAULT_MODEL})')
    ap.add_argument('--test', action='store_true',
                    help='after building, run 5 demo queries to compare keyword vs embedding retrieval')
    args = ap.parse_args()

    # ── Imports ──
    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        print(f'ERROR: missing dependency ({e.name}).', file=sys.stderr)
        print('  Run: pip install sentence-transformers numpy', file=sys.stderr)
        return 2

    try:
        from ai_services.medical_rag import _build_chunks, retrieve as kw_retrieve
    except Exception as e:
        print(f'ERROR: could not import medical_rag: {type(e).__name__}: {e}',
              file=sys.stderr)
        return 3

    # ── Chunk the KB ──
    print('Building chunks from medical_knowledge.py ...')
    t0 = time.perf_counter()
    chunks = _build_chunks()
    print(f'  {len(chunks)} chunks ({time.perf_counter() - t0:.1f}s)')

    if not chunks:
        print('ERROR: no chunks produced — check medical_knowledge.py', file=sys.stderr)
        return 4

    # ── Embed ──
    print(f'Loading model: {args.model}')
    print('  (first run downloads ~80 MB to HF cache; subsequent runs are instant)')
    t0 = time.perf_counter()
    model = SentenceTransformer(args.model)
    print(f'  ready ({time.perf_counter() - t0:.1f}s)')

    print(f'Embedding {len(chunks)} chunks ...')
    t0 = time.perf_counter()
    texts = [c['text'] for c in chunks]
    vectors = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,   # cosine == dot product after this
    ).astype('float32')
    print(f'  {vectors.shape} ({time.perf_counter() - t0:.1f}s)')

    # ── Persist ──
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slim = [{'kind': c['kind'], 'key': c['key'], 'text': c['text']} for c in chunks]
    (OUT_DIR / 'chunks.json').write_text(
        json.dumps(slim, ensure_ascii=False, indent=1), encoding='utf-8',
    )
    np.save(OUT_DIR / 'vectors.npy', vectors)
    (OUT_DIR / 'model.txt').write_text(args.model, encoding='utf-8')

    rel = OUT_DIR.relative_to(REPO)
    print(f'\nWrote:')
    print(f'  {rel / "chunks.json"}   ({len(chunks)} entries)')
    print(f'  {rel / "vectors.npy"}   ({vectors.nbytes / 1024:.1f} KB)')
    print(f'  {rel / "model.txt"}     ({args.model})')

    # ── Optional sanity test ──
    if args.test:
        print('\n--- semantic vs keyword sanity test ---')
        test_queries = [
            'stain for mould or fungus',
            'low platelets',
            'kidney function test',
            'tube colour for clotting tests',
            'critical sodium value',
        ]
        for q in test_queries:
            print(f'\nQUERY: {q!r}')
            # Keyword baseline
            kw_hits = kw_retrieve(q, k=3)
            print(f'  keyword top-3:   {[(h["kind"], h["key"]) for h in kw_hits] or "(none)"}')
            # Embedding
            qv = model.encode([q], normalize_embeddings=True).astype('float32')[0]
            scores = vectors @ qv
            top = scores.argsort()[::-1][:3]
            emb_hits = [(chunks[i]['kind'], chunks[i]['key'], round(float(scores[i]), 3)) for i in top]
            print(f'  embedding top-3: {emb_hits}')

    print('\nDone. To wire this into medical_rag.py, add:')
    print("    from .rag_loader import retrieve_embed  # add the helper next")
    print("    chunks = retrieve_embed(query, k=5)     # call from answer_with_kb()")
    return 0


if __name__ == '__main__':
    sys.exit(main())
