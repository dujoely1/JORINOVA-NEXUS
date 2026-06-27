"""
First-run setup wizard endpoints.

Lets a brand-new deployment be brought up without manually editing seed
scripts: the front-end /install page (the 6-step ALIS-X installer) calls these
to discover whether setup is needed, then to create — in one transaction —

  * the hospital / facility identity (name, lab code, address, type, logo)
  * the first administrator account (super-admin)
  * the default system language
  * every additional staff member with an auto-generated login + temp password
  * the hardware inventory (this computer, analysers, cold-chain / IoT devices)
  * the license key + security-feature toggles (stored as dynamic attributes)

Endpoints (all unauthenticated by design — the system has no users yet
when these are called):

  GET  /api/v1/setup/status   - {needs_setup: bool, has_hospital, has_admin}
  POST /api/v1/setup/init     - create everything above.
                                Returns 409 if setup was already done, so it
                                cannot be used to overwrite an existing
                                install.
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import hash_password
from models.user import User
from models.core_config import Hospital
from models.device_registry import HospitalDevice, EntityAttribute
from services import sms_service, email_service

router = APIRouter(prefix='/setup', tags=['Setup'])
log = logging.getLogger('alis_x.setup')


# Map the human-readable roles shown in the installer dropdown to the internal
# role keys the rest of the system understands (see User model docstring).
ROLE_MAP: dict[str, str] = {
    'lab_manager':           'lab_manager',
    'senior_technologist':   'lab_technician',
    'technologist':          'lab_technician',
    'lab_technician':        'lab_technician',
    'lab_receptionist':      'receptionist',
    'receptionist':          'receptionist',
    'doctor':                'doctor',
    'doctor_client':         'doctor',
    'department_head':       'lab_manager',
    'head_of_department':    'lab_manager',
    'department_supervisor': 'lab_manager',
    'quality_manager':       'lab_manager',
    'administrator':         'it_admin',
    'finance_officer':       'finance',
    'finance':               'finance',
    'rbc_viewer':            'viewer',
    'viewer':                'viewer',
}


def _norm_role(raw: str | None) -> str:
    key = re.sub(r'[^a-z]+', '_', (raw or '').strip().lower()).strip('_')
    return ROLE_MAP.get(key, 'lab_technician')


def _slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (text or '').strip().lower())


# ── Schemas ───────────────────────────────────────────────────────────────────

class SetupStatus(BaseModel):
    needs_setup:  bool
    has_hospital: bool
    has_admin:    bool


class SecurityFeatures(BaseModel):
    post_quantum:   bool = True   # Kyber768 + Dilithium3
    biometric:      bool = True
    ai_cyberattack: bool = True
    audit_logs:     bool = True
    auto_backup:    bool = True


class StaffMember(BaseModel):
    full_name:  str            = Field(..., min_length=2, max_length=160)
    phone:      str | None     = Field(None, max_length=30)
    role:       str            = 'lab_technician'
    department: str | None     = Field(None, max_length=60)


class AnalyserSpec(BaseModel):
    name:       str            = Field(..., min_length=1, max_length=120)
    model:      str | None     = Field(None, max_length=120)
    department: str | None     = Field(None, max_length=60)
    connection: str | None     = Field(None, max_length=40)   # manual | barcode | hl7_fhir


class ColdChainDevice(BaseModel):
    name:        str           = Field(..., min_length=1, max_length=120)
    device_type: str           = 'refrigerator'              # refrigerator | freezer | incubator
    location:    str | None    = Field(None, max_length=120)
    min_temp:    float | None  = None
    max_temp:    float | None  = None
    iot_sensor:  bool          = False


class ComputerSpec(BaseModel):
    name:              str | None = Field(None, max_length=120)
    os:                str | None = Field(None, max_length=40)
    ram:               str | None = Field(None, max_length=20)
    role:              str | None = Field(None, max_length=20)   # server | workstation | both
    printer_connected: bool       = False
    printer_brand:     str | None = Field(None, max_length=60)
    printer_model:     str | None = Field(None, max_length=60)
    printer_type:      str | None = Field(None, max_length=20)   # label | a4 | both


class SetupInit(BaseModel):
    # Language chosen by the installing admin — used as the default for
    # every new user created in the system.
    language:          Literal['en', 'fr', 'rw'] = 'en'

    # ── Facility identity ─────────────────────────────────────────────
    hospital_name:     str            = Field(..., min_length=2, max_length=200)
    hospital_lab_code: str | None     = Field(None, max_length=40)
    hospital_country:  str | None     = Field(None, max_length=80)
    hospital_city:     str | None     = Field(None, max_length=100)
    hospital_district: str | None     = Field(None, max_length=80)
    hospital_province: str | None     = Field(None, max_length=80)
    hospital_address:  str | None     = Field(None, max_length=400)
    hospital_phone:    str | None     = Field(None, max_length=30)
    hospital_email:    EmailStr | None = None
    hospital_type:     str            = Field('public', max_length=20)
    hospital_logo:     str | None     = None                    # data-URL or path

    # ── License & security ────────────────────────────────────────────
    license_key:       str | None     = Field(None, max_length=120)
    security:          SecurityFeatures = SecurityFeatures()

    # ── Admin account ─────────────────────────────────────────────────
    admin_username:    str            = Field(..., min_length=3, max_length=30)
    admin_first_name:  str            = Field(..., min_length=1, max_length=80)
    admin_last_name:   str            = Field(..., min_length=1, max_length=80)
    admin_email:       EmailStr
    admin_phone:       str | None     = Field(None, max_length=30)
    admin_password:    str            = Field(..., min_length=8, max_length=200)

    # ── Staff + hardware ──────────────────────────────────────────────
    staff:      list[StaffMember]    = []
    computer:   ComputerSpec | None  = None
    analysers:  list[AnalyserSpec]   = []
    cold_chain: list[ColdChainDevice] = []


class StaffCredential(BaseModel):
    full_name:     str
    username:      str
    role:          str
    phone:         str | None
    temp_password: str


class SetupResult(BaseModel):
    message:            str
    hospital_id:        int
    lab_code:           str | None
    admin_user_id:      int
    language:           str
    staff_created:      int
    analysers_created:  int
    devices_created:    int
    sms_queued:         int
    staff_credentials:  list[StaffCredential]


def _login_url() -> str:
    base = (os.environ.get('PUBLIC_APP_URL') or '').strip().rstrip('/')
    return f'{base}/login' if base else 'your ALIS-X portal'


async def _dispatch_setup_notifications(
    recipients: list[dict], admin: dict,
    hospital_name: str, lab_code: str | None, language: str,
    staff_n: int, analysers_n: int, devices_n: int,
    security_on: bool, all_credentials: list[dict],
) -> None:
    """Background task run after setup commits:
      1. SMS each staff member their first-login credentials,
      2. SMS the administrator a short install summary,
      3. Email the administrator a full summary (incl. credentials) via SMTP.

    Opens its own DB session (the request session is already closed by now).
    Best-effort — every step is independently guarded and failures are logged,
    never raised: SMS messages stay queued in sms_queue if no provider is set,
    and the email is silently skipped if SMTP is not configured."""
    import asyncio
    from core.database import SessionLocal
    db = SessionLocal()
    login_url = _login_url()
    try:
        for r in recipients:
            try:
                await sms_service.send_staff_credentials(
                    phone=r['phone'], full_name=r['full_name'], username=r['username'],
                    temp_password=r['temp_password'], hospital_name=hospital_name,
                    login_url=login_url, language=language, db=db,
                )
            except Exception as exc:                              # pragma: no cover
                log.error('Staff credential SMS failed for %s: %s', r.get('username'), exc)

        if admin.get('phone'):
            try:
                await sms_service.send_install_summary(
                    phone=admin['phone'], hospital_name=hospital_name, lab_code=lab_code or '',
                    staff=staff_n, analysers=analysers_n, devices=devices_n,
                    language=language, db=db,
                )
            except Exception as exc:                              # pragma: no cover
                log.error('Install-summary SMS failed: %s', exc)

        if admin.get('email'):
            try:
                result = await asyncio.to_thread(
                    email_service.send_install_summary_email,
                    admin['email'], hospital_name, lab_code or '', admin.get('name', ''),
                    staff_n, analysers_n, devices_n, security_on, login_url, all_credentials,
                )
                log.info('Install-summary email: %s', result.get('status'))
            except Exception as exc:                              # pragma: no cover
                log.error('Install-summary email failed: %s', exc)

        db.commit()
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get('/status', response_model=SetupStatus)
def status_(db: Session = Depends(get_db)):
    has_hospital = db.query(Hospital).count() > 0
    has_admin    = db.query(User).filter(User.is_superuser.is_(True)).count() > 0
    return SetupStatus(
        needs_setup  = not (has_hospital and has_admin),
        has_hospital = has_hospital,
        has_admin    = has_admin,
    )


@router.post('/init', response_model=SetupResult, status_code=status.HTTP_201_CREATED)
def init(body: SetupInit, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Idempotency: refuses to run if a hospital or admin already exists.
    This way the public endpoint can't be used to silently take over an
    existing install."""
    if db.query(Hospital).count() > 0 or db.query(User).filter(User.is_superuser.is_(True)).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='System is already initialised. Setup can only run once.',
        )

    lab_code = (body.hospital_lab_code or '').strip().upper() or None

    # ── 1. Hospital / facility ────────────────────────────────────────
    hospital = Hospital(
        name      = body.hospital_name.strip(),
        lab_code  = lab_code,
        rbc_code  = lab_code,
        address   = (body.hospital_address or '').strip() or None,
        country   = (body.hospital_country or '').strip() or None,
        city      = (body.hospital_city or '').strip() or None,
        district  = (body.hospital_district or '').strip() or None,
        province  = (body.hospital_province or '').strip() or None,
        phone     = (body.hospital_phone or '').strip() or None,
        email     = (body.hospital_email or None),
        logo_url  = (body.hospital_logo or '').strip() or None,
        hospital_type = (body.hospital_type or 'public').strip().lower() or 'public',
        is_active = True,
    )
    db.add(hospital)
    db.flush()                                                  # so we have hospital.id

    # ── 2. Admin account (super-admin) ────────────────────────────────
    admin = User(
        username           = body.admin_username.strip().lower(),
        email              = body.admin_email,
        first_name         = body.admin_first_name.strip(),
        last_name          = body.admin_last_name.strip(),
        phone              = (body.admin_phone or '').strip() or None,
        hashed_password    = hash_password(body.admin_password),
        role               = 'super_admin',
        is_active          = True,
        is_superuser       = True,
        preferred_language = body.language,
        hospital_id        = hospital.id,
    )
    db.add(admin)
    db.flush()

    # ── 3. Additional staff (auto username + temp password) ───────────
    taken_usernames = {admin.username}
    credentials: list[StaffCredential] = []
    emp_seq = 1
    for member in body.staff:
        full = member.full_name.strip()
        if not full:
            continue
        parts = full.split()
        first = parts[0]
        last  = ' '.join(parts[1:]) if len(parts) > 1 else ''

        base = _slug(first) + (_slug(last)[:1] if last else '') or 'user'
        username = base
        n = 1
        while username in taken_usernames:
            n += 1
            username = f'{base}{n}'
        taken_usernames.add(username)

        temp_pw = secrets.token_urlsafe(8)
        role    = _norm_role(member.role)
        db.add(User(
            username           = username,
            email              = f'{username}@{(lab_code or "alisx").lower()}.local',
            first_name         = first,
            last_name          = last,
            phone              = (member.phone or '').strip() or None,
            employee_id        = f'EMP{emp_seq:03d}',
            department         = (member.department or '').strip() or None,
            hashed_password    = hash_password(temp_pw),
            role               = role,
            is_active          = True,
            is_superuser       = False,
            preferred_language = body.language,
            hospital_id        = hospital.id,
        ))
        emp_seq += 1
        credentials.append(StaffCredential(
            full_name=full, username=username, role=role,
            phone=(member.phone or '').strip() or None, temp_password=temp_pw,
        ))

    # ── 4. Hardware: this computer ────────────────────────────────────
    prefix = lab_code or 'ALISX'
    devices_created = 0
    if body.computer and (body.computer.name or body.computer.os):
        db.add(HospitalDevice(
            device_id    = f'{prefix}-PC-1',
            device_type  = 'computer',
            device_name  = (body.computer.name or 'This Computer').strip(),
            location     = 'Server room',
            status       = 'active',
            device_metadata = json.dumps({
                'os': body.computer.os, 'ram': body.computer.ram, 'role': body.computer.role,
                'printer_connected': body.computer.printer_connected,
                'printer_brand': body.computer.printer_brand,
                'printer_model': body.computer.printer_model,
                'printer_type': body.computer.printer_type,
            }),
        ))
        devices_created += 1

    # ── 5. Hardware: analysers ────────────────────────────────────────
    analysers_created = 0
    for i, a in enumerate(body.analysers, start=1):
        if not a.name.strip():
            continue
        db.add(HospitalDevice(
            device_id    = f'{prefix}-AN-{i}',
            device_type  = 'analyzer',
            device_name  = a.name.strip(),
            location     = (a.department or '').strip() or None,
            status       = 'active',
            device_metadata = json.dumps({
                'model': a.model, 'department': a.department, 'connection': a.connection,
            }),
        ))
        analysers_created += 1

    # ── 6. Hardware: cold-chain / IoT devices ─────────────────────────
    for i, d in enumerate(body.cold_chain, start=1):
        if not d.name.strip():
            continue
        db.add(HospitalDevice(
            device_id    = f'{prefix}-CC-{i}',
            device_type  = 'iot',
            device_name  = d.name.strip(),
            location     = (d.location or '').strip() or None,
            status       = 'active',
            device_metadata = json.dumps({
                'cold_chain_type': d.device_type, 'min_temp': d.min_temp,
                'max_temp': d.max_temp, 'iot_sensor': d.iot_sensor,
            }),
        ))
        devices_created += 1

    # ── 7. License + security features (dynamic attributes) ───────────
    attrs = {
        'license_key':           body.license_key or '',
        'security.post_quantum': str(body.security.post_quantum),
        'security.biometric':    str(body.security.biometric),
        'security.ai_cyberattack': str(body.security.ai_cyberattack),
        'security.audit_logs':   str(body.security.audit_logs),
        'security.auto_backup':  str(body.security.auto_backup),
    }
    for key, value in attrs.items():
        db.add(EntityAttribute(
            entity_type='hospital', entity_id=hospital.id,
            key=key, value=value,
            value_type='bool' if key.startswith('security.') else 'string',
        ))

    db.commit()

    # ── 8. Dispatch notifications in the background (response returns now) ──
    hospital_name = hospital.name
    admin_phone   = (body.admin_phone or '').strip() or None
    admin_name    = f'{body.admin_first_name} {body.admin_last_name}'.strip()
    recipients = [
        {'phone': c.phone, 'full_name': c.full_name, 'username': c.username, 'temp_password': c.temp_password}
        for c in credentials if c.phone
    ]
    all_credentials = [
        {'full_name': c.full_name, 'username': c.username, 'role': c.role, 'temp_password': c.temp_password}
        for c in credentials
    ]
    sms_queued = len(recipients) + (1 if admin_phone else 0)
    background.add_task(
        _dispatch_setup_notifications,
        recipients,
        {'phone': admin_phone, 'email': str(body.admin_email), 'name': admin_name},
        hospital_name, lab_code, body.language,
        len(credentials), analysers_created, devices_created,
        bool(body.security.post_quantum), all_credentials,
    )

    log.info(
        'Initial setup completed: hospital=%s lab_code=%s admin=%s lang=%s '
        'staff=%d analysers=%d devices=%d sms_queued=%d',
        hospital.name, lab_code, admin.username, body.language,
        len(credentials), analysers_created, devices_created, sms_queued,
    )
    return SetupResult(
        message            = 'Setup complete. You can now sign in.',
        hospital_id        = hospital.id,
        lab_code           = lab_code,
        admin_user_id      = admin.id,
        language           = body.language,
        staff_created      = len(credentials),
        analysers_created  = analysers_created,
        devices_created    = devices_created,
        sms_queued         = sms_queued,
        staff_credentials  = credentials,
    )
