"""
License / activation keys.

  POST /license/generate  (super_admin/it_admin) — make a key, store it, email it
  POST /license/validate  (PUBLIC — used by the installer) — check a key
  GET  /license/list      (admin) — list issued keys
  POST /license/{id}/revoke (admin)

Keys look like ALIS-XXXX-XXXX-XXXX-XXXX (unambiguous alphabet). Validation is a DB
lookup on this ALIS-X server (checks exists / not revoked / not expired).
"""
from __future__ import annotations

import secrets
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.license import LicenseKey
from services import email_service

router = APIRouter(prefix='/license', tags=['License'])

_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'   # no 0/O/1/I ambiguity
_ADMIN = {'super_admin', 'it_admin'}


def _new_key() -> str:
    groups = ['' .join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(4)]
    return 'ALIS-' + '-'.join(groups)


class GenerateIn(BaseModel):
    customer: str
    email:    Optional[str] = None
    months:   int = 12
    edition:  str = 'ALIS-X'
    notes:    Optional[str] = None


class ValidateIn(BaseModel):
    key: str


@router.post('/generate')
def generate(body: GenerateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if user.role not in _ADMIN:
        raise HTTPException(403, 'Only an administrator can issue license keys')
    key = _new_key()
    while db.query(LicenseKey).filter(LicenseKey.key == key).first():
        key = _new_key()
    exp = date.today() + timedelta(days=30 * max(1, body.months))
    rec = LicenseKey(key=key, customer=body.customer.strip(), email=(body.email or '').strip() or None,
                     edition=body.edition, expires_at=exp, issued_by_id=user.id, notes=body.notes)
    db.add(rec); db.commit()

    emailed = False
    if rec.email:
        subject = f'Your {body.edition} activation key'
        text = (f'Hello {body.customer},\n\nYour JORINOVA NEXUS {body.edition} activation key is:\n\n'
                f'    {key}\n\nEdition: {body.edition}\nExpires: {exp.isoformat()}\n\n'
                f'Enter this key during installation (Step 3 — License & Security).\n\n— JORINOVA NEXUS')
        html = (f'<div style="font-family:Arial,sans-serif"><h2 style="color:#0066CC">Activation key</h2>'
                f'<p>Hello {body.customer},</p><p>Your JORINOVA NEXUS <b>{body.edition}</b> activation key:</p>'
                f'<p style="font-size:20px;font-weight:700;letter-spacing:1px">{key}</p>'
                f'<p>Edition: {body.edition}<br>Expires: {exp.isoformat()}</p>'
                f'<p>Enter it during installation (Step 3 — License &amp; Security).</p></div>')
        emailed = email_service.send_email(rec.email, subject, text, html).get('status') == 'sent'

    return {'key': key, 'customer': rec.customer, 'edition': rec.edition,
            'expires': exp.isoformat(), 'emailed': emailed, 'email': rec.email}


@router.post('/validate')
def validate(body: ValidateIn, db: Session = Depends(get_db)) -> dict:
    """PUBLIC — the installer calls this before setup. No auth (system has no users yet)."""
    key = (body.key or '').strip().upper()
    if not key:
        return {'valid': False, 'reason': 'Empty key'}
    k = db.query(LicenseKey).filter(LicenseKey.key == key).first()
    if not k:
        return {'valid': False, 'reason': 'Unknown key'}
    if k.revoked:
        return {'valid': False, 'reason': 'Key revoked'}
    if k.expires_at and k.expires_at < date.today():
        return {'valid': False, 'reason': f'Expired {k.expires_at.isoformat()}'}
    return {'valid': True, 'customer': k.customer, 'edition': k.edition,
            'expires': k.expires_at.isoformat() if k.expires_at else None}


@router.get('/list')
def list_keys(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list:
    if user.role not in _ADMIN:
        raise HTTPException(403, 'Admins only')
    rows = db.query(LicenseKey).order_by(desc(LicenseKey.id)).limit(200).all()
    return [{
        'id': k.id, 'key': k.key, 'customer': k.customer, 'email': k.email, 'edition': k.edition,
        'expires': k.expires_at.isoformat() if k.expires_at else None,
        'revoked': k.revoked, 'activated': k.activated,
    } for k in rows]


@router.post('/{kid}/revoke')
def revoke(kid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if user.role not in _ADMIN:
        raise HTTPException(403, 'Admins only')
    k = db.query(LicenseKey).filter(LicenseKey.id == kid).first()
    if not k:
        raise HTTPException(404, 'Not found')
    k.revoked = True
    db.commit()
    return {'status': 'revoked', 'key': k.key}
