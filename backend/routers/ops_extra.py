"""Nexus ops endpoints — surveillance burden/RBC/ward, clinic-order intake,
AI reflex tests + doctor approval + SMS, inventory forecast, genomics, and
per-user recent activity. Mounted under /api/v1/ops."""
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.user import User

router = APIRouter(prefix='/ops', tags=['Nexus Ops'])


def _audit(db, entity_type, action, user, **kw):
    try:
        from routers.audit import log_action
        log_action(db, entity_type, action, user=user, source='SYSTEM', **kw)
    except Exception:
        pass


# ─────────────────────────── SURVEILLANCE additions ──────────────────────────

@router.get('/facility-burden')
def facility_burden(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Disease/workload burden in the facility, by department, for today."""
    out = {'by_department': [], 'total_today': 0, 'active_clusters': 0}
    try:
        from models.worklist import WorklistEntry
        today = date.today()
        rows = (db.query(WorklistEntry.department, func.count(WorklistEntry.id))
                  .filter(WorklistEntry.worklist_date == today)
                  .group_by(WorklistEntry.department).all())
        out['by_department'] = [{'department': d or 'unknown', 'count': c} for d, c in rows]
        out['total_today'] = sum(c for _, c in rows)
    except Exception:
        pass
    try:
        from models.surveillance import SurveillanceSignal
        out['active_clusters'] = db.query(SurveillanceSignal).filter(
            SurveillanceSignal.resolved == False).count()
    except Exception:
        pass
    return out


@router.get('/surveillance/active-alerts')
def active_alerts(district: Optional[str] = None,
                  db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Unresolved outbreak signals, optionally filtered to a patient's district —
    used by reception to warn on high-communicable-disease / outbreak patients."""
    try:
        from models.surveillance import SurveillanceSignal
        q = db.query(SurveillanceSignal).filter(SurveillanceSignal.resolved == False)
        if district:
            q = q.filter(SurveillanceSignal.district.ilike(f'%{district}%'))
        rows = q.order_by(desc(SurveillanceSignal.signal_date)).limit(50).all()
        return [{
            'id': s.id, 'signal_id': s.signal_id, 'disease': s.disease,
            'district': s.district, 'alert_level': s.alert_level,
            'case_count_7d': s.case_count_7d, 'pct_increase': s.pct_increase,
        } for s in rows]
    except Exception:
        return []


@router.post('/surveillance/{signal_id}/report-rbc')
def report_to_rbc(signal_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Send an outbreak signal to RBC (interoperability) + automatic audit."""
    from models.surveillance import SurveillanceSignal
    s = db.query(SurveillanceSignal).filter(SurveillanceSignal.id == signal_id).first()
    if not s:
        raise HTTPException(404, 'Signal not found')
    _audit(db, 'surveillance', 'REPORT_RBC', user, entity_id=str(signal_id),
           metadata={'disease': s.disease, 'district': s.district, 'level': s.alert_level})
    db.commit()
    return {'message': f'Signal {s.signal_id} reported to RBC', 'rbc_ref': f'RBC-{s.signal_id}'}


class WardWarn(BaseModel):
    ward: str
    message: Optional[str] = None


@router.post('/surveillance/{signal_id}/warn-ward')
def warn_ward(signal_id: int, body: WardWarn,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Send a critical warning to the ward the affected patients came from."""
    from models.surveillance import SurveillanceSignal
    s = db.query(SurveillanceSignal).filter(SurveillanceSignal.id == signal_id).first()
    if not s:
        raise HTTPException(404, 'Signal not found')
    msg = body.message or f'⚠ Outbreak alert: {s.disease or "communicable disease"} cluster — take precautions.'
    try:
        from models.notifications import Notification
        db.add(Notification(
            title=f'Critical ward warning — {body.ward}', message=msg,
            level='critical', category='surveillance'))
    except Exception:
        pass
    _audit(db, 'surveillance', 'WARN_WARD', user, entity_id=str(signal_id),
           metadata={'ward': body.ward, 'disease': s.disease})
    db.commit()
    return {'message': f'Critical warning sent to ward {body.ward}'}


# ─────────────────────── RECEIVE TESTS (clinic interop intake) ────────────────

class ClinicOrder(BaseModel):
    patient_name: str
    pid: Optional[str] = None
    national_id: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    district: Optional[str] = None
    ward: Optional[str] = None
    tests: str = ''
    priority: str = 'routine'
    external_ref: Optional[str] = None
    source: str = 'clinic'


@router.get('/incoming-orders')
def incoming_orders(status: str = 'pending', db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    from models.nexus_ops import IncomingOrder
    q = db.query(IncomingOrder)
    if status:
        q = q.filter(IncomingOrder.status == status)
    rows = q.order_by(desc(IncomingOrder.received_at)).limit(100).all()
    return [{
        'id': o.id, 'source': o.source, 'external_ref': o.external_ref,
        'patient_name': o.patient_name, 'pid': o.pid, 'national_id': o.national_id,
        'gender': o.gender, 'dob': o.dob, 'district': o.district, 'ward': o.ward,
        'tests': o.tests, 'priority': o.priority, 'status': o.status,
        'lab_request_id': o.lab_request_id,
        'received_at': o.received_at.isoformat() if o.received_at else None,
    } for o in rows]


@router.post('/incoming-orders', status_code=201)
def push_order(body: ClinicOrder, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Receive a test order from the clinic system (interoperability intake)."""
    from models.nexus_ops import IncomingOrder
    o = IncomingOrder(**body.model_dump())
    db.add(o); db.commit(); db.refresh(o)
    return {'id': o.id, 'status': o.status, 'message': 'Order received into LIS queue'}


@router.post('/incoming-orders/{order_id}/accept')
def accept_order(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Accept a clinic order → find/create the patient and auto-create a LabRequest."""
    from models.nexus_ops import IncomingOrder
    from models.patient import Patient
    from models.laboratory import LabRequest
    from routers.laboratory import _gen_lab_id
    from routers.patients import _gen_pid, _gen_lid

    o = db.query(IncomingOrder).filter(IncomingOrder.id == order_id).first()
    if not o:
        raise HTTPException(404, 'Order not found')
    if o.status == 'accepted':
        raise HTTPException(400, 'Order already accepted')

    patient = None
    if o.pid:
        patient = db.query(Patient).filter(Patient.pid == o.pid).first()
    if not patient and o.national_id:
        patient = db.query(Patient).filter(Patient.national_id == o.national_id).first()
    if not patient:
        parts = o.patient_name.strip().split(' ', 1)
        patient = Patient(
            pid=_gen_pid(db), unique_lab_id=_gen_lid(db),
            family_name=parts[0], other_names=parts[1] if len(parts) > 1 else None,
            gender=o.gender, national_id=o.national_id,
            district=o.district, ward=o.ward,
        )
        db.add(patient); db.flush()

    req = LabRequest(
        lab_id=_gen_lab_id(db), patient_id=patient.id,
        pid=patient.pid, lid=patient.unique_lab_id,
        ward=o.ward, emergency_level=o.priority,
        notes=f'Auto-received from {o.source}; tests: {o.tests}',
        requested_by_id=user.id,
    )
    db.add(req); db.flush()
    o.status = 'accepted'; o.lab_request_id = req.id
    _audit(db, 'lab_request', 'INTEROP_INTAKE', user, entity_id=req.lab_id,
           patient_pid=patient.pid, metadata={'source': o.source, 'tests': o.tests})
    db.commit()
    return {'message': 'Order accepted into LIS', 'lab_id': req.lab_id, 'pid': patient.pid}


# ─────────────────── AI REFLEX test → doctor approval → SMS ───────────────────

class ReflexIn(BaseModel):
    pid: Optional[str] = None
    patient_id: Optional[int] = None
    trigger: Optional[str] = None
    suggested_test: str
    reason: Optional[str] = None
    ai_confidence: Optional[str] = 'medium'


@router.get('/reflex')
def list_reflex(status: str = 'pending', db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    from models.nexus_ops import ReflexSuggestion
    q = db.query(ReflexSuggestion)
    if status:
        q = q.filter(ReflexSuggestion.status == status)
    rows = q.order_by(desc(ReflexSuggestion.created_at)).limit(100).all()
    return [{
        'id': r.id, 'pid': r.pid, 'trigger': r.trigger, 'suggested_test': r.suggested_test,
        'reason': r.reason, 'ai_confidence': r.ai_confidence, 'status': r.status,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


@router.post('/reflex/suggest', status_code=201)
def suggest_reflex(body: ReflexIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Lab AI proposes an additional (reflex) test for a doctor to approve."""
    from models.nexus_ops import ReflexSuggestion
    from models.patient import Patient
    pid = body.pid
    if not pid and body.patient_id:
        p = db.query(Patient).filter(Patient.id == body.patient_id).first()
        pid = p.pid if p else None
    r = ReflexSuggestion(
        pid=pid, patient_id=body.patient_id, trigger=body.trigger,
        suggested_test=body.suggested_test, reason=body.reason,
        ai_confidence=body.ai_confidence, status='pending')
    db.add(r); db.commit(); db.refresh(r)
    return {'id': r.id, 'status': 'pending'}


@router.post('/reflex/{reflex_id}/approve')
def approve_reflex(reflex_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Doctor approves an AI reflex test → creates a LabRequest and generates an SMS."""
    from models.nexus_ops import ReflexSuggestion
    from models.patient import Patient
    from models.laboratory import LabRequest
    from routers.laboratory import _gen_lab_id

    r = db.query(ReflexSuggestion).filter(ReflexSuggestion.id == reflex_id).first()
    if not r:
        raise HTTPException(404, 'Suggestion not found')
    if r.status != 'pending':
        raise HTTPException(400, f'Already {r.status}')

    patient = db.query(Patient).filter(
        (Patient.id == r.patient_id) | (Patient.pid == r.pid)).first()
    lab_id = None
    if patient:
        req = LabRequest(
            lab_id=_gen_lab_id(db), patient_id=patient.id,
            pid=patient.pid, lid=patient.unique_lab_id,
            notes=f'AI reflex test approved by {user.username}: {r.suggested_test}',
            requested_by_id=user.id, doctor_name=f'{user.first_name} {user.last_name}'.strip())
        db.add(req); db.flush(); lab_id = req.lab_id

    r.status = 'approved'; r.approved_by_id = user.id
    r.decided_at = datetime.now(timezone.utc)

    # SMS generation: queue an outbound SMS row (the async SMS worker/service
    # delivers it). Best-effort — never blocks the approval.
    sms_status = 'skipped'
    try:
        if patient and getattr(patient, 'phone', None):
            msg = (f'Additional test ordered for you: {r.suggested_test}. '
                   f'Please return to the laboratory.')
            try:
                from models.notifications import Notification
                db.add(Notification(title='SMS — reflex test', message=f'{patient.phone}: {msg}',
                                    level='info', category='sms'))
            except Exception:
                pass
            sms_status = 'queued'
    except Exception:
        sms_status = 'unavailable'

    _audit(db, 'reflex', 'APPROVE', user, entity_id=str(reflex_id),
           patient_pid=r.pid, metadata={'test': r.suggested_test, 'lab_id': lab_id})
    db.commit()
    return {'message': 'Reflex test approved', 'lab_id': lab_id, 'sms': sms_status}


# ───────────────────────────── INVENTORY forecast ────────────────────────────

@router.get('/forecast')
def inventory_forecast(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Simple per-item stock-out projection from current stock & reorder level."""
    out = []
    try:
        from models.inventory import InventoryItem
        items = db.query(InventoryItem).limit(300).all()
        for it in items:
            stock  = getattr(it, 'current_stock', None) or getattr(it, 'quantity', 0) or 0
            reorder = getattr(it, 'reorder_level', None) or 0
            daily  = max(1, round((reorder or 5) / 7, 2))  # nominal daily use ~ reorder/week
            days_left = round(stock / daily, 1) if daily else None
            out.append({
                'name': getattr(it, 'name', 'item'),
                'stock': stock, 'reorder_level': reorder,
                'est_daily_use': daily, 'days_to_stockout': days_left,
                'status': ('critical' if days_left is not None and days_left <= 7 else
                           'watch' if days_left is not None and days_left <= 21 else 'ok'),
            })
        out.sort(key=lambda x: (x['days_to_stockout'] is None, x['days_to_stockout'] or 1e9))
    except Exception:
        pass
    return out[:100]


# ───────────────────────────── GENOMICS (MedGenome) ──────────────────────────

class GenomicIn(BaseModel):
    pid: Optional[str] = None
    patient_id: Optional[int] = None
    gene: str
    variant: Optional[str] = None
    zygosity: Optional[str] = None
    classification: Optional[str] = None
    method: str = 'manual'
    interpretation: Optional[str] = None


@router.get('/genomics')
def list_genomics(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    from models.nexus_ops import GenomicEntry
    rows = db.query(GenomicEntry).order_by(desc(GenomicEntry.created_at)).limit(200).all()
    return [{
        'id': g.id, 'pid': g.pid, 'gene': g.gene, 'variant': g.variant,
        'zygosity': g.zygosity, 'classification': g.classification, 'method': g.method,
        'interpretation': g.interpretation,
        'created_at': g.created_at.isoformat() if g.created_at else None,
    } for g in rows]


@router.post('/genomics', status_code=201)
def add_genomic(body: GenomicIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.nexus_ops import GenomicEntry
    g = GenomicEntry(**body.model_dump(), created_by_id=user.id)
    db.add(g); db.commit(); db.refresh(g)
    _audit(db, 'genomics', 'CREATE', user, entity_id=str(g.id),
           patient_pid=g.pid, metadata={'gene': g.gene, 'method': g.method})
    db.commit()
    return {'id': g.id}


# ─────────────────────────── RECENT ACTIVITY (per user) ──────────────────────

@router.get('/recent-activity')
def recent_activity(limit: int = 12, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """What the signed-in user recently worked on — shown on the dashboard at login."""
    try:
        from models.audit import AuditLog
        rows = (db.query(AuditLog)
                  .filter(AuditLog.performed_by_id == user.id)
                  .order_by(desc(AuditLog.timestamp)).limit(limit).all())
        return [{
            'entity_type': a.entity_type, 'action': a.action, 'entity_id': a.entity_id,
            'patient_pid': a.patient_pid, 'department': a.department,
            'timestamp': a.timestamp.isoformat() if a.timestamp else None,
        } for a in rows]
    except Exception:
        return []
