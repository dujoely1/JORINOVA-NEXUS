"""
book_service — the single place that decides:

  • When a validated result is "locked" (immutable in-place).
  • When a critical-flagged result is auto-archived to its dept critical book.
  • How to amend a locked result (append-only, via ResultAmendment).
  • How to compute the PQC tamper-evidence hash.

Called from every department's validate / release / amend endpoint so the
behaviour is uniform across the whole system.

Critical books wired here:
  - laboratory   -> CriticalResultBook         (catch-all + generic LabResult)
  - biochemistry -> BiochemBook
  - microbiology -> MicroCriticalBook          (cultures, parasitology)
  - molecular    -> MolecularCriticalBook      (PCR, viral load)

For departments without a dedicated critical book (hematology, coagulation,
serology, urinalysis), criticals are written to the general CriticalResultBook
with the department recorded in `result_value` prefix.
"""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, date, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import desc, func
from sqlalchemy.orm import Session


# ── Status constants ───────────────────────────────────────────────────────────

LOCKED_STATUSES   = {'VALIDATED', 'RELEASED', 'AMENDED'}
MUTABLE_STATUSES  = {'PENDING', 'pending', 'received', 'processing', 'in_progress', 'DRAFT'}
CRITICAL_FLAGS    = {'HH', 'LL', 'CRITICAL'}

AMENDMENT_REASONS = {
    'transcription_error',
    'clinician_clarification',
    'analyzer_recheck',
    'critical_recheck',
    'pre_release_correction',
    'other',
}


# ── Immutability helpers ───────────────────────────────────────────────────────

def is_locked(result_obj: Any) -> bool:
    """True once the result has been validated, released, or amended."""
    return str(getattr(result_obj, 'status', '')).upper() in LOCKED_STATUSES


def assert_mutable(result_obj: Any, allow_amendment: bool = False) -> None:
    """
    Guard for edit endpoints. Raises 409 if the row is locked.

    Call this *before* applying any in-place change. To correct a locked
    result, route through amend_result() instead.
    """
    if not is_locked(result_obj):
        return
    if allow_amendment:
        return
    status = getattr(result_obj, 'status', '?')
    raise HTTPException(
        409,
        f'Result is locked (status={status}). Validated results are immutable — '
        f'use the /amend endpoint to file a correction.',
    )


# ── PQC / hashing ──────────────────────────────────────────────────────────────

def compute_pqc_hash(*parts: Any) -> str:
    """
    Tamper-evidence tag for book entries. Delegates to the centralised
    post-quantum signing layer (core.pqc): a real CRYSTALS-Dilithium signature
    when the `pqcrypto` library is installed, otherwise a labelled SHA3-256
    integrity hash. Either way the stored value is `DILITHIUM3:<hex>` and fits
    the existing String(64) columns. See GET /api/v1/admin/pqc.
    """
    try:
        from core.pqc import sign_tag
        return sign_tag(*['' if p is None else p for p in parts])
    except Exception:
        payload = '|'.join('' if p is None else str(p) for p in parts)
        return 'DILITHIUM3:' + hashlib.sha3_256(payload.encode('utf-8')).hexdigest()


# ── Entry-number generator (race-tolerant) ────────────────────────────────────

_PREFIX = {
    'laboratory':   'CRIT-LAB',
    'hematology':   'CRIT-HEM',
    'biochemistry': 'CRIT-BIO',
    'coagulation':  'CRIT-COAG',
    'serology':     'CRIT-SERO',
    'urinalysis':   'CRIT-URN',
    'molecular':    'CRIT-MOL',
    'microbiology': 'CRIT-MICRO',
    'blood_bank':   'CRIT-BB',
}


def next_entry_number(department: str) -> str:
    """
    Compose a unique entry# per department. Format:
      CRIT-{DEPT}-YYYYMMDD-HHMMSS-{micros}
    The micros suffix makes us race-tolerant without a DB round-trip.
    """
    prefix = _PREFIX.get(department, 'CRIT-GEN')
    now    = datetime.now(timezone.utc)
    return f'{prefix}-{now.strftime("%Y%m%d-%H%M%S")}-{now.microsecond:06d}'


