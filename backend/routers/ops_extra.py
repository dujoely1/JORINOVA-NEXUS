"""Nexus ops endpoints — surveillance burden/RBC/ward, clinic-order intake,
AI reflex tests + doctor approval + SMS, inventory forecast, genomics, and
per-user recent activity. Mounted under /api/v1/ops."""
import os
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
    # Live RBC interoperability when RBC_API_URL is configured; otherwise the
    # report is recorded locally (simulated) until RBC exposes an endpoint.
    rbc_url = os.environ.get('RBC_API_URL', '').strip()
    delivered = False
    if rbc_url:
        try:
            import httpx
            resp = httpx.post(
                f'{rbc_url.rstrip("/")}/surveillance/report',
                json={'signal_id': s.signal_id, 'disease': s.disease, 'district': s.district,
                      'alert_level': s.alert_level, 'case_count_7d': s.case_count_7d},
                headers={'Authorization': f'Bearer {os.environ.get("RBC_API_TOKEN", "")}'},
                timeout=10,
            )
            delivered = resp.is_success
        except Exception:
            delivered = False
    _audit(db, 'surveillance', 'REPORT_RBC', user, entity_id=str(signal_id),
           metadata={'disease': s.disease, 'district': s.district, 'level': s.alert_level,
                     'delivered': delivered})
    db.commit()
    return {'message': f'Signal {s.signal_id} reported to RBC', 'rbc_ref': f'RBC-{s.signal_id}',
            'mode': 'live' if rbc_url else 'simulated', 'delivered': delivered}


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
async def approve_reflex(reflex_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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

    # SMS generation via the real SMS service — delivers through the configured
    # provider (SMS_PROVIDER + AT_*/PINDO_* env vars) or queues to sms_queue if
    # none is set. Never blocks the approval.
    sms_status = 'skipped'
    if patient and getattr(patient, 'phone', None):
        try:
            from services.sms_service import send_sms
            res = await send_sms(
                patient.phone,
                f'Additional test ordered for you: {r.suggested_test}. Please return to the laboratory.',
                'reflex', patient.id, patient.pid, db,
            )
            sms_status = res.get('status', 'queued')
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


# ─────────────── SMART INVENTORY — charts, near-expiry, exchange ──────────────

@router.get('/inventory/chart-stats')
def inventory_chart_stats(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Aggregates for the Smart Inventory pie + histogram."""
    from models.inventory import InventoryItem
    items = db.query(InventoryItem).filter(InventoryItem.is_active == True).all()
    by_cat, status = {}, {'ok': 0, 'low': 0, 'out': 0}
    buckets = {'expired': 0, '<30d': 0, '30-90d': 0, '90-180d': 0, '>180d': 0, 'none': 0}
    today = date.today()
    for it in items:
        by_cat[it.category or 'other'] = by_cat.get(it.category or 'other', 0) + 1
        qty = it.quantity or 0; mn = it.min_stock or 0
        status['out' if qty <= 0 else 'low' if qty <= mn else 'ok'] += 1
        exp = it.expiry_date
        if not exp: buckets['none'] += 1
        else:
            d = (exp - today).days
            buckets['expired' if d < 0 else '<30d' if d <= 30 else '30-90d' if d <= 90
                   else '90-180d' if d <= 180 else '>180d'] += 1
    return {
        'by_category': [{'label': k, 'value': v} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
        'by_status':   [{'label': k, 'value': v} for k, v in status.items()],
        'expiry_buckets': [{'label': k, 'value': v} for k, v in buckets.items() if k != 'none'],
        'total': len(items),
    }


@router.get('/inventory/near-expiry')
def near_expiry(days: int = 90, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """Items expiring within `days` — candidates for inter-hospital exchange."""
    from models.inventory import InventoryItem
    today = date.today(); horizon = today + timedelta(days=days)
    rows = (db.query(InventoryItem)
              .filter(InventoryItem.is_active == True, InventoryItem.expiry_date != None,
                      InventoryItem.expiry_date <= horizon, InventoryItem.quantity > 0)
              .order_by(InventoryItem.expiry_date).limit(200).all())
    return [{
        'id': it.id, 'name': it.name, 'category': it.category, 'quantity': it.quantity,
        'unit': it.unit, 'lot_number': it.lot_number,
        'expiry_date': it.expiry_date.isoformat() if it.expiry_date else None,
        'days_left': (it.expiry_date - today).days if it.expiry_date else None,
    } for it in rows]


@router.get('/rbc/hospitals')
def rbc_hospitals(_u: User = Depends(get_current_user)):
    """AI read-only snapshot of other hospitals (as seen on the RBC dashboard) —
    which facilities are short of which categories, to route near-expiry stock.
    Reads the live RBC API when RBC_API_URL is set; otherwise a simulated view."""
    rbc_url = os.environ.get('RBC_API_URL', '').strip()
    if rbc_url:
        try:
            import httpx
            resp = httpx.get(
                f'{rbc_url.rstrip("/")}/hospitals/stock-status',
                headers={'Authorization': f'Bearer {os.environ.get("RBC_API_TOKEN", "")}'},
                timeout=10,
            )
            if resp.is_success:
                return resp.json()
        except Exception:
            pass
    return [
        {'hospital': 'Ruhengeri Referral Hospital', 'district': 'Musanze', 'needs': ['reagent', 'consumable'], 'status': 'low'},
        {'hospital': 'Byumba District Hospital',     'district': 'Gicumbi', 'needs': ['reagent'],             'status': 'critical'},
        {'hospital': 'Nemba District Hospital',      'district': 'Gakenke', 'needs': ['consumable', 'control'],'status': 'low'},
        {'hospital': 'Kinihira Provincial Hospital', 'district': 'Rulindo', 'needs': ['reagent', 'kit'],      'status': 'ok'},
    ]


class OfferIn(BaseModel):
    item_name: str
    category: Optional[str] = None
    quantity: float = 0
    unit: Optional[str] = None
    expiry_date: Optional[str] = None
    lot_number: Optional[str] = None
    to_hospital: Optional[str] = None
    note: Optional[str] = None


@router.get('/exchange/offers')
def list_offers(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    from models.nexus_ops import ExchangeOffer
    rows = db.query(ExchangeOffer).order_by(desc(ExchangeOffer.created_at)).limit(100).all()
    return [{
        'id': o.id, 'item_name': o.item_name, 'category': o.category, 'quantity': o.quantity,
        'unit': o.unit, 'expiry_date': o.expiry_date, 'lot_number': o.lot_number,
        'to_hospital': o.to_hospital, 'status': o.status,
        'created_at': o.created_at.isoformat() if o.created_at else None,
    } for o in rows]


@router.post('/exchange/offers', status_code=201)
def create_offer(body: OfferIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Offer a near-expiry item to another hospital (+ automatic audit)."""
    from models.nexus_ops import ExchangeOffer
    o = ExchangeOffer(**body.model_dump(), created_by_id=user.id)
    db.add(o); db.flush()
    _audit(db, 'inventory_exchange', 'OFFER', user, entity_id=str(o.id),
           metadata={'item': o.item_name, 'qty': o.quantity, 'to': o.to_hospital})
    db.commit(); db.refresh(o)
    return {'id': o.id, 'status': o.status}


@router.post('/exchange/offers/{offer_id}/status')
def set_offer_status(offer_id: int, status: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.nexus_ops import ExchangeOffer
    o = db.query(ExchangeOffer).filter(ExchangeOffer.id == offer_id).first()
    if not o:
        raise HTTPException(404, 'Offer not found')
    o.status = status
    _audit(db, 'inventory_exchange', status.upper(), user, entity_id=str(offer_id))
    db.commit()
    return {'id': o.id, 'status': o.status}


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


class GenomicLookupIn(BaseModel):
    gene: str = ''
    variant: Optional[str] = ''
    rsid: Optional[str] = ''


@router.post('/genomics/lookup')
async def lookup_genomic(body: GenomicLookupIn, _u: User = Depends(get_current_user)):
    """Auto-classify a variant from ClinVar (NCBI, keyless), with a Claude LLM
    ACMG-style fallback. Only the gene symbol + variant notation are sent
    externally — never patient data. The UI pre-fills these; a human still saves."""
    if not (body.gene or '').strip() and not (body.rsid or '').strip():
        raise HTTPException(400, 'gene or rsID is required')
    from ai_services.genomic_lookup import lookup_variant
    return await lookup_variant(body.gene or '', body.variant or '', body.rsid or '')


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


# ─────────────── RESULT INTERPRETATION (reference ranges + rules) ─────────────

class InterpretIn(BaseModel):
    results: list           # [{'test': 'hb', 'value': 8.1}, ...]
    sex: Optional[str] = None
    age: Optional[int] = None


@router.post('/interpret')
def interpret_results(body: InterpretIn, _u: User = Depends(get_current_user)):
    """Flag lab values against reference ranges and derive clinical patterns
    (anaemia type, coagulation pathway, renal, thyroid, diabetes, critical values)."""
    from ai_services.reference_ranges import interpret
    return interpret(body.results, body.sex, body.age)


@router.get('/glossary')
def glossary(q: str, _u: User = Depends(get_current_user)):
    """Look up a medical term / abbreviation / acronym (English + French)."""
    from ai_services.glossary import lookup
    return lookup(q)


@router.get('/knowledge')
def lab_knowledge(q: Optional[str] = None, topic: Optional[str] = None,
                  _u: User = Depends(get_current_user)):
    """Curated lab interpretation knowledge: chemistry, endocrine, tumour markers,
    coagulation, serology, urinalysis, body-fluid, blood-gas, semen, microbiology
    AST, toxicology and haematology neoplasms. `q` = keyword search; `topic` = a
    whole KB; no args = list available topics."""
    from ai_services.reference_ranges import search_kb, knowledge, KB
    if q:
        return {'query': q, 'results': search_kb(q)}
    if topic:
        return {'topic': topic, 'knowledge': knowledge(topic)}
    return {'topics': sorted(KB.keys())}
