"""
QR / phone login — sign in on a desktop by approving from an already-authenticated
phone (possession factor). Optional biometric happens on the phone (the native app
can require Fingerprint/Face before calling /approve; the mobile web approval page
can use WebAuthn — both are add-ons on top of this flow).

Flow:
  1. Desktop  POST /auth/qr/start?app_url=… → {sid, qr (PNG data-URL), approve_url}
              Desktop shows the QR and polls /auth/qr/status.
  2. Phone    scans QR → opens approve_url (/qr-approve?sid=…) while logged in →
              POST /auth/qr/approve?sid=…     (Bearer = the phone user's token)
  3. Desktop  GET /auth/qr/status?sid=…       → {status:'approved', access_token}
              Desktop stores the token and is signed in as that user.

Sessions are persisted to the `qr_sessions` table so they survive worker restarts
and free-tier cold starts (the old in-memory store lost them → 'code expired').
"""
from __future__ import annotations

import base64
import io
import os
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import create_access_token, get_current_user
from models.user import User

router = APIRouter(prefix='/auth/qr', tags=['QR Login'])

_TTL = 300  # seconds (5 min — free-tier cold start can eat ~1 min)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expired(s) -> bool:
    exp = getattr(s, 'expires_at', None)
    if exp is None:
        return True
    if exp.tzinfo is None:            # SQLite returns naive datetimes
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < _now()


def _clean(db: Session) -> None:
    from models.nexus_ops import QrSession
    try:
        db.query(QrSession).filter(QrSession.expires_at < _now()).delete(synchronize_session=False)
    except Exception:
        db.rollback()


def _approve_base(request: Request, app_url: str | None) -> str:
    """Where the phone opens the approval page — the WEB app origin, not the API."""
    if app_url:
        return app_url.rstrip('/')
    env = (os.environ.get('PUBLIC_APP_URL') or '').rstrip('/')
    if env:
        return env
    # Derive from the browser-facing proxy headers when present.
    proto = request.headers.get('x-forwarded-proto', 'https')
    host  = request.headers.get('x-forwarded-host') or request.headers.get('host', '')
    return f'{proto}://{host}' if host else ''


@router.post('/start')
def start(request: Request, app_url: str | None = None, db: Session = Depends(get_db)):
    """Desktop: open a login session and get a QR to display."""
    from models.nexus_ops import QrSession
    _clean(db)
    sid = secrets.token_urlsafe(24)
    db.add(QrSession(sid=sid, approved=False, expires_at=_now() + timedelta(seconds=_TTL)))
    db.commit()

    base = _approve_base(request, app_url)
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
def status(sid: str, db: Session = Depends(get_db)):
    """Desktop: poll for approval. Returns the access token once approved (one-time)."""
    from models.nexus_ops import QrSession
    s = db.query(QrSession).filter(QrSession.sid == sid).first()
    if not s or _expired(s):
        return {'status': 'expired'}
    if s.approved and s.token:
        tok, uname = s.token, s.username
        db.delete(s); db.commit()   # consume — single use
        return {'status': 'approved', 'access_token': tok, 'username': uname}
    return {'status': 'pending'}


@router.post('/approve')
def approve(sid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Phone (authenticated): approve a desktop login session."""
    from models.nexus_ops import QrSession
    s = db.query(QrSession).filter(QrSession.sid == sid).first()
    if not s or _expired(s):
        raise HTTPException(status_code=404, detail='Session expired or invalid — refresh the QR on the desktop')
    s.token = create_access_token({'sub': str(user.id), 'role': user.role})
    s.username = user.username
    s.approved = True
    db.commit()
    return {'status': 'approved', 'message': f'Desktop sign-in approved for {user.username}'}