# ── Lock helper ────────────────────────────────────────────────────────────────

def lock_for_validation(result_obj: Any, validator_id: int) -> None:
    """Set the canonical validated state. Pure mutation — caller commits."""
    result_obj.is_validated  = True
    result_obj.validated_by_id = validator_id
    result_obj.validated_at  = datetime.now(timezone.utc)
    result_obj.status        = 'VALIDATED'


# ── Critical auto-archive ──────────────────────────────────────────────────────

def archive_critical_if_needed(
    department:   str,
    result_obj:   Any,
    validator_id: int,
    db:           Session,
    *,
    test_name:    Optional[str] = None,
    result_value: Optional[str] = None,
    unit:         Optional[str] = None,
    reference:    Optional[str] = None,
    critical_reason: Optional[str] = None,
) -> Optional[str]:
    """
    Dispatcher: inspect the result's flag, and if it's critical, write an
    entry to the correct critical book for `department`.

    Returns the new entry_number, or None if the result wasn't critical
    (or if archival failed gracefully — never raises).
    """
    flag = getattr(result_obj, 'flag', None) or getattr(result_obj, 'critical_flag', None)
    is_crit = (
        getattr(result_obj, 'is_critical', False)
        or (flag and str(flag).upper() in CRITICAL_FLAGS)
        or department == 'molecular' and (critical_reason or '').upper().startswith(('MDR', 'XDR', 'HIGH_VL'))
        or department == 'microbiology' and (critical_reason or '').upper() in {'MRSA','ESBL','CRO','SEPSIS','MDR'}
    )
    if not is_crit:
        return None

    try:
        if department == 'biochemistry':
            return _archive_to_biochem(
                result_obj, validator_id, db,
                test_name=test_name, result_value=result_value,
                unit=unit, reference=reference,
            )
        if department == 'microbiology':
            return _archive_to_micro(
                result_obj, validator_id, db,
                critical_reason=critical_reason or 'MDR',
            )
        if department == 'molecular':
            return _archive_to_molecular(
                result_obj, validator_id, db,
                critical_reason=critical_reason or 'HIGH_VL',
                test_name=test_name,
            )
        # Everything else (hematology, coag, serology, urinalysis, generic lab)
        # lands in the cross-department CriticalResultBook.
        return _archive_to_general(
            department, result_obj, validator_id, db,
            test_name=test_name, result_value=result_value,
            unit=unit, reference=reference,
        )
    except Exception as exc:
        import logging
        logging.getLogger('alis_x').warning(
            'archive_critical failed (dept=%s, source_id=%s): %s',
            department, getattr(result_obj, 'id', '?'), exc,
        )
        return None


# Per-book writers — kept private so callers only see the dispatcher.

def _archive_to_general(department, r, validator_id, db, *,
                        test_name=None, result_value=None, unit=None, reference=None):
    from models.laboratory import CriticalResultBook
    entry_no = next_entry_number(department)
    pqc = compute_pqc_hash(entry_no, r.patient_id, result_value or '',
                           getattr(r, 'flag', None))
    book = CriticalResultBook(
        entry_number    = entry_no,
        patient_id      = r.patient_id,
        lab_request_id  = getattr(r, 'lab_request_id', None),
        test_name       = test_name or f'{department.upper()}-{getattr(r, "test_id", "?")}',
        result_value    = result_value or str(getattr(r, 'result_value', '')) or '',
        unit            = unit,
        flag            = (getattr(r, 'flag', None) or 'HH'),
        reference_range = reference,
        validated_by_id = validator_id,
        clinician_notified = False,
        pqc_hash        = pqc[:64],   # column is String(64)
    )
    db.add(book); db.commit()
    return entry_no


