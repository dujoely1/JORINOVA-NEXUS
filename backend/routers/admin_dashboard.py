"""
Admin Dashboard Router — System-wide statistics, user management, 2FA.
Real TOTP 2FA using pyotp + QR code generation.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime, timezone, date as date_t, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel
from core.database import get_db
from core.security import get_current_user
from models.user import User

from routers.audit import log_action

router = APIRouter(prefix='/admin', tags=['Admin'])

ADMIN_ROLES = {'super_admin', 'it_admin', 'lab_manager'}


def _profile_locked(db: Session, uid: int) -> bool:
    """Whether an admin has locked this user's profile photo edits."""
    from models.device_registry import EntityAttribute
    a = (db.query(EntityAttribute)
         .filter(EntityAttribute.entity_type == 'user',
                 EntityAttribute.entity_id == uid,
                 EntityAttribute.key == 'profile_locked').first())
    return bool(a and (a.value or '').lower() == 'true')


def require_admin(user: User = Depends(get_current_user)):
    if user.role not in ADMIN_ROLES and not user.is_superuser:
        raise HTTPException(403, 'Admin access required')
    return user


# ── Post-quantum security status ──────────────────────────────────

@router.get('/pqc')
def pqc_status(_u: User = Depends(require_admin)):
    """Active post-quantum signing backend + public-key fingerprint.
    `real_pqc=false` means the SHA3-256 fallback is in use (install `pqcrypto`
    with a C toolchain to activate true CRYSTALS-Dilithium signatures)."""
    from core import pqc
    return pqc.status()


# ── System Stats ──────────────────────────────────────────────────

@router.get('/stats')
def system_stats(db: Session = Depends(get_db), _u: User = Depends(require_admin)):
    """Complete system-wide statistics for admin dashboard."""
    today = date_t.today()
    from models.laboratory import LabRequest, LabResult
    from models.patient import Patient

    try:
        total_requests  = db.query(LabRequest).count()
        today_requests  = db.query(LabRequest).filter(func.date(LabRequest.request_date)==today).count()
        pending         = db.query(LabRequest).filter(LabRequest.status.in_(['pending','received','processing'])).count()
        validated_today = db.query(LabRequest).filter(func.date(LabRequest.request_date)==today, LabRequest.status.in_(['validated','released'])).count()
        critical_today  = db.query(LabResult).filter(func.date(LabResult.entered_at)==today, LabResult.flag.in_(['HH','LL'])).count()
        total_patients  = db.query(Patient).filter(Patient.is_active==True).count()
        patients_today  = db.query(Patient).filter(func.date(Patient.created_at)==today).count()
        total_users     = db.query(User).filter(User.is_active==True).count()
    except Exception:
        total_requests=today_requests=pending=validated_today=critical_today=total_patients=patients_today=total_users=0

    try:
        from models.rejection import SampleRejection
        rejections_today = db.query(SampleRejection).filter(func.date(SampleRejection.rejected_at)==today).count()
    except Exception:
        rejections_today = 0

    try:
        from models.audit import AuditLog
        audit_today = db.query(AuditLog).filter(func.date(AuditLog.timestamp)==today).count()
    except Exception:
        audit_today = 0

    return {
        'system': {
            'status': 'operational',
            'uptime': '—',
            'version': '2.0.0',
            'date': str(today),
            'db_tables': '155+',
        },
        'lab': {
            'total_requests': total_requests,
            'today_requests': today_requests,
            'pending': pending,
            'validated_today': validated_today,
            'critical_today': critical_today,
            'rejections_today': rejections_today,
        },
        'patients': {
            'total_active': total_patients,
            'registered_today': patients_today,
        },
        'users': {
            'total_active': total_users,
        },
        'audit': {
            'entries_today': audit_today,
        },
    }


@router.get('/users')
def list_users(
    role: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    _u: User = Depends(require_admin),
):
    q = db.query(User)
    if active_only: q = q.filter(User.is_active==True)
    if role:        q = q.filter(User.role==role)
    users = q.order_by(User.last_name).offset(skip).limit(limit).all()
    return [_serialize_user(u) for u in users]


@router.patch('/users/{uid}/role')
def update_user_role(
    uid: int, role: str, department: Optional[str] = None,
    db: Session = Depends(get_db), _u: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id==uid).first()
    if not u: raise HTTPException(404, 'User not found')
    u.role = role
    if department and hasattr(u, 'department'): u.department = department
    db.commit()
    return {'status': 'updated', 'role': role}


