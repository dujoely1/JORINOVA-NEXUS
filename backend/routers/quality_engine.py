"""
Lab quality engine router — autoverification + delta-check, full Westgard QC
evaluation, and the critical-value closed-loop callback. Builds on the existing
models (LabResult, ReferenceRange, IQCResult, CriticalResultBook) and services.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.user import User

router = APIRouter(prefix='/lab-engine', tags=['Lab Quality Engine'])


# ── Autoverification + delta ──────────────────────────────────────────────────
@router.post('/autoverify/{result_id}')
def autoverify(result_id: int, apply: bool = False, qc_ok: bool = True,
               sex: Optional[str] = None, age: Optional[int] = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run the autoverification decision for a LabResult; optionally persist it
    (auto-release normals, hold abnormal/critical/delta-fail, spawn reflexes)."""
    from models.laboratory import LabResult
    from services import autoverification as av
    res = db.get(LabResult, result_id)
    if not res:
        raise HTTPException(404, 'result not found')
    # derive sex/age from patient if not supplied
    if (sex is None or age is None):
        try:
            p = res.lab_request.patient if res.lab_request else None
            sex = sex or getattr(p, 'sex', None) or getattr(p, 'gender', None)
            age = age if age is not None else av._age_years(getattr(p, 'dob', None) or getattr(p, 'date_of_birth', None))
        except Exception:
            pass
    decision = av.evaluate(db, res, sex=sex, age=age, qc_ok=qc_ok)
    applied = av.apply(db, res, decision, user=user) if apply else None
    return {'result_id': result_id, **decision, 'applied': applied}


class DeltaIn(BaseModel):
    pid: str
    test_id: int
    value: float


@router.post('/delta-check')
def delta_check(body: DeltaIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Delta-check a value against the patient's previous result for the same test."""
    from services import autoverification as av
    prev = av.previous_numeric(db, body.pid, body.test_id)
    return {'pid': body.pid, 'test_id': body.test_id,
            **av.delta_check(prev['value'] if prev else None, body.value),
            'previous_result': prev}


# ── Full Westgard QC ──────────────────────────────────────────────────────────
class WestgardIn(BaseModel):
    lot_number: str
    value: float
    analyte_name: Optional[str] = None
    control_level: Optional[str] = None
    mean: Optional[float] = None
    sd: Optional[float] = None


@router.post('/qc/westgard')
def westgard(body: WestgardIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Evaluate a QC value with the full Westgard multi-rule set (no DB write)."""
    from services.qc_service import QCService
    try:
        return QCService.evaluate_westgard(db, body.lot_number, body.value,
                                           analyte_name=body.analyte_name,
                                           control_level=body.control_level,
                                           mean=body.mean, sd=body.sd)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Critical-value closed loop ────────────────────────────────────────────────
class CriticalIn(BaseModel):
    patient_id: int
    test_name: str
    result_value: str
    flag: str = 'HH'
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    lab_request_id: Optional[int] = None


class NotifyIn(BaseModel):
    clinician_name: str
    method: str = 'phone'
    send_sms_to: Optional[str] = None


class AckIn(BaseModel):
    read_back: bool = True


class EscalateIn(BaseModel):
    to: Optional[str] = None
    note: Optional[str] = None


@router.post('/critical/record', status_code=201)
def critical_record(body: CriticalIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from services import critical_callback as cc
    entry = cc.record(db, patient_id=body.patient_id, test_name=body.test_name,
                      result_value=body.result_value, flag=body.flag, unit=body.unit,
                      reference_range=body.reference_range, lab_request_id=body.lab_request_id,
                      validated_by_id=user.id)
    return {'entry_id': entry.id, 'entry_number': entry.entry_number,
            'awaiting': 'notify -> read-back acknowledge'}


@router.post('/critical/{entry_id}/notify')
def critical_notify(entry_id: int, body: NotifyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from services import critical_callback as cc
    try:
        return cc.notify(db, entry_id, body.clinician_name, body.method, user=user, send_sms_to=body.send_sms_to)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post('/critical/{entry_id}/acknowledge')
def critical_ack(entry_id: int, body: AckIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from services import critical_callback as cc
    try:
        return cc.acknowledge(db, entry_id, read_back=body.read_back, user=user)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get('/critical/overdue')
def critical_overdue(minutes: int = 30, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Critical results not acknowledged within the SLA — need HoD escalation."""
    from services import critical_callback as cc
    rows = cc.overdue(db, minutes)
    return {'sla_minutes': minutes, 'count': len(rows), 'overdue': rows}


@router.post('/critical/{entry_id}/escalate')
def critical_escalate(entry_id: int, body: EscalateIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    from services import critical_callback as cc
    try:
        return cc.escalate(db, entry_id, to=body.to, note=body.note)
    except ValueError as e:
        raise HTTPException(404, str(e))