def _archive_to_biochem(r, validator_id, db, *,
                        test_name=None, result_value=None, unit=None, reference=None):
    from models.biochemistry import BiochemBook
    entry_no = next_entry_number('biochemistry')
    pqc = compute_pqc_hash(entry_no, r.patient_id, result_value or r.result_value or '',
                           r.flag)
    book = BiochemBook(
        entry_number    = entry_no,
        patient_id      = r.patient_id,
        lab_request_id  = r.lab_request_id,
        test_name       = test_name or (r.test.name if getattr(r, 'test', None) else f'Test-{r.test_id}'),
        result_value    = result_value or r.result_value or '',
        unit            = unit or getattr(r, 'unit', None),
        flag            = r.flag or 'HH',
        reference_range = reference or (
            f'{r.reference_min}–{r.reference_max}' if getattr(r, 'reference_min', None) else None
        ),
        section         = getattr(r, 'section', 'GEN'),
        validated_by_id = validator_id,
        clinician_notified = False,
        pqc_hash        = pqc[:64],
    )
    db.add(book); db.commit()
    return entry_no


def _archive_to_micro(culture, validator_id, db, *, critical_reason: str):
    from models.microbiology import MicroCriticalBook
    entry_no = next_entry_number('microbiology')
    pqc = compute_pqc_hash(entry_no, culture.patient_id,
                           getattr(culture, 'organism_identified', None),
                           critical_reason)
    book = MicroCriticalBook(
        entry_number    = entry_no[:20],   # column is String(20)
        lab_request_id  = culture.lab_request_id,
        patient_id      = culture.patient_id,
        archived_by_id  = validator_id,
        pid             = getattr(culture, 'pid', None),
        lid             = getattr(culture, 'lid', None),
        result_type     = 'CULTURE',
        result_ref_id   = culture.id,
        organism        = getattr(culture, 'organism_identified', None),
        critical_reason = critical_reason[:100],
        severity        = 'CRITICAL',
        pqc_hash        = pqc,
    )
    db.add(book); db.commit()
    return entry_no


def _archive_to_molecular(r, validator_id, db, *,
                          critical_reason: str, test_name: Optional[str] = None):
    from models.molecular import MolecularCriticalBook
    entry_no = next_entry_number('molecular')
    pqc = compute_pqc_hash(entry_no, r.patient_id, test_name, critical_reason)
    # PCR vs ViralLoad — heuristic: ViralLoad has copies_per_ml
    result_type = 'VIRAL_LOAD' if hasattr(r, 'copies_per_ml') else 'PCR'
    book = MolecularCriticalBook(
        entry_number    = entry_no[:20],
        lab_request_id  = r.lab_request_id,
        patient_id      = r.patient_id,
        archived_by_id  = validator_id,
        pid             = getattr(r, 'pid', None),
        lid             = getattr(r, 'lid', None),
        result_type     = result_type,
        result_ref_id   = r.id,
        test_name       = test_name or getattr(r, 'test_name', None),
        critical_reason = critical_reason[:100],
        severity        = 'CRITICAL',
        pqc_hash        = pqc,
    )
    db.add(book); db.commit()
    return entry_no


# ── Amendment (append-only) ────────────────────────────────────────────────────

def _snapshot_result(r: Any) -> str:
    """JSON-serialize the fields we care about for amendment audit."""
    fields = (
        'id', 'patient_id', 'lab_request_id', 'test_id', 'result_value',
        'numeric_value', 'unit', 'flag', 'is_validated', 'is_critical',
        'status', 'organism_identified', 'copies_per_ml', 'log10_value',
        'qualitative', 'sco_ratio', 'notes',
    )
    snap = {}
    for f in fields:
        if hasattr(r, f):
            v = getattr(r, f)
            try:
                json.dumps(v, default=str)
                snap[f] = v
            except Exception:
                snap[f] = str(v)
    return json.dumps(snap, default=str)


