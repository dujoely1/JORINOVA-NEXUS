"""
Staff Mobile Hub — backend for the Android companion app.
=========================================================
The Android app is a secure field extension of JORINOVA NEXUS. This router is
the server side it talks to. It reuses existing subsystems where they already
exist (LeaveRequest, Notification, StaffProfile photo) and adds the new field
pieces (device registration, inventory requests, field/GeoTrack activities).

Every write that can be retried from an offline queue accepts a client
`txn_id`; a repeat with the same id returns the original record instead of
creating a duplicate.

Endpoints (under /api/v1/staff-mobile):
  POST /devices/register             register this Android device (pending approval)
  GET  /devices                      list devices (admin: all, else: own)
  POST /devices/{id}/approve         admin approves a device
  POST /leave-request                request annual/sick/… leave
  POST /inventory-request            request consumables / reagents / equipment
  POST /field-activity               file a field / outreach / GeoTrack report
  POST /check-in    /check-out       field check-in / check-out with optional GPS
  GET  /notifications                my notifications + emergency alerts
  POST /staff/{user_id}/photo        upload/update a staff photo (admin or self)
  POST /patient/{patient_id}/photo   upload/update a patient photo
  POST /sync                         flush a batch of queued offline operations
"""
from __future__ import annotations

import json
import os
import uuid
import logging
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.staff_mobile import MobileDevice, StaffInventoryRequest, FieldActivity

router = APIRouter(prefix='/staff-mobile', tags=['Staff Mobile Hub'])
log = logging.getLogger('alis_x.staff_mobile')

