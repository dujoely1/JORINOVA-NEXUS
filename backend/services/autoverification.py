"""
Autoverification + delta-check + reflex engine for ALIS-X.

Ties together the existing models to make an auto-release decision for a numeric
LabResult:
  - ReferenceRange (age/sex/method-partitioned) -> flag (N/L/H/LL/HH)
  - delta check vs the patient's previous result for the same test
  - TestInterpretationRule.requires_doctor_confirmation -> hold
  - ReflexTestRule -> generate ReflexSuggestion(s)

Decision:
  AUTO_RELEASE  - normal, delta OK, no rule requires review  -> can validate + release
  HOLD_REVIEW   - abnormal / delta-fail / rule needs a human -> queue for validation
  CRITICAL_HOLD - critical flag (LL/HH)                      -> critical-callback + human

Nothing is auto-released unless the caller applies the decision; everything keeps
requires_human_review semantics.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

log = logging.getLogger('autoverification')

# Default delta-check limits (fraction change) — conservative; per-test overrides
# can be added later via TestCatalog metadata.
DEFAULT_DELTA_PCT = 0.50   # 50% change vs previous flags a delta warning


def flag_value(value: float, ref_min, ref_max, crit_low, crit_high) -> str:
    """N / L / H / LL / HH from numeric limits (mirrors ReferenceRange.flag_value)."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 'N'
    if crit_low is not None and v <= crit_low:
        return 'LL'
    if crit_high is not None and v >= crit_high:
        return 'HH'
    if ref_min is not None and v < ref_min:
        return 'L'
    if ref_max is not None and v > ref_max:
        return 'H'
    return 'N'


def _age_years(dob: Optional[str]) -> Optional[int]:
    if not dob:
        return None
    try:
        from datetime import date
        y = int(str(dob)[:4])
        return max(0, date.today().year - y)
    except Exception:
        return None


def resolve_reference_range(db: Session, test_id: int, sex: Optional[str] = None,
                            age: Optional[int] = None) -> Optional[dict]:
    """Best-matching active ReferenceRange for a test, partitioned by sex/age."""
    try:
        from models.core_config import ReferenceRange
    except Exception:
        return None
    rows = (db.query(ReferenceRange)
            .filter(ReferenceRange.test_id == test_id, ReferenceRange.is_active == True)  # noqa: E712
            .all())
    if not rows:
        return None

    def score(r):
        s = 0
        if sex and r.sex and r.sex.upper() == sex.upper():
            s += 2
        if r.sex in (None, ''):
            s += 0  # generic still valid
        if age is not None and r.age_min_years is not None and r.age_max_years is not None:
            if r.age_min_years <= age <= r.age_max_years:
                s += 3
        return s

    best = sorted(rows, key=score, reverse=True)[0]
    return {'min': best.min_value, 'max': best.max_value,
            'crit_low': best.critical_low, 'crit_high': best.critical_high,
            'unit': best.unit, 'source': best.source, 'method': best.method}


def previous_numeric(db: Session, pid: Optional[str], test_id: Optional[int],
                     exclude_result_id: Optional[int] = None) -> Optional[dict]:
    """Most recent prior validated numeric result for the same patient (pid) + test."""
    if not pid or not test_id:
        return None
    try:
        from models.laboratory import LabResult
    except Exception:
        return None
    q = (db.query(LabResult)
         .filter(LabResult.pid == pid, LabResult.test_id == test_id,
                 LabResult.numeric_value.isnot(None)))
    if exclude_result_id:
        q = q.filter(LabResult.id != exclude_result_id)
    prev = q.order_by(LabResult.entered_at.desc()).first()
    if not prev:
        return None
    return {'value': prev.numeric_value, 'when': prev.entered_at.isoformat() if prev.entered_at else None,
            'id': prev.id}


def delta_check(prev_value: Optional[float], new_value: float,
                pct_threshold: float = DEFAULT_DELTA_PCT) -> dict:
    """Compare a new numeric value against the previous one."""
    if prev_value is None:
        return {'available': False, 'flagged': False}
    try:
        prev, new = float(prev_value), float(new_value)
    except (TypeError, ValueError):
        return {'available': False, 'flagged': False}
    abs_delta = new - prev
    pct = (abs_delta / prev) if prev else None
    flagged = pct is not None and abs(pct) >= pct_threshold
    return {'available': True, 'previous': prev, 'current': new,
            'delta_abs': round(abs_delta, 4),
            'delta_pct': round(pct * 100, 1) if pct is not None else None,
            'direction': 'up' if abs_delta > 0 else ('down' if abs_delta < 0 else 'flat'),
            'flagged': bool(flagged),
            'threshold_pct': round(pct_threshold * 100, 1)}


def _reflex_rules(db: Session, test_id: int, flag: str) -> list:
    try:
        from models.core_config import ReflexTestRule
    except Exception:
        return []
    rows = (db.query(ReflexTestRule)
            .filter(ReflexTestRule.trigger_test_id == test_id,
                    ReflexTestRule.is_active == True)  # noqa: E712
            .all())
    out = []
    for r in rows:
        if r.trigger_flag and flag and r.trigger_flag.upper() not in (flag.upper(), 'ANY', ''):
            continue
        name = None
        try:
            name = r.suggested_test.name if r.suggested_test else None
        except Exception:
            name = None
        out.append({'suggested_test': name or f'test#{r.suggested_test_id}',
                    'suggested_test_id': r.suggested_test_id,
                    'type': r.suggestion_type, 'reason': r.reason,
                    'note_to_doctor': r.note_to_doctor})
    return out


