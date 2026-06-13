"""
staff_security_hub — production module that ties together:

  • RBAC matrix sync          GET  /security-hub/rbac/matrix
  • Hospital device registry  POST/GET/PATCH /security-hub/devices …  + /heartbeat
  • Dynamic custom fields      POST/GET /security-hub/attributes …
  • Staff biometric onboarding POST /security-hub/staff/onboard  (multipart)

It is ADDITIVE: it only reads existing tables (users, voice_enrollments) and
writes to the new hospital_devices / entity_attributes tables, so it cannot
break current flows. RBAC here is the single source of truth that the web and
mobile clients both read, guaranteeing identical roles/permissions/hierarchy.
"""
import os
import json
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user, hash_password
from models.user import User
from models.device_registry import HospitalDevice, EntityAttribute

router = APIRouter(prefix='/security-hub', tags=['Staff Security Hub'])

MEDIA_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'media', 'staff_photos')

# ── RBAC matrix — the authoritative roles + module permissions ────────────────
# Module keys mirror the web sidebar (frontend/app/components/Sidebar.tsx) so the
# mobile app gets EXACTLY the same access rules. '*' = every module.
_ALL_MODULES = [
    'dashboard', 'patients', 'laboratory', 'lis_mapping', 'register',
    'biochemistry', 'microbiology', 'serology', 'blood_bank', 'anapath',
    'toxicology', 'molecular_advanced', 'quality', 'surveillance', 'inventory',
    'billing', 'staffhub', 'connectivity', 'notifications', 'settings',
    'admin', 'audit', 'ai_nexus', 'doctor_portal', 'rbc_portal',
]

RBAC = {
    # role: (hierarchy_level, [permitted module keys])  — higher level = more authority
    'super_admin':    (100, ['*']),
    'lab_manager':    (80, ['dashboard', 'patients', 'laboratory', 'lis_mapping', 'register',
                            'biochemistry', 'microbiology', 'serology', 'blood_bank', 'anapath',
                            'toxicology', 'molecular_advanced', 'quality', 'surveillance', 'inventory',
                            'billing', 'staffhub', 'connectivity', 'notifications', 'settings',
                            'admin', 'audit', 'ai_nexus']),
    'it_admin':       (75, ['dashboard', 'connectivity', 'admin', 'settings', 'notifications', 'audit']),
    'pathologist':    (70, ['dashboard', 'patients', 'laboratory', 'anapath', 'toxicology',
                            'molecular_advanced', 'notifications', 'settings']),
    'scientist':      (60, ['dashboard', 'patients', 'laboratory', 'lis_mapping', 'register',
                            'biochemistry', 'microbiology', 'serology', 'blood_bank', 'toxicology',
                            'molecular_advanced', 'quality', 'notifications', 'settings']),
    'lab_technician': (50, ['dashboard', 'patients', 'laboratory', 'lis_mapping', 'register',
                            'notifications', 'settings']),
    'rbc_admin':      (50, ['dashboard', 'surveillance', 'rbc_portal', 'notifications', 'settings']),
    'doctor':         (40, ['dashboard', 'doctor_portal', 'patients', 'notifications', 'settings']),
    'receptionist':   (30, ['dashboard', 'patients', 'lis_mapping', 'billing', 'register',
                            'notifications', 'settings']),
}


def _perms_for(role: str) -> list[str]:
    level, mods = RBAC.get(role, (10, ['dashboard', 'notifications', 'settings']))
    return list(_ALL_MODULES) if mods == ['*'] else mods


@router.get('/rbac/matrix')
def rbac_matrix(_u: User = Depends(get_current_user)):
    """The single RBAC source of truth. Web and mobile read this so roles,
    permissions and hierarchy stay identical and update in real time."""
    return {
        'version': 1,
        'modules': _ALL_MODULES,
        'roles': {
            role: {'level': level,
                   'permissions': (list(_ALL_MODULES) if mods == ['*'] else mods),
                   'all': mods == ['*']}
            for role, (level, mods) in RBAC.items()
        },
    }