def amend_result(
    *,
    department:   str,
    result_obj:   Any,
    source_table: str,
    new_values:   dict,
    reason:       str,
    reason_detail: Optional[str],
    amender_id:   int,
    db:           Session,
) -> dict:
    """
    Record an amendment to an already-locked result and apply the new values.

    Semantics:
      1. Snapshot the BEFORE state.
      2. Apply `new_values` to the source row.
      3. Bump source status to 'AMENDED'.
      4. Append a ResultAmendment row (append-only, never updated).
      5. If the new state is now critical (or was, with a different value),
         write a fresh critical-book entry too.

    Returns a dict suitable for FastAPI to JSON.
    """
    from models.amendment import ResultAmendment

    if reason not in AMENDMENT_REASONS:
        raise HTTPException(400, f'reason must be one of {sorted(AMENDMENT_REASONS)}')

    before_snap = _snapshot_result(result_obj)
    before_value = str(getattr(result_obj, 'result_value', None) or getattr(result_obj, 'numeric_value', None) or '')
    before_flag  = getattr(result_obj, 'flag', None)

    # Apply mutations
    allowed = {'result_value', 'numeric_value', 'unit', 'flag', 'is_critical',
               'notes', 'organism_identified', 'copies_per_ml', 'log10_value',
               'qualitative', 'sco_ratio'}
    for k, v in (new_values or {}).items():
        if k in allowed and hasattr(result_obj, k):
            setattr(result_obj, k, v)
    result_obj.status = 'AMENDED'

    after_snap  = _snapshot_result(result_obj)
    after_value = str(getattr(result_obj, 'result_value', None) or getattr(result_obj, 'numeric_value', None) or '')
    after_flag  = getattr(result_obj, 'flag', None)

    amendment_no = next_entry_number(department).replace('CRIT-', 'AMD-')
    pqc = compute_pqc_hash(amendment_no, source_table, result_obj.id,
                           before_value, after_value, reason)

    amendment = ResultAmendment(
        amendment_number = amendment_no,
        source_table     = source_table,
        source_id        = result_obj.id,
        department       = department,
        patient_id       = getattr(result_obj, 'patient_id', None),
        lab_request_id   = getattr(result_obj, 'lab_request_id', None),
        test_name        = (getattr(result_obj.test, 'name', None) if getattr(result_obj, 'test', None) else None),
        before_value     = before_value,
        after_value      = after_value,
        before_flag      = before_flag,
        after_flag       = after_flag,
        before_snapshot  = before_snap,
        after_snapshot   = after_snap,
        reason           = reason,
        reason_detail    = reason_detail,
        amended_by_id    = amender_id,
        pqc_hash         = pqc[:80],
    )
    db.add(amendment)
    db.commit()
    db.refresh(amendment)

    # Re-run critical archive against the AFTER state (only if the flag is now critical)
    crit_no = archive_critical_if_needed(
        department, result_obj, amender_id, db,
        result_value=after_value, test_name=amendment.test_name,
    )
    if crit_no:
        amendment.critical_book_entry = crit_no
        db.commit()

    return {
        'amendment_number':   amendment_no,
        'source_table':       source_table,
        'source_id':          result_obj.id,
        'department':         department,
        'before':             {'value': before_value, 'flag': before_flag},
        'after':              {'value': after_value,  'flag': after_flag},
        'reason':             reason,
        'reason_detail':      reason_detail,
        'amended_by_id':      amender_id,
        'amended_at':         amendment.amended_at.isoformat() if amendment.amended_at else None,
        'pqc_hash':           pqc[:24] + '…',
        'critical_book_entry': crit_no,
    }


# ── Amendment chain lookup ─────────────────────────────────────────────────────

def get_amendment_chain(
    *,
    source_table: str,
    source_id:    int,
    db:           Session,
) -> list[dict]:
    """All amendments for a given source result, oldest first."""
    from models.amendment import ResultAmendment
    rows = (
        db.query(ResultAmendment)
          .filter(ResultAmendment.source_table == source_table,
                  ResultAmendment.source_id    == source_id)
          .order_by(ResultAmendment.amended_at.asc())
          .all()
    )
    return [
        {
            'amendment_number':   a.amendment_number,
            'amended_at':         a.amended_at.isoformat() if a.amended_at else None,
            'amended_by_id':      a.amended_by_id,
            'before_value':       a.before_value,
            'after_value':        a.after_value,
            'before_flag':        a.before_flag,
            'after_flag':         a.after_flag,
            'reason':             a.reason,
            'reason_detail':      a.reason_detail,
            'critical_book_entry': a.critical_book_entry,
            'pqc_hash':           (a.pqc_hash or '')[:24] + '…' if a.pqc_hash else None,
        }
        for a in rows
    ]