def _interp_rule(db: Session, test_id: int, flag: str) -> Optional[dict]:
    try:
        from models.core_config import TestInterpretationRule
    except Exception:
        return None
    r = (db.query(TestInterpretationRule)
         .filter(TestInterpretationRule.test_id == test_id,
                 TestInterpretationRule.flag_trigger == flag,
                 TestInterpretationRule.is_active == True)  # noqa: E712
         .first())
    if not r:
        return None
    return {'interpretation': r.interpretation,
            'clinical_significance': r.clinical_significance,
            'requires_doctor_confirmation': bool(r.requires_doctor_confirmation),
            'doctor_urgency': r.doctor_urgency,
            'recommended_actions': r.recommended_actions or []}


def evaluate(db: Session, result, sex: Optional[str] = None, age: Optional[int] = None,
             qc_ok: bool = True) -> dict:
    """Run the full autoverification decision for a LabResult (or a compatible obj
    with numeric_value/test_id/pid/flag). Returns the decision — does NOT persist."""
    test_id = getattr(result, 'test_id', None)
    value = getattr(result, 'numeric_value', None)
    pid = getattr(result, 'pid', None)
    reasons: list[str] = []

    # 1) flag from stored flag or resolved reference range
    flag = getattr(result, 'flag', None)
    ref = resolve_reference_range(db, test_id, sex, age) if test_id else None
    if value is not None and ref:
        flag = flag_value(value, ref['min'], ref['max'], ref['crit_low'], ref['crit_high'])
    flag = (flag or 'N').upper()

    # 2) delta check
    prev = previous_numeric(db, pid, test_id, getattr(result, 'id', None)) if value is not None else None
    delta = delta_check(prev['value'] if prev else None, value) if value is not None else {'available': False, 'flagged': False}
    if delta.get('flagged'):
        reasons.append(f"delta {delta['delta_pct']}% vs previous ({delta['direction']})")

    # 3) interpretation rule (may force human confirmation)
    interp = _interp_rule(db, test_id, flag) if test_id else None
    needs_doc = bool(interp and interp.get('requires_doctor_confirmation'))
    if needs_doc:
        reasons.append('interpretation rule requires doctor confirmation')

    # 4) reflex suggestions
    reflexes = _reflex_rules(db, test_id, flag) if test_id else []

    # 5) decision
    if flag in ('LL', 'HH'):
        decision = 'CRITICAL_HOLD'
        reasons.insert(0, f'critical flag {flag}')
    elif not qc_ok:
        decision = 'HOLD_REVIEW'
        reasons.insert(0, 'QC not in control for this run/analyte')
    elif flag in ('L', 'H') or needs_doc or delta.get('flagged'):
        decision = 'HOLD_REVIEW'
        if flag in ('L', 'H'):
            reasons.append(f'abnormal flag {flag}')
    else:
        decision = 'AUTO_RELEASE'
        reasons.append('normal, delta OK, QC in control')

    return {'decision': decision, 'flag': flag, 'reasons': reasons,
            'delta': delta, 'reflex_suggestions': reflexes,
            'interpretation': interp, 'reference': ref,
            'requires_human_review': decision != 'AUTO_RELEASE'}


def apply(db: Session, result, decision: dict, user=None, commit: bool = True) -> dict:
    """Persist an autoverification decision onto a LabResult + spawn reflex
    suggestions; hand criticals to the critical-callback service."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    dec = decision['decision']
    result.flag = decision['flag']
    applied = {'decision': dec, 'validated': False, 'reflex_created': 0, 'critical_id': None}

    if dec == 'AUTO_RELEASE':
        result.is_validated = True
        result.validated_at = now
        result.status = 'VALIDATED'
        if user is not None:
            result.validated_by_id = getattr(user, 'id', None)
        applied['validated'] = True
    else:
        result.status = 'PENDING'  # stays in the validation queue for a human

    # reflex suggestions
    try:
        from models.nexus_ops import ReflexSuggestion
        for rx in decision.get('reflex_suggestions', []):
            db.add(ReflexSuggestion(
                patient_id=None, pid=getattr(result, 'pid', None),
                lab_request_id=getattr(result, 'lab_request_id', None),
                trigger=f"{decision['flag']} on test#{getattr(result, 'test_id', '')}",
                suggested_test=rx['suggested_test'], reason=rx.get('reason'),
                ai_confidence='rule', status='pending'))
            applied['reflex_created'] += 1
    except Exception as e:
        log.debug('reflex suggestion skipped: %s', e)

    # critical callback
    if dec == 'CRITICAL_HOLD':
        try:
            from services import critical_callback
            entry = critical_callback.record_from_result(db, result, user=user, commit=False)
            applied['critical_id'] = getattr(entry, 'id', None)
        except Exception as e:
            log.debug('critical callback skipped: %s', e)

    if commit:
        db.commit()
    return applied