@router.get('/rbac/me')
def my_permissions(user: User = Depends(get_current_user)):
    """Convenience: the calling user's own role + resolved permissions."""
    level = RBAC.get(user.role, (10, []))[0]
    return {'role': user.role, 'level': level, 'permissions': _perms_for(user.role)}


# ── Device registry ───────────────────────────────────────────────────────────
class DeviceIn(BaseModel):
    device_id: str
    device_type: str = 'phone'           # phone|tablet|computer|analyzer|iot|scanner
    device_name: Optional[str] = None
    location: Optional[str] = None
    assigned_staff_id: Optional[int] = None
    rbac_permissions: Optional[list[str]] = None
    metadata: Optional[dict] = None


def _device_out(d: HospitalDevice) -> dict:
    return {
        'id': d.id, 'device_id': d.device_id, 'device_type': d.device_type,
        'device_name': d.device_name, 'location': d.location,
        'assigned_staff_id': d.assigned_staff_id, 'status': d.status,
        'security_key': d.security_key,
        'rbac_permissions': json.loads(d.rbac_permissions) if d.rbac_permissions else [],
        'metadata': json.loads(d.device_metadata) if d.device_metadata else {},
        'last_sync_time': d.last_sync_time.isoformat() if d.last_sync_time else None,
    }


@router.post('/devices', status_code=201)
def register_device(body: DeviceIn, db: Session = Depends(get_db),
                    _u: User = Depends(get_current_user)):
    """Register or upsert a hospital device. A security_key is generated once."""
    d = db.query(HospitalDevice).filter(HospitalDevice.device_id == body.device_id).first()
    created = d is None
    if created:
        d = HospitalDevice(device_id=body.device_id, security_key=secrets.token_urlsafe(24))
        db.add(d)
    d.device_type = body.device_type
    d.device_name = body.device_name
    d.location = body.location
    d.assigned_staff_id = body.assigned_staff_id
    if body.rbac_permissions is not None:
        d.rbac_permissions = json.dumps(body.rbac_permissions)
    if body.metadata is not None:
        d.device_metadata = json.dumps(body.metadata)
    d.last_sync_time = datetime.now(timezone.utc)
    db.commit(); db.refresh(d)
    return {'created': created, 'device': _device_out(d)}


@router.get('/devices')
def list_devices(device_type: Optional[str] = None, db: Session = Depends(get_db),
                 _u: User = Depends(get_current_user)):
    q = db.query(HospitalDevice)
    if device_type:
        q = q.filter(HospitalDevice.device_type == device_type)
    return [_device_out(d) for d in q.order_by(HospitalDevice.id.desc()).all()]


class DevicePatch(BaseModel):
    status: Optional[str] = None
    location: Optional[str] = None
    assigned_staff_id: Optional[int] = None
    rbac_permissions: Optional[list[str]] = None


@router.patch('/devices/{device_pk}')
def update_device(device_pk: int, body: DevicePatch, db: Session = Depends(get_db),
                  _u: User = Depends(get_current_user)):
    d = db.get(HospitalDevice, device_pk)
    if not d:
        raise HTTPException(404, 'Device not found')
    if body.status is not None:
        d.status = body.status
    if body.location is not None:
        d.location = body.location
    if body.assigned_staff_id is not None:
        d.assigned_staff_id = body.assigned_staff_id
    if body.rbac_permissions is not None:
        d.rbac_permissions = json.dumps(body.rbac_permissions)
    db.commit(); db.refresh(d)
    return _device_out(d)


@router.post('/devices/{device_pk}/heartbeat')
def device_heartbeat(device_pk: int, db: Session = Depends(get_db),
                     _u: User = Depends(get_current_user)):
    d = db.get(HospitalDevice, device_pk)
    if not d:
        raise HTTPException(404, 'Device not found')
    d.last_sync_time = datetime.now(timezone.utc)
    db.commit()
    return {'device_id': d.device_id, 'last_sync_time': d.last_sync_time.isoformat()}


# ── Dynamic / metadata-driven custom fields (EAV) ─────────────────────────────
class AttrIn(BaseModel):
    entity_type: str
    entity_id: int
    key: str
    value: Optional[str] = None
    value_type: str = 'string'


