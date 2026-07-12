"""
Critical-value closed-loop callback for ALIS-X.

A critical result must be actively communicated and acknowledged — not just filed.
This service drives the loop on top of models.laboratory.CriticalResultBook
(which already has clinician_notified / notification_method / read_back_confirmed):

  record  -> a critical entry is created (with an integrity hash)
  notify  -> clinician contacted (method + name logged; best-effort SMS)
  acknowledge -> read-back confirmed by the clinician (closes the loop)
  overdue -> entries not acknowledged within the SLA -> escalate to HoD

Timestamps use archived_at (creation) + notes trail; read_back_confirmed closes it.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

log = logging.getLogger('critical_callback')

ACK_SLA_MINUTES = 30   # clinician must acknowledge a critical within 30 min


def _now():
    return datetime.now(timezone.utc)


def _entry_number(db: Session) -> str:
    from models.laboratory import CriticalResultBook
    year = datetime.now().year
    n = db.query(CriticalResultBook).filter(
        CriticalResultBook.entry_number.like(f'CRIT-{year}-%')).count()
    return f'CRIT-{year}-{str(n + 1).zfill(4)}'


def _hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def record(db: Session, *, patient_id: int, test_name: str, result_value: str,
           flag: str, unit: Optional[str] = None, reference_range: Optional[str] = None,
           lab_request_id: Optional[int] = None, validated_by_id: Optional[int] = None,
           commit: bool = True):
    """Create a critical-result-book entry (idempotent-ish by entry number)."""
    from models.laboratory import CriticalResultBook
    entry = CriticalResultBook(
        entry_number=_entry_number(db), patient_id=patient_id, lab_request_id=lab_request_id,
        test_name=test_name, result_value=str(result_value), unit=unit, flag=flag,
        reference_range=reference_range, validated_by_id=validated_by_id,
        clinician_notified=False, read_back_confirmed=False)
    entry.pqc_hash = _hash({'pid': patient_id, 'test': test_name, 'value': result_value,
                            'flag': flag, 'at': _now().isoformat()})
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry


def record_from_result(db: Session, result, user=None, commit: bool = True):
    """Create a critical entry directly from a LabResult."""
    patient_id = None
    try:
        patient_id = result.lab_request.patient_id if result.lab_request else None
    except Exception:
        patient_id = None
    test_name = None
    try:
        test_name = result.test.name if result.test else None
    except Exception:
        test_name = None
    ref = None
    if result.reference_min is not None or result.reference_max is not None:
        ref = f'{result.reference_min}-{result.reference_max} {result.unit or ""}'.strip()
    return record(db, patient_id=patient_id or 0,
                  test_name=test_name or (result.value or 'result'),
                  result_value=result.value or (str(result.numeric_value) if result.numeric_value is not None else ''),
                  flag=result.flag or 'HH', unit=result.unit, reference_range=ref,
                  lab_request_id=getattr(result, 'lab_request_id', None),
                  validated_by_id=getattr(user, 'id', None) if user else None, commit=commit)


def notify(db: Session, entry_id: int, clinician_name: str, method: str = 'phone',
           user=None, send_sms_to: Optional[str] = None) -> dict:
    """Log that the clinician was contacted; best-effort SMS."""
    from models.laboratory import CriticalResultBook
    entry = db.get(CriticalResultBook, entry_id)
    if not entry:
        raise ValueError('critical entry not found')
    entry.clinician_notified = True
    entry.clinician_name = clinician_name
    entry.notification_method = method
    sms_sent = False
    if send_sms_to:
        try:
            from services.sms_service import send_sms  # best-effort
            send_sms(send_sms_to, f'CRITICAL {entry.test_name} = {entry.result_value} '
                                  f'({entry.flag}). Please acknowledge with read-back.')
            sms_sent = True
        except Exception as e:
            log.debug('critical SMS skipped: %s', e)
    db.commit()
    return {'entry_id': entry_id, 'clinician_notified': True, 'method': method,
            'clinician': clinician_name, 'sms_sent': sms_sent,
            'awaiting_read_back': not entry.read_back_confirmed}


def acknowledge(db: Session, entry_id: int, read_back: bool = True, user=None) -> dict:
    """Clinician confirms the value by read-back — closes the loop."""
    from models.laboratory import CriticalResultBook
    entry = db.get(CriticalResultBook, entry_id)
    if not entry:
        raise ValueError('critical entry not found')
    if not entry.clinician_notified:
        entry.clinician_notified = True   # acknowledging implies contact happened
    entry.read_back_confirmed = bool(read_back)
    db.commit()
    return {'entry_id': entry_id, 'read_back_confirmed': entry.read_back_confirmed,
            'closed': entry.read_back_confirmed}


def overdue(db: Session, minutes: int = ACK_SLA_MINUTES) -> list:
    """Critical entries not acknowledged within the SLA -> need escalation."""
    from models.laboratory import CriticalResultBook
    cutoff = _now() - timedelta(minutes=minutes)
    rows = (db.query(CriticalResultBook)
            .filter(CriticalResultBook.read_back_confirmed == False)  # noqa: E712
            .filter(CriticalResultBook.archived_at <= cutoff)
            .order_by(CriticalResultBook.archived_at.asc())
            .all())
    return [{'entry_id': r.id, 'entry_number': r.entry_number, 'test': r.test_name,
             'value': r.result_value, 'flag': r.flag, 'patient_id': r.patient_id,
             'notified': r.clinician_notified, 'clinician': r.clinician_name,
             'minutes_open': round((_now() - r.archived_at).total_seconds() / 60, 1) if r.archived_at else None}
            for r in rows]


def escalate(db: Session, entry_id: int, to: Optional[str] = None, note: Optional[str] = None) -> dict:
    """Escalate an unacknowledged critical to the Head of Department (best-effort SMS)."""
    from models.laboratory import CriticalResultBook
    entry = db.get(CriticalResultBook, entry_id)
    if not entry:
        raise ValueError('critical entry not found')
    payload = {'entry_number': entry.entry_number, 'test': entry.test_name,
               'value': entry.result_value, 'flag': entry.flag, 'to': to or 'HoD',
               'note': note or 'Unacknowledged critical result — SLA breached.'}
    sent = False
    if to:
        try:
            from services.sms_service import send_sms
            send_sms(to, f'ESCALATION: unacknowledged CRITICAL {entry.test_name}='
                         f'{entry.result_value} ({entry.flag}). Ref {entry.entry_number}.')
            sent = True
        except Exception as e:
            log.debug('escalation SMS skipped: %s', e)
    entry.notification_method = (entry.notification_method or '') + '|escalated'
    db.commit()
    return {**payload, 'escalation_sms_sent': sent}