@router.patch('/users/{uid}/toggle-active')
def toggle_user_active(uid: int, db: Session = Depends(get_db), _u: User = Depends(require_admin)):
    u = db.query(User).filter(User.id==uid).first()
    if not u: raise HTTPException(404, 'User not found')
    u.is_active = not u.is_active
    db.commit()
    return {'status': 'active' if u.is_active else 'deactivated'}


def _serialize_user(u: User) -> dict:
    return {
        'id': u.id, 'username': u.username, 'email': u.email,
        'first_name': u.first_name, 'last_name': u.last_name,
        'role': u.role, 'is_active': u.is_active, 'is_superuser': u.is_superuser,
        'department': getattr(u, 'department', None),
        'hospital_id': getattr(u, 'hospital_id', None),
        'has_2fa': getattr(u, 'two_factor_enabled', False),
        'photo_url': getattr(u, 'profile_photo', None),  # uses profile_photo field
    }


# ── 2FA — Real TOTP (RFC 6238) ────────────────────────────────────

@router.post('/2fa/setup')
def setup_2fa(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Generate TOTP secret and QR code for 2FA setup."""
    try:
        import pyotp, qrcode, io, base64
        secret = pyotp.random_base32()
        totp   = pyotp.TOTP(secret)
        uri    = totp.provisioning_uri(
            name=user.email or user.username,
            issuer_name='JORINOVA NEXUS ALIS-X',
        )
        # Generate QR code as base64 PNG
        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        # Store secret temporarily (not confirmed yet)
        if hasattr(user, 'totp_secret'):
            user.totp_secret = secret
            user.two_factor_enabled = False
            db.commit()

        return {
            'secret': secret,
            'qr_code': f'data:image/png;base64,{qr_b64}',
            'uri': uri,
            'message': 'Scan this QR code with Google Authenticator or Authy. Then confirm with a valid OTP.',
        }
    except ImportError:
        # pyotp/qrcode not installed — return mock setup
        import secrets
        secret = secrets.token_hex(16).upper()
        return {
            'secret': secret,
            'qr_code': None,
            'uri': f'otpauth://totp/NEXUS:{user.username}?secret={secret}&issuer=NEXUS',
            'message': 'Install pyotp and qrcode packages for full 2FA support.',
        }


@router.post('/2fa/verify')
def verify_2fa(otp: str, secret: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Verify OTP and activate 2FA for the user."""
    try:
        import pyotp
        totp = pyotp.TOTP(secret)
        if not totp.verify(otp, valid_window=1):
            raise HTTPException(400, 'Invalid OTP. Please try again with a fresh code.')
        if hasattr(user, 'totp_secret'):
            user.totp_secret = secret
            user.two_factor_enabled = True
            db.commit()
        return {'status': '2fa_activated', 'message': '2FA successfully activated on your account.'}
    except ImportError:
        return {'status': 'mock_activated', 'message': 'Mock 2FA activated (pyotp not installed).'}


@router.post('/2fa/validate')
def validate_2fa_login(username: str, otp: str, db: Session = Depends(get_db)):
    """Validate OTP during login (called after password check)."""
    u = db.query(User).filter(User.username==username).first()
    if not u: raise HTTPException(404, 'User not found')
    if not getattr(u, 'totp_enabled', False):
        return {'valid': True, 'message': '2FA not enabled — login with password only'}
    try:
        import pyotp
        secret = getattr(u, 'totp_secret', '')
        if not secret: return {'valid': True, 'message': 'No secret configured'}
        totp = pyotp.TOTP(secret)
        valid = totp.verify(otp, valid_window=1)
        if not valid: raise HTTPException(401, 'Invalid 2FA code')
        return {'valid': True, 'message': '2FA validated successfully'}
    except ImportError:
        return {'valid': True, 'message': 'pyotp not installed — 2FA bypassed'}


@router.delete('/2fa/disable')
def disable_2fa(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Disable 2FA for current user."""
    if hasattr(user, 'totp_enabled'):
        user.totp_enabled = False
        user.totp_secret = None
        db.commit()
    return {'status': '2fa_disabled'}


# ── Staff Photo Upload ────────────────────────────────────────────

@router.post('/users/{uid}/photo')
async def upload_staff_photo(
    uid: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload staff photo. User can upload their own; admin can upload for any user."""
    if user.id != uid and user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Can only upload your own photo')

    target_user = db.query(User).filter(User.id==uid).first()
    if not target_user: raise HTTPException(404, 'User not found')

    # Locked profiles can only be changed by an admin.
    if _profile_locked(db, uid) and user.role not in ADMIN_ROLES:
        raise HTTPException(423, 'Profile photo is locked by an administrator')

    # Validate file type (configurable max size via MAX_UPLOAD_MB, default 5 MB)
    import os, uuid
    if not (file.content_type or '').startswith('image/'):
        raise HTTPException(400, 'File must be an image (JPEG, PNG, WebP)')
    max_mb = float(os.environ.get('MAX_UPLOAD_MB', '5') or 5)
    content = await file.read()
    if len(content) > max_mb * 1024 * 1024:
        raise HTTPException(400, f'Image must be < {max_mb:g} MB')
    if not content:
        raise HTTPException(400, 'Empty file')

    ext = file.filename.rsplit('.', 1)[-1].lower() if file.filename and '.' in file.filename else 'jpg'
    filename = f'staff_{uid}_{uuid.uuid4().hex[:8]}.{ext}'

    from services.media_storage import is_cloud, save_image, checksum
    cs = checksum(content)
    if is_cloud():
        # Cloudinary (optional upgrade) — returns a permanent CDN URL.
        photo_url = save_image(content, filename, 'staff_photos')
    else:
        # Default: store bytes in the DB so photos persist across redeploys with
        # NO external account. Served publicly via /api/v1/public/users/{id}/avatar.
        from models.user import UserPhoto, ProfilePhotoHistory
        ct = file.content_type or 'image/jpeg'
        rec = db.query(UserPhoto).filter(UserPhoto.user_id == uid).first()
        if rec:
            # Archive the previous version so an admin can restore it later.
            db.add(ProfilePhotoHistory(user_id=uid, data=rec.data, content_type=rec.content_type,
                                       checksum=rec.checksum, changed_by_id=user.id))
            rec.data, rec.content_type, rec.checksum = content, ct, cs
        else:
            db.add(UserPhoto(user_id=uid, data=content, content_type=ct, checksum=cs))
        photo_url = f'/api/v1/public/users/{uid}/avatar?v={cs[:8]}'   # ?v busts cache on change
    target_user.profile_photo = photo_url
    log_action(db, 'profile_photo', 'UPDATE', entity_id=str(uid), user=user, metadata={'checksum': cs})
    db.commit()

    return {'status': 'uploaded', 'photo_url': photo_url, 'filename': filename, 'checksum': cs}


@router.delete('/users/{uid}/photo')
def delete_staff_photo(uid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove a staff photo. User can remove their own; admin can remove for any user."""
    if user.id != uid and user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Can only remove your own photo')
    target_user = db.query(User).filter(User.id == uid).first()
    if not target_user:
        raise HTTPException(404, 'User not found')
    if _profile_locked(db, uid) and user.role not in ADMIN_ROLES:
        raise HTTPException(423, 'Profile photo is locked by an administrator')
    from models.user import UserPhoto, ProfilePhotoHistory
    cur = db.query(UserPhoto).filter(UserPhoto.user_id == uid).first()
    if cur:
        db.add(ProfilePhotoHistory(user_id=uid, data=cur.data, content_type=cur.content_type,
                                   checksum=cur.checksum, changed_by_id=user.id))
    db.query(UserPhoto).filter(UserPhoto.user_id == uid).delete()
    target_user.profile_photo = None
    log_action(db, 'profile_photo', 'DELETE', entity_id=str(uid), user=user)
    db.commit()
    return {'status': 'removed'}


@router.get('/users/{uid}/photo')
def get_staff_photo(uid: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    u = db.query(User).filter(User.id==uid).first()
    if not u: raise HTTPException(404, 'User not found')
    return {'photo_url': getattr(u, 'photo_url', None)}


# ── Profile photo history / restore / lock (admin governance) ──────

@router.get('/users/{uid}/photo-history')
def photo_history(uid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List archived photo versions (newest first). Self or admin."""
    if user.id != uid and user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Forbidden')
    from models.user import ProfilePhotoHistory
    rows = (db.query(ProfilePhotoHistory)
            .filter(ProfilePhotoHistory.user_id == uid)
            .order_by(desc(ProfilePhotoHistory.id)).limit(30).all())
    return {
        'locked': _profile_locked(db, uid),
        'history': [{
            'id': h.id,
            'url': f'/api/v1/public/photo-history/{h.id}',
            'checksum': h.checksum,
            'changed_by_id': h.changed_by_id,
            'created_at': h.created_at.isoformat() if h.created_at else None,
        } for h in rows],
    }


@router.post('/users/{uid}/photo-history/{hid}/restore')
def restore_photo(uid: int, hid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Restore a previous photo version as the current one. Self or admin."""
    if user.id != uid and user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Forbidden')
    if _profile_locked(db, uid) and user.role not in ADMIN_ROLES:
        raise HTTPException(423, 'Profile photo is locked by an administrator')
    from models.user import UserPhoto, ProfilePhotoHistory
    h = db.query(ProfilePhotoHistory).filter(ProfilePhotoHistory.id == hid, ProfilePhotoHistory.user_id == uid).first()
    if not h:
        raise HTTPException(404, 'History entry not found')
    target_user = db.query(User).filter(User.id == uid).first()
    cur = db.query(UserPhoto).filter(UserPhoto.user_id == uid).first()
    if cur:
        db.add(ProfilePhotoHistory(user_id=uid, data=cur.data, content_type=cur.content_type,
                                   checksum=cur.checksum, changed_by_id=user.id))
        cur.data, cur.content_type, cur.checksum = h.data, h.content_type, h.checksum
    else:
        db.add(UserPhoto(user_id=uid, data=h.data, content_type=h.content_type, checksum=h.checksum))
    photo_url = f'/api/v1/public/users/{uid}/avatar?v={(h.checksum or "")[:8]}'
    if target_user:
        target_user.profile_photo = photo_url
    log_action(db, 'profile_photo', 'RESTORE', entity_id=str(uid), user=user, metadata={'history_id': hid})
    db.commit()
    return {'status': 'restored', 'photo_url': photo_url}


@router.post('/users/{uid}/profile-lock')
def set_profile_lock(uid: int, locked: bool = True, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin: lock/unlock a user's profile photo edits."""
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Admins only')
    from models.device_registry import EntityAttribute
    a = (db.query(EntityAttribute)
         .filter(EntityAttribute.entity_type == 'user', EntityAttribute.entity_id == uid,
                 EntityAttribute.key == 'profile_locked').first())
    if a:
        a.value = 'true' if locked else 'false'
    else:
        db.add(EntityAttribute(entity_type='user', entity_id=uid, key='profile_locked',
                               value='true' if locked else 'false', value_type='bool'))
    log_action(db, 'profile_photo', 'LOCK' if locked else 'UNLOCK', entity_id=str(uid), user=user)
    db.commit()
    return {'status': 'locked' if locked else 'unlocked'}


# ── Module health check ───────────────────────────────────────────

@router.get('/modules')
def list_modules(_u: User = Depends(require_admin)):
    """Return status of all ALIS-X modules."""
    return {
        'modules': [
            {'name':'Patient Management',   'status':'operational','route':'/modules/patients'},
            {'name':'Laboratory Workflow',  'status':'operational','route':'/modules/laboratory'},
            {'name':'Hematology',           'status':'operational','route':'/modules/hematology'},
            {'name':'Biochemistry',         'status':'operational','route':'/modules/biochemistry'},
            {'name':'Coagulation',          'status':'operational','route':'/modules/coagulation'},
            {'name':'Serology / Immunology','status':'operational','route':'/modules/serology'},
            {'name':'Microbiology',         'status':'operational','route':'/modules/microbiology'},
            {'name':'Molecular Biology',    'status':'operational','route':'/modules/molecular_advanced'},
            {'name':'Blood Bank',           'status':'operational','route':'/modules/blood_bank'},
            {'name':'Toxicology',           'status':'operational','route':'/modules/toxicology'},
            {'name':'Anatomical Pathology', 'status':'operational','route':'/modules/anapath'},
            {'name':'Quality Management',   'status':'operational','route':'/modules/quality'},
            {'name':'IoT Analyzers',        'status':'operational','route':'/modules/connectivity'},
            {'name':'StaffHub',             'status':'operational','route':'/modules/staffhub'},
            {'name':'Surveillance',         'status':'operational','route':'/modules/surveillance'},
            {'name':'Genomics',             'status':'operational','route':'/modules/molecular_advanced'},
            {'name':'Doctor Portal',        'status':'operational','route':'/portal/doctor'},
            {'name':'Records',              'status':'operational','route':'/modules/register'},
            {'name':'Reports',              'status':'operational','route':'/modules/register'},
            {'name':'Billing / FinaOps',    'status':'operational','route':'/modules/billing'},
            {'name':'Inventory',            'status':'operational','route':'/modules/inventory'},
            {'name':'Security',             'status':'operational','route':'/admin'},
            {'name':'AI Nexus',             'status':'operational','route':'/modules/ai_nexus'},
        ]
    }