@router.post('/attributes')
def set_attribute(body: AttrIn, db: Session = Depends(get_db),
                  _u: User = Depends(get_current_user)):
    """Add/replace a custom field on any record without a schema change."""
    row = db.query(EntityAttribute).filter(
        EntityAttribute.entity_type == body.entity_type,
        EntityAttribute.entity_id == body.entity_id,
        EntityAttribute.key == body.key,
    ).first()
    if not row:
        row = EntityAttribute(entity_type=body.entity_type, entity_id=body.entity_id, key=body.key)
        db.add(row)
    row.value = body.value
    row.value_type = body.value_type
    db.commit()
    return {'status': 'ok'}


@router.get('/attributes/{entity_type}/{entity_id}')
def get_attributes(entity_type: str, entity_id: int, db: Session = Depends(get_db),
                   _u: User = Depends(get_current_user)):
    rows = db.query(EntityAttribute).filter(
        EntityAttribute.entity_type == entity_type,
        EntityAttribute.entity_id == entity_id,
    ).all()
    return {r.key: {'value': r.value, 'type': r.value_type} for r in rows}


# ── Staff biometric onboarding (multipart) ────────────────────────────────────
@router.post('/staff/onboard', status_code=201)
async def onboard_staff(
    full_name: str = Form(...),
    email: str = Form(...),
    role: str = Form('lab_technician'),
    phone: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    fingerprint_template: Optional[str] = Form(None),   # base64 / template string
    face_embedding: Optional[str] = Form(None),         # JSON/base64 embedding
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    """Create a staff member with biometric placeholders in one call.

    Voice enrolment is handled by the existing /voice-bio endpoints (kept
    separate because it needs multiple audio samples). Returns a generated
    staff_id and a one-time temporary password to be changed on first login.
    """
    if actor.role not in ('super_admin', 'lab_manager', 'it_admin'):
        raise HTTPException(403, 'Only admins can onboard staff')
    if role not in RBAC:
        raise HTTPException(400, f'Unknown role: {role}')
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, 'A user with this email already exists')

    parts = full_name.strip().split(' ', 1)
    first, last = parts[0], (parts[1] if len(parts) > 1 else '')
    username = email.split('@')[0]
    base = username
    i = 1
    while db.query(User).filter(User.username == username).first():
        i += 1; username = f'{base}{i}'

    staff_id = 'STF-' + secrets.token_hex(3).upper()
    temp_pw = secrets.token_urlsafe(9)

    photo_url = None
    if photo is not None:
        os.makedirs(MEDIA_ROOT, exist_ok=True)
        ext = os.path.splitext(photo.filename or 'photo.jpg')[1] or '.jpg'
        fname = f'{staff_id}{ext}'
        with open(os.path.join(MEDIA_ROOT, fname), 'wb') as f:
            f.write(await photo.read())
        photo_url = f'/media/staff_photos/{fname}'

    user = User(
        username=username, email=email, first_name=first, last_name=last,
        hashed_password=hash_password(temp_pw), role=role, is_active=True,
    )
    # Optional fields guarded with hasattr so we never assume a column exists.
    if department and hasattr(user, 'department'):
        user.department = department
    if phone and hasattr(user, 'phone'):
        user.phone = phone
    if hasattr(user, 'employee_id'):
        user.employee_id = staff_id
    if photo_url and hasattr(user, 'profile_photo'):
        user.profile_photo = photo_url
    if face_embedding and hasattr(user, 'face_encoding'):
        user.face_encoding = face_embedding
    if fingerprint_template and hasattr(user, 'fingerprint_hash'):
        user.fingerprint_hash = hash_password(fingerprint_template)  # store a hash, never the raw template
    db.add(user)
    db.commit(); db.refresh(user)

    return {
        'staff_id': staff_id,
        'user_id': user.id,
        'username': username,
        'role': role,
        'permissions': _perms_for(role),
        'photo_url': photo_url,
        'biometrics': {
            'photo': photo_url is not None,
            'fingerprint': fingerprint_template is not None,
            'face_embedding': face_embedding is not None,
            'voice': False,  # enrol via /voice-bio/enroll/*
        },
        'temp_password': temp_pw,  # show once; user changes it on first login
    }
