"""
SOP service — upload, compress, and retrieve Standard Operating Procedures so
the AI can learn each module's principles / procedures / interpretation.

- Uploaded text is COMPRESSED (gzip + base64) before storage.
- `extract_text` pulls text from txt/csv/md and (if pypdfium2 is present) PDF.
- `retrieve` does lightweight keyword RAG over stored SOPs for a module/query,
  returning short excerpts to inject into the interpretation prompt.
Decision support; the SOP itself + a qualified scientist govern practice.
"""
from __future__ import annotations
import base64
import gzip
import logging
import re
from typing import Optional

logger = logging.getLogger('sop_service')


def compress_text(text: str) -> str:
    return base64.b64encode(gzip.compress((text or '').encode('utf-8'))).decode('ascii')


def decompress_text(gz: Optional[str]) -> str:
    if not gz:
        return ''
    try:
        return gzip.decompress(base64.b64decode(gz)).decode('utf-8', 'ignore')
    except Exception as e:
        logger.debug('sop decompress failed: %s', e)
        return ''


def extract_text(filename: str, data: bytes) -> str:
    """Best-effort text extraction. PDF via pypdfium2 if available; otherwise
    decode as text. Never raises."""
    name = (filename or '').lower()
    if name.endswith('.pdf') or data[:5] == b'%PDF-':
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(data)
            out = []
            for i in range(len(pdf)):
                out.append(pdf[i].get_textpage().get_text_range())
            return '\n'.join(out).strip()
        except Exception as e:
            logger.info('PDF text extraction unavailable (%s) — storing raw decode', e)
    try:
        return data.decode('utf-8', 'ignore').strip()
    except Exception:
        return ''


def summarize(text: str, limit: int = 400) -> str:
    """Compact preview (first meaningful lines) — a cheap offline summary."""
    lines = [ln.strip() for ln in re.split(r'[\r\n]+', text or '') if ln.strip()]
    s = ' '.join(lines)[:limit]
    return s + ('…' if len(' '.join(lines)) > limit else '')


def retrieve(db, query: str, module: Optional[str] = None, limit: int = 3) -> list[dict]:
    """Keyword RAG over stored SOPs -> [{id, title, module, excerpt}]. Prefers the
    given module, then falls back to a global keyword scan."""
    from models.nexus_ops import SopDocument
    terms = [t for t in re.split(r'[^a-z0-9]+', (query or '').lower()) if len(t) > 2]
    q = db.query(SopDocument)
    rows = (q.filter(SopDocument.module == module).all() if module else []) or q.limit(50).all()
    scored = []
    for r in rows:
        text = decompress_text(r.content_gz)
        low = text.lower()
        score = sum(low.count(t) for t in terms) if terms else 0
        if module and r.module == module:
            score += 1                      # module match is a baseline signal
        if score <= 0 and not (module and r.module == module):
            continue
        scored.append((score, r, text))
    scored.sort(key=lambda x: -x[0])
    out = []
    for score, r, text in scored[:limit]:
        excerpt = _best_excerpt(text, terms) or summarize(text, 300)
        out.append({'id': r.id, 'title': r.title, 'module': r.module, 'excerpt': excerpt})
    return out


def _best_excerpt(text: str, terms: list[str], width: int = 300) -> str:
    low = (text or '').lower()
    pos = -1
    for t in terms:
        i = low.find(t)
        if i >= 0:
            pos = i
            break
    if pos < 0:
        return ''
    start = max(0, pos - width // 3)
    return ('…' if start else '') + text[start:start + width].strip() + '…'
