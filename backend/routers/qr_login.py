"""
QR / phone login — sign in on a desktop by approving from an already-authenticated
phone (possession factor). Optional biometric happens on the phone (the native app
can require Fingerprint/Face before calling /approve; the mobile web approval page
can use WebAuthn — both are add-ons on top of this flow).

Flow:
  1. Desktop  POST /auth/qr/start            → {sid, qr (PNG data-URL), approve_url}
              Desktop shows the QR and polls /auth/qr/status.
  2. Phone    scans QR → opens approve_url (/qr-approve?sid=…) while logged in →
              POST /auth/qr/approve?sid=…     (Bearer = the phone user's token)
  3. Desktop  GET /auth/qr/status?sid=…       → {status:'approved', access_token}
              Desktop stores the token and is signed in as that user.

Sessions live in-memory (single worker on Render) and expire after 2 minutes.
"""
from __future__ import annotations

import base64
import io
import os
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import create_access_token, get_current_user
from models.user import User

router = APIRouter(prefix='/auth/qr', tags=['QR Login'])

_TTL = 120  # seconds
_sessions: dict[str, dict] = {}


def _clean() -> None:
    now = time.time()
    for k in [k for k, v in _sessions.items() if v['expires'] < now]:
        _sessions.pop(k, None)


@router.post('/start')
def start():
    """Desktop: open a login session and get a QR to display."""
    _clean()
    sid = secrets.token_urlsafe(24)
    _sessions[sid] = {'approved': False, 'token': None, 'username': None, 'expires': time.time() + _TTL}

    base = (os.environ.get('PUBLIC_APP_URL') or '').rstrip('/')
    approve_url = f'{base}/qr-approve?sid={sid}' if base else f'/qr-approve?sid={sid}'

    qr_data_url = None
    try:
        import qrcode
        buf = io.BytesIO()
        qrcode.make(approve_url).save(buf, format='PNG')
        qr_data_url = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        pass  # frontend falls back to showing the approve_url as text/link

    return {'sid': sid, 'qr': qr_data_url, 'approve_url': approve_url, 'expires_in': _TTL}


@router.get('/status')
def status(sid: str):
    """Desktop: poll for approval. Returns the access token once approved (one-time)."""
    _clean()
    s = _sessions.get(sid)
    if not s:
        return {'status': 'expired'}
    if s['approved'] and s['token']:
        tok, uname = s['token'], s.get('username')
        _sessions.pop(sid, None)   # consume — single use
        return {'status': 'approved', 'access_token': tok, 'username': uname}
    return {'status': 'pending'}


@router.post('/approve')
def approve(sid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Phone (authenticated): approve a desktop login session."""
    _clean()
    s = _sessions.get(sid)
    if not s:
        raise HTTPException(status_code=404, detail='Session expired or invalid — refresh the QR on the desktop')
    s['token'] = create_access_token({'sub': str(user.id), 'role': user.role})
    s['username'] = user.username
    s['approved'] = True
    return {'status': 'approved', 'message': f'Desktop sign-in approved for {user.username}'}