ADMIN_ROLES = {'super_admin', 'it_admin', 'lab_manager'}
MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / 'media'
MEDIA_DIR.mkdir(exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(u: User) -> bool:
    return bool(getattr(u, 'is_superuser', False)) or (u.role in ADMIN_ROLES)


def _save_photo(file: UploadFile, prefix: str) -> str:
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
        ext = '.jpg'
    name = f'{prefix}_{uuid.uuid4().hex[:12]}{ext}'
    data = file.file.read()
    if not data or len(data) < 64:
        raise HTTPException(400, 'Empty or invalid image')
    (MEDIA_DIR / name).write_bytes(data)
    return f'/media/{name}'


def _dedup(db: Session, model, txn_id: Optional[str]):
    """Return an existing record for this offline txn_id, or None."""
    if not txn_id:
        return None
    return db.query(model).filter(model.txn_id == txn_id).first()


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeviceIn(BaseModel):
    device_id:   str
    device_name: Optional[str] = None
    push_token:  Optional[str] = None
    platform:    str = 'android'


class LeaveIn(BaseModel):
    leave_type: str = 'ANNUAL'        # ANNUAL|SICK|MATERNITY|STUDY|EMERGENCY
    start_date: str                   # YYYY-MM-DD
    end_date:   str
    reason:     Optional[str] = None
    txn_id:     Optional[str] = None


class InventoryIn(BaseModel):
    item_name: str
    item_code: Optional[str] = None
    quantity:  float = 1.0
    unit:      Optional[str] = None
    reason:    Optional[str] = None
    txn_id:    Optional[str] = None


class FieldIn(BaseModel):
    activity_type: str = 'OUTREACH'
    title:       Optional[str] = None
    notes:       Optional[str] = None
    latitude:    Optional[float] = None
    longitude:   Optional[float] = None
    photo_urls:  Optional[list[str]] = None
    sample_data: Optional[dict] = None
    occurred_at: Optional[str] = None
    txn_id:      Optional[str] = None


class GeoIn(BaseModel):
    latitude:  Optional[float] = None
    longitude: Optional[float] = None
    note:      Optional[str] = None
    txn_id:    Optional[str] = None


class SyncIn(BaseModel):
    operations: list[dict]            # [{op, payload}], op ∈ leave|inventory|field|check_in|check_out


# ── Device registration ───────────────────────────────────────────────────────

@router.post('/devices/register', status_code=201)
def register_device(body: DeviceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dev = db.query(MobileDevice).filter(MobileDevice.device_id == body.device_id).first()
    if dev:
        dev.user_id     = user.id
        dev.device_name = body.device_name or dev.device_name
        dev.push_token  = body.push_token or dev.push_token
        dev.last_seen   = datetime.now(timezone.utc)
        created = False
    else:
        dev = MobileDevice(
            user_id=user.id, device_id=body.device_id, device_name=body.device_name,
            platform=body.platform, push_token=body.push_token, is_approved=False,
            last_seen=datetime.now(timezone.utc),
        )
        db.add(dev)
        created = True
    db.commit(); db.refresh(dev)
    return {'id': dev.id, 'device_id': dev.device_id, 'is_approved': dev.is_approved,
            'created': created, 'message': 'Device registered — awaiting admin approval' if not dev.is_approved else 'Device active'}


@router.get('/devices')
def list_devices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(MobileDevice)
    if not _is_admin(user):
        q = q.filter(MobileDevice.user_id == user.id)
    return [{'id': d.id, 'user_id': d.user_id, 'device_id': d.device_id, 'device_name': d.device_name,
             'platform': d.platform, 'is_approved': d.is_approved, 'last_seen': d.last_seen} for d in q.all()]


@router.post('/devices/{device_pk}/approve')
def approve_device(device_pk: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(403, 'Admin access required')
    dev = db.query(MobileDevice).filter(MobileDevice.id == device_pk).first()
    if not dev:
        raise HTTPException(404, 'Device not found')
    dev.is_approved = True
    dev.approved_by_id = user.id
    dev.approved_at = datetime.now(timezone.utc)
    db.commit()
    return {'id': dev.id, 'is_approved': True, 'message': 'Device approved'}


# ── Leave request (reuses the existing LeaveRequest + StaffProfile) ────────────

@router.post('/leave-request', status_code=201)
def leave_request(body: LeaveIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.staffhub import StaffProfile, LeaveRequest
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(400, 'No staff profile is linked to your account — ask an administrator to create one in StaffHub.')
    try:
        sd = date.fromisoformat(body.start_date)
        ed = date.fromisoformat(body.end_date)
    except ValueError:
        raise HTTPException(400, 'Dates must be YYYY-MM-DD')
    days = max(1, (ed - sd).days + 1)
    lr = LeaveRequest(staff_id=profile.id, leave_type=body.leave_type.upper(),
                      start_date=sd, end_date=ed, days=days, reason=body.reason, status='PENDING')
    db.add(lr); db.commit(); db.refresh(lr)
    return {'id': lr.id, 'status': lr.status, 'days': lr.days, 'message': 'Leave request submitted'}


# ── Inventory request ─────────────────────────────────────────────────────────

@router.post('/inventory-request', status_code=201)
def inventory_request(body: InventoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dup = _dedup(db, StaffInventoryRequest, body.txn_id)
    if dup:
        return {'id': dup.id, 'status': dup.status, 'duplicate': True}
    req = StaffInventoryRequest(
        staff_user_id=user.id, item_name=body.item_name, item_code=body.item_code,
        quantity=body.quantity, unit=body.unit, reason=body.reason, status='PENDING',
        txn_id=body.txn_id,
    )
    db.add(req); db.commit(); db.refresh(req)
    return {'id': req.id, 'status': req.status, 'message': 'Inventory request submitted'}


# ── Field activity / GeoTrack ─────────────────────────────────────────────────

def _create_field(db: Session, user: User, activity_type: str, *, title=None, notes=None,
                  lat=None, lng=None, photo_urls=None, sample_data=None, occurred_at=None, txn_id=None):
    dup = _dedup(db, FieldActivity, txn_id)
    if dup:
        return dup, True
    occ = None
    if occurred_at:
        try: occ = datetime.fromisoformat(occurred_at)
        except ValueError: occ = None
    fa = FieldActivity(
        staff_user_id=user.id, activity_type=activity_type.upper(), title=title, notes=notes,
        latitude=lat, longitude=lng,
        photo_urls=json.dumps(photo_urls) if photo_urls else None,
        sample_data=json.dumps(sample_data) if sample_data else None,
        occurred_at=occ or datetime.now(timezone.utc), txn_id=txn_id,
    )
    db.add(fa); db.commit(); db.refresh(fa)
    return fa, False


@router.post('/field-activity', status_code=201)
def field_activity(body: FieldIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fa, dup = _create_field(db, user, body.activity_type, title=body.title, notes=body.notes,
                            lat=body.latitude, lng=body.longitude, photo_urls=body.photo_urls,
                            sample_data=body.sample_data, occurred_at=body.occurred_at, txn_id=body.txn_id)
    return {'id': fa.id, 'activity_type': fa.activity_type, 'duplicate': dup, 'message': 'Field activity recorded'}


@router.get('/field-activities')
def list_field_activities(
    activity_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Field / GeoTrack feed for the Surveillance module. Admins/managers see
    all activities; other staff see only their own."""
    q = db.query(FieldActivity)
    if not _is_admin(user):
        q = q.filter(FieldActivity.staff_user_id == user.id)
    if activity_type:
        q = q.filter(FieldActivity.activity_type == activity_type.upper())
    rows = q.order_by(FieldActivity.occurred_at.desc().nullslast(),
                      FieldActivity.created_at.desc()).limit(limit).all()
    # Resolve staff names in one pass
    uids = {r.staff_user_id for r in rows}
    names = {u.id: (u.full_name if hasattr(u, 'full_name') else u.username)
             for u in db.query(User).filter(User.id.in_(uids)).all()} if uids else {}
    out = []
    for r in rows:
        photos = []
        try:
            photos = json.loads(r.photo_urls) if r.photo_urls else []
        except Exception:
            photos = []
        out.append({
            'id': r.id, 'staff': names.get(r.staff_user_id, f'user #{r.staff_user_id}'),
            'activity_type': r.activity_type, 'title': r.title, 'notes': r.notes,
            'latitude': r.latitude, 'longitude': r.longitude, 'photos': photos,
            'status': r.status, 'occurred_at': r.occurred_at,
        })
    return out


@router.post('/check-in', status_code=201)
def check_in(body: GeoIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fa, dup = _create_field(db, user, 'CHECK_IN', notes=body.note, lat=body.latitude, lng=body.longitude, txn_id=body.txn_id)
    return {'id': fa.id, 'type': 'CHECK_IN', 'at': fa.occurred_at, 'duplicate': dup}


@router.post('/check-out', status_code=201)
def check_out(body: GeoIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fa, dup = _create_field(db, user, 'CHECK_OUT', notes=body.note, lat=body.latitude, lng=body.longitude, txn_id=body.txn_id)
    return {'id': fa.id, 'type': 'CHECK_OUT', 'at': fa.occurred_at, 'duplicate': dup}


# ── Notifications + emergency alerts ──────────────────────────────────────────

@router.get('/notifications')
def my_notifications(unread_only: bool = False, limit: int = Query(50, ge=1, le=200),
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.notifications import Notification
    q = db.query(Notification).filter(Notification.recipient_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [{'id': n.id, 'type': n.notif_type, 'title': n.title, 'body': n.body,
             'priority': n.priority, 'is_read': n.is_read, 'action_url': getattr(n, 'action_url', None),
             'created_at': n.created_at} for n in rows]


# ── Photo capture (patient / staff) ───────────────────────────────────────────

@router.post('/staff/{user_id}/photo')
def staff_photo(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.id != user_id and not _is_admin(user):
        raise HTTPException(403, 'You can only update your own photo')
    from models.staffhub import StaffProfile
    url = _save_photo(file, f'staff_{user_id}')
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user_id).first()
    if profile:
        profile.photo_url = url
    target = db.query(User).filter(User.id == user_id).first()
    if target and hasattr(target, 'photo_url'):
        target.photo_url = url
    db.commit()
    return {'user_id': user_id, 'photo_url': url, 'message': 'Staff photo updated'}


@router.post('/patient/{patient_id}/photo')
def patient_photo(patient_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.patient import Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, 'Patient not found')
    url = _save_photo(file, f'patient_{patient_id}')
    if hasattr(patient, 'photo_url'):
        patient.photo_url = url
    db.commit()
    return {'patient_id': patient_id, 'photo_url': url, 'message': 'Patient photo updated'}


# ── Offline batch sync ────────────────────────────────────────────────────────

@router.post('/sync')
def sync_batch(body: SyncIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Flush a queue of offline operations. Each item: {op, payload}.
    Idempotent per payload.txn_id so retries never duplicate."""
    results = []
    for item in body.operations:
        op = (item.get('op') or '').lower()
        p  = item.get('payload') or {}
        try:
            if op == 'inventory':
                r = inventory_request(InventoryIn(**p), db, user)
            elif op == 'field':
                r = field_activity(FieldIn(**p), db, user)
            elif op == 'check_in':
                r = check_in(GeoIn(**p), db, user)
            elif op == 'check_out':
                r = check_out(GeoIn(**p), db, user)
            elif op == 'leave':
                r = leave_request(LeaveIn(**p), db, user)
            else:
                r = {'error': f'unknown op: {op}'}
            results.append({'op': op, 'txn_id': p.get('txn_id'), 'result': r})
        except HTTPException as e:
            results.append({'op': op, 'txn_id': p.get('txn_id'), 'error': e.detail})
        except Exception as e:                       # never let one bad item fail the batch
            results.append({'op': op, 'txn_id': p.get('txn_id'), 'error': str(e)})
    return {'synced': len(results), 'results': results}
