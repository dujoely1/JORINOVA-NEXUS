"""Authentication router — login, token, profile, password reset, forgot password OTP."""
import os
import random
import secrets
import string
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from core.database import get_db
from core.security import (hash_password, verify_password,
                            create_access_token, get_current_user)
from core.config import get_settings
from core.limiter import limit
from core import pqc
from models.user import User, LoginLog
from models.two_factor_backup import TwoFactorBackupCode

try:
    import pyotp
except Exception:                       # pragma: no cover
    pyotp = None                        # type: ignore[assignment]

# Issuer label shown in Google Authenticator / Authy.
_TOTP_ISSUER = 'JORINOVA NEXUS'
_BACKUP_CODE_COUNT = 10

# Roles that MUST use 2FA. A user with one of these roles and no 2FA yet is
# allowed to log in (they need a token to enrol) but the frontend forces them
# to /security/two-factor before anything else (see `must_setup_2fa` in /me).
_MANDATORY_2FA_ROLES = {'super_admin'}


def _norm_code(code: str) -> str:
    """Normalise a typed backup code: drop spaces/dashes, lowercase."""
    return (code or '').strip().lower().replace('-', '').replace(' ', '')


def _generate_backup_codes(db: Session, user: User, n: int = _BACKUP_CODE_COUNT) -> list[str]:
    """Replace any existing backup codes with n fresh single-use codes.
    Returns the PLAINTEXT codes — shown to the user exactly once."""
    db.query(TwoFactorBackupCode).filter(TwoFactorBackupCode.user_id == user.id).delete()
    codes: list[str] = []
    for _ in range(n):
        raw = secrets.token_hex(4)                  # 8 hex chars
        codes.append(f'{raw[:4]}-{raw[4:]}')        # display form: abcd-ef12
        db.add(TwoFactorBackupCode(user_id=user.id, code_hash=hash_password(raw)))
    db.commit()
    return codes


def _consume_backup_code(db: Session, user: User, code: str) -> bool:
    """If `code` matches an unused backup code, mark it used and return True."""
    norm = _norm_code(code)
    if len(norm) != 8:
        return False
    rows = db.query(TwoFactorBackupCode).filter(
        TwoFactorBackupCode.user_id == user.id,
        TwoFactorBackupCode.used == False,            # noqa: E712
    ).all()
    for row in rows:
        if verify_password(norm, row.code_hash):
            row.used = True
            row.used_at = datetime.now(timezone.utc)
            db.commit()
            return True
    return False


def _must_setup_2fa(user: User) -> bool:
    # FORCE_2FA=false disables the mandatory 2FA-enrolment gate → pure
    # email/username + password login (no code). Default keeps it on.
    import os
    if os.environ.get('FORCE_2FA', 'true').strip().lower() in ('false', '0', 'no', 'off'):
        return False
    return (user.role in _MANDATORY_2FA_ROLES
            and not getattr(user, 'two_factor_enabled', False))

# In-memory OTP store: {email: (otp, expires_at)}
_otp_store: dict = {}

# In-memory reset-token store: {token: (email, expires_at)}
# Issued by /verify-otp once a code is confirmed; consumed by /reset-password.
# Short-lived (10 min) so a leaked token has tight blast radius.
_reset_token_store: dict = {}
_RESET_TOKEN_TTL_MIN = 10

# In-memory "Yes, it's me" magic-link store: {confirm_token: (email, expires_at)}
_confirm_store: dict = {}


def _app_base_url() -> str:
    """Public base URL of the frontend, used to build the email magic link.
    Set APP_BASE_URL in .env to your pilot URL (e.g. the Cloudflare tunnel)."""
    return (os.environ.get('APP_BASE_URL') or '').rstrip('/')

router = APIRouter(prefix='/auth', tags=['Authentication'])


def _device_name_from_ua(ua: str) -> str:
    """Best-effort friendly device name from a User-Agent string."""
    ua = ua or ''
    low = ua.lower()
    if 'android' in low:              os_ = 'Android'
    elif 'iphone' in low:             os_ = 'iPhone'
    elif 'ipad' in low:               os_ = 'iPad'
    elif 'windows' in low:            os_ = 'Windows'
    elif 'mac os' in low or 'macintosh' in low: os_ = 'Mac'
    elif 'linux' in low:              os_ = 'Linux'
    else:                             os_ = 'Device'
    if 'edg/' in low:                 br = 'Edge'
    elif 'chrome/' in low:            br = 'Chrome'
    elif 'firefox/' in low:           br = 'Firefox'
    elif 'safari/' in low:            br = 'Safari'
    else:                             br = ''
    return f'{os_} · {br}'.rstrip(' ·') if br else os_


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = 'bearer'
    user_id:      int
    username:     str
    role:         str
    full_name:    str


class UserOut(BaseModel):
    id:               int
    username:         str
    email:            str
    first_name:       str
    last_name:        str
    role:             str
    department:       str | None = None
    is_active:        bool
    photo_url:        str | None = None   # profile photo for header sphere
    has_2fa:          bool       = False
    preferred_language: str      = 'en'
    model_config = {'from_attributes': True}


class UserOutFull(UserOut):
    """Extended user info returned from /me after login."""
    full_name:     str = ''
    is_superuser:  bool = False
    hospital_id:   int | None = None
    employee_id:   str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password:     str


class CreateUserIn(BaseModel):
    username:   str
    email:      str
    password:   str
    first_name: str = ''
    last_name:  str = ''
    role:       str = 'lab_technician'
    department: str | None = None


@router.post('/token', response_model=TokenOut)
@limit('5/minute')
async def login(
    request: Request,
    form:    OAuth2PasswordRequestForm = Depends(),
    otp:     Optional[str] = Form(default=None),
    db:      Session = Depends(get_db),
):
    user = db.query(User).filter(
        (User.username == form.username) | (User.email == form.username)
    ).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Account inactive')

    # Second factor — required when the user has 2FA enabled.
    if getattr(user, 'two_factor_enabled', False) and user.totp_secret:
        if not otp:
            # 401 + a precise detail so the frontend can prompt for the 6-digit code.
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='2FA code required')
        totp_ok = pyotp is not None and pyotp.TOTP(user.totp_secret).verify(str(otp).strip(), valid_window=1)
        # Fall back to a single-use backup/recovery code (for a lost device).
        backup_ok = (not totp_ok) and _consume_backup_code(db, user, str(otp))
        if not (totp_ok or backup_ok):
            db.add(LoginLog(
                user_id=user.id, success=False, method='2fa',
                ip_address=request.client.host if request else None,
            ))
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid 2FA code')

    # Revocable trusted-device registry: bind this session to the client's device
    # id (sent as the X-Device-Id header) and (re)trust it on a successful full
    # login. get_current_user rejects tokens whose device has been revoked.
    token_data: dict = {'sub': str(user.id), 'role': user.role}
    device_id = (request.headers.get('X-Device-Id') or '').strip()[:64] if request else ''
    if device_id:
        from models.trusted_device import TrustedDevice
        ua = (request.headers.get('User-Agent') or '')[:300]
        dev = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user.id, TrustedDevice.device_id == device_id
        ).first()
        if dev is None:
            dev = TrustedDevice(user_id=user.id, device_id=device_id)
            db.add(dev)
        dev.device_name  = _device_name_from_ua(ua)
        dev.user_agent   = ua
        dev.ip_address   = request.client.host if request and request.client else None
        dev.revoked      = False            # a fresh full login re-trusts the device
        dev.revoked_at   = None
        dev.last_seen_at = datetime.now(timezone.utc)
        db.flush()
        token_data['did'] = device_id
    token = create_access_token(token_data)

    db.add(LoginLog(
        user_id=user.id, success=True,
        method='2fa' if getattr(user, 'two_factor_enabled', False) else 'password',
        ip_address=request.client.host if request else None,
    ))
    db.commit()
    return TokenOut(
        access_token=token, user_id=user.id, username=user.username,
        role=user.role, full_name=user.full_name,
    )


@router.get('/me')
def me(current_user: User = Depends(get_current_user)):
    """Return full user profile including photo URL for header sphere."""
    return {
        'id':          current_user.id,
        'username':    current_user.username,
        'email':       current_user.email,
        'first_name':  current_user.first_name,
        'last_name':   current_user.last_name,
        'full_name':   current_user.full_name,
        'role':        current_user.role,
        'department':  getattr(current_user, 'department', None),
        'is_active':   current_user.is_active,
        'is_superuser':current_user.is_superuser,
        'photo_url':   getattr(current_user, 'profile_photo', None),
        'has_2fa':     getattr(current_user, 'two_factor_enabled', False),
        'must_setup_2fa': _must_setup_2fa(current_user),
        'preferred_language': getattr(current_user, 'preferred_language', 'en'),
        'hospital_id': getattr(current_user, 'hospital_id', None),
        'employee_id': getattr(current_user, 'employee_id', None),
    }


@router.patch('/me/language')
def set_language(
    language: str,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Persist the user's preferred interface language (en | fr | rw)."""
    if language not in {'en', 'fr', 'rw'}:
        raise HTTPException(400, 'language must be one of en, fr, rw')
    if hasattr(current_user, 'preferred_language'):
        current_user.preferred_language = language
        db.commit()
    return {'status': 'ok', 'preferred_language': language}


@router.post('/change-password')
def change_password(
    body:         PasswordChange,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail='Current password incorrect')
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {'message': 'Password changed successfully'}


# ── Two-factor authentication (TOTP — Google Authenticator / Authy) ───────────

class TwoFACodeIn(BaseModel):
    code: str


@router.post('/2fa/setup')
def twofa_setup(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Begin 2FA enrolment: create a TOTP secret (not yet active) and return the
    otpauth:// URI to render as a QR code. Call /2fa/enable with a code to turn
    it on. Re-running before enabling rotates the pending secret."""
    if pyotp is None:
        raise HTTPException(status_code=503, detail='2FA unavailable: pyotp not installed')
    if getattr(current_user, 'two_factor_enabled', False):
        raise HTTPException(status_code=400, detail='2FA already enabled')

    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email or current_user.username,
        issuer_name=_TOTP_ISSUER,
    )
    # Render the otpauth URI as a scannable QR (PNG data-URI) so the frontend
    # can just <img src=...>. Falls back to text secret if qrcode is absent.
    qr_data_uri = None
    try:
        import io, base64, qrcode
        buf = io.BytesIO()
        qrcode.make(uri).save(buf, format='PNG')
        qr_data_uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        pass
    # `secret` is returned once so the user can type it manually if the QR fails.
    return {'secret': secret, 'otpauth_uri': uri, 'issuer': _TOTP_ISSUER,
            'qr_data_uri': qr_data_uri}


@router.post('/2fa/enable')
def twofa_enable(
    body:         TwoFACodeIn,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Confirm a code from the authenticator app to activate 2FA."""
    if pyotp is None:
        raise HTTPException(status_code=503, detail='2FA unavailable: pyotp not installed')
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail='Run /2fa/setup first')
    if not pyotp.TOTP(current_user.totp_secret).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail='Invalid code')
    current_user.two_factor_enabled = True
    db.commit()
    # Issue one-time backup codes — shown ONCE, store them safely.
    backup_codes = _generate_backup_codes(db, current_user)
    return {'message': '2FA enabled', 'two_factor_enabled': True, 'backup_codes': backup_codes}


@router.post('/2fa/backup-codes')
def twofa_regenerate_backup_codes(
    body:         TwoFACodeIn,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Regenerate backup codes (invalidates the old set). Requires a current
    authenticator code. Returns the new plaintext codes once."""
    if not getattr(current_user, 'two_factor_enabled', False):
        raise HTTPException(status_code=400, detail='2FA is not enabled')
    if pyotp is None or not current_user.totp_secret or \
            not pyotp.TOTP(current_user.totp_secret).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail='Invalid code')
    codes = _generate_backup_codes(db, current_user)
    return {'message': 'New backup codes generated', 'backup_codes': codes}


@router.post('/2fa/disable')
def twofa_disable(
    body:         TwoFACodeIn,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Turn 2FA off. Requires a current authenticator code to prove possession."""
    if not getattr(current_user, 'two_factor_enabled', False):
        raise HTTPException(status_code=400, detail='2FA is not enabled')
    if pyotp is None or not current_user.totp_secret or \
            not pyotp.TOTP(current_user.totp_secret).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail='Invalid code')
    current_user.two_factor_enabled = False
    current_user.totp_secret = None
    db.query(TwoFactorBackupCode).filter(TwoFactorBackupCode.user_id == current_user.id).delete()
    db.commit()
    return {'message': '2FA disabled', 'two_factor_enabled': False}


@router.post('/create-user', response_model=UserOut)
def create_user(
    body:         CreateUserIn,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    # Admin, IT admin AND lab manager can add staff after installation.
    if current_user.role not in ('super_admin', 'it_admin', 'lab_manager'):
        raise HTTPException(status_code=403, detail='Insufficient permissions')
    # A lab manager cannot mint privileged accounts (no privilege escalation).
    if current_user.role == 'lab_manager' and body.role in ('super_admin', 'it_admin'):
        raise HTTPException(status_code=403, detail='Lab managers cannot create admin accounts')
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail='Username already exists')
    if body.email and db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail='Email already exists')
    user = User(
        username=body.username, email=body.email,
        hashed_password=hash_password(body.password),
        first_name=body.first_name, last_name=body.last_name,
        role=body.role, department=body.department,
        is_active=True,
        hospital_id=current_user.hospital_id,   # new staff join the creator's facility
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Forgot Password / OTP Reset ───────────────────────────────────────────────

class ForgotPasswordIn(BaseModel):
    email: str


class VerifyOTPIn(BaseModel):
    """Legacy one-shot: verify + reset in a single call. Kept for backward compat."""
    email:    str
    otp:      str
    new_password: str


class VerifyOTPOnlyIn(BaseModel):
    """Step 2 of the production flow: verify the code, no password yet."""
    email: str
    otp:   str


class ResetPasswordIn(BaseModel):
    """Step 3 of the production flow: redeem the reset_token for a new password."""
    reset_token:  str
    new_password: str
    confirm_password: str | None = None


def _generate_otp(length: int = 6) -> str:
    # Cryptographically secure AND bound to the post-quantum signing layer
    # (see core/pqc.derive_code) so the code is tied to the PQC key.
    return pqc.derive_code(length)


def _send_otp_email(email: str, otp: str, username: str, confirm_token: str = '') -> bool:
    """
    Send OTP via email. In production: configure SMTP in .env.
    Logs the OTP to server console as fallback (dev mode).
    """
    import logging
    log = logging.getLogger('auth.otp')
    log.info('='*50)
    log.info(f'OTP RESET for {username} <{email}>: {otp}')
    log.info(f'Expires in 15 minutes.')
    log.info('='*50)

    try:
        import smtplib, os
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        smtp_host = os.environ.get('EMAIL_HOST', '')
        smtp_user = os.environ.get('EMAIL_HOST_USER', '')
        smtp_pass = os.environ.get('EMAIL_HOST_PASSWORD', '')
        smtp_port = int(os.environ.get('EMAIL_PORT', 587))

        if not smtp_host or not smtp_user:
            return True   # dev mode — OTP logged to console

        base = _app_base_url()
        magic = f'{base}/forgot-password?confirm={confirm_token}' if (base and confirm_token) else ''
        msg = MIMEMultipart()
        msg['From']    = f'JORINOVA NEXUS ALIS-X <{smtp_user}>'
        msg['To']      = email
        msg['Subject'] = 'ALIS-X Password Reset Code'
        magic_line = (f'\nOr simply click "Yes, it\'s me" to continue securely:\n    {magic}\n'
                      if magic else '')
        body = f"""
Hello {username},

Your password reset code is:

    {otp}

Enter this 6-digit code in JORINOVA NEXUS to continue.
{magic_line}
This code expires in 15 minutes. It is bound to our post-quantum security key.
If you did not request a password reset, please ignore this email.

JORINOVA NEXUS ALIS-X Security System
        """.strip()
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, email, msg.as_string())
        return True
    except Exception as e:
        log.warning(f'Email send failed (OTP still valid — check console): {e}')
        return True   # OTP still valid even if email fails


@router.post('/forgot-password')
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)):
    """
    Step 1: Request OTP. Sends a 6-digit code to the registered email.

    Always returns 200 (to avoid user enumeration attacks).

    The 6-digit code is sent ONLY to the registered email — it is never
    returned to the browser. The email also carries a "Yes, it's me" magic
    link (when APP_BASE_URL is set) so the user can confirm from their own
    device. If SMTP is not configured the code is written to the SERVER log
    only (so an operator can retrieve it during setup) — still never exposed
    to the client.
    """
    user    = db.query(User).filter(User.email == body.email).first()
    payload = {'message': 'If that email is registered, a reset code has been sent.'}
    if user:
        key     = body.email.lower()
        otp     = _generate_otp()
        expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        _otp_store[key] = (otp, expires)
        # "Yes, it's me" magic-link token (same 15-min lifetime as the code)
        confirm_token = secrets.token_urlsafe(24)
        _confirm_store[confirm_token] = (key, expires)
        _send_otp_email(user.email, otp, user.username, confirm_token)
    return payload


@router.get('/confirm-reset')
def confirm_reset(token: str):
    """Magic-link target — the user tapped "Yes, it's me" in their email.
    Validates the confirm token, consumes the pending OTP, issues a reset
    token, and redirects the browser straight to the set-new-password step.
    Falls back to a relative path when APP_BASE_URL is not configured."""
    base   = _app_base_url()
    stored = _confirm_store.pop(token, None)

    def _to(path: str):
        return RedirectResponse((base + path) if base else path, status_code=303)

    if not stored:
        return _to('/forgot-password?error=expired')
    email_key, expires = stored
    if datetime.now(timezone.utc) > expires:
        _otp_store.pop(email_key, None)
        return _to('/forgot-password?error=expired')

    # Identity confirmed from the user's own email/device — consume the OTP and
    # issue a short-lived reset token, then drop the user on the password step.
    _otp_store.pop(email_key, None)
    rt = secrets.token_urlsafe(32)
    _reset_token_store[rt] = (
        email_key, datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_TTL_MIN),
    )
    return _to(f'/forgot-password?reset_token={rt}')


@router.post('/verify-otp')
def verify_otp(body: VerifyOTPOnlyIn):
    """
    Step 2 (production flow): validate the OTP standalone and issue a
    short-lived reset_token. The OTP is consumed (removed from the store)
    here, so it cannot be replayed. Pass the returned reset_token to
    /reset-password within %d minutes.
    """ % _RESET_TOKEN_TTL_MIN
    key    = body.email.lower()
    stored = _otp_store.get(key)

    if not stored:
        raise HTTPException(status_code=400, detail='No OTP requested for this email')

    otp, expires = stored
    if datetime.now(timezone.utc) > expires:
        _otp_store.pop(key, None)
        raise HTTPException(status_code=400, detail='OTP has expired. Request a new one.')

    if otp != body.otp.strip():
        raise HTTPException(status_code=400, detail='Invalid OTP')

    # OTP is valid — consume it and issue a reset token
    _otp_store.pop(key, None)
    token  = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_TTL_MIN)
    _reset_token_store[token] = (key, expiry)

    return {
        'message':     'OTP verified. Use the reset_token to set a new password.',
        'reset_token': token,
        'expires_in':  _RESET_TOKEN_TTL_MIN * 60,
    }


@router.post('/reset-password')
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    """
    Step 3 (production flow): redeem the reset_token for a new password.
    The token is single-use and short-lived — see /verify-otp.
    """
    stored = _reset_token_store.get(body.reset_token)
    if not stored:
        raise HTTPException(status_code=400, detail='Invalid or unknown reset token')

    email_key, expiry = stored
    if datetime.now(timezone.utc) > expiry:
        _reset_token_store.pop(body.reset_token, None)
        raise HTTPException(status_code=400, detail='Reset token has expired. Start over.')

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')

    if body.confirm_password is not None and body.confirm_password != body.new_password:
        raise HTTPException(status_code=400, detail='Passwords do not match')

    user = db.query(User).filter(User.email == email_key).first()
    if not user:
        # Token was issued against this email moments ago, so this should
        # only happen if the user was deleted in the gap.
        _reset_token_store.pop(body.reset_token, None)
        raise HTTPException(status_code=404, detail='User no longer exists')

    user.hashed_password = hash_password(body.new_password)
    db.commit()
    _reset_token_store.pop(body.reset_token, None)   # single-use

    import logging
    logging.getLogger('auth.otp').info(f'Password reset successful for {user.username}')
    return {'message': 'Password reset successful. Please log in with your new password.'}


@router.post('/verify-otp-reset')
def verify_otp_reset(body: VerifyOTPIn, db: Session = Depends(get_db)):
    """
    Legacy one-shot endpoint — verify the OTP and reset the password in a
    single call. Kept for backward compatibility with existing clients;
    new frontends should use /verify-otp then /reset-password.
    """
    key    = body.email.lower()
    stored = _otp_store.get(key)

    if not stored:
        raise HTTPException(status_code=400, detail='No OTP requested for this email')

    otp, expires = stored
    if datetime.now(timezone.utc) > expires:
        _otp_store.pop(key, None)
        raise HTTPException(status_code=400, detail='OTP has expired. Request a new one.')

    if otp != body.otp.strip():
        raise HTTPException(status_code=400, detail='Invalid OTP')

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')

    user.hashed_password = hash_password(body.new_password)
    db.commit()
    _otp_store.pop(key, None)

    import logging
    logging.getLogger('auth.otp').info(f'Password reset successful for {user.username}')
    return {'message': 'Password reset successful. Please log in with your new password.'}


# ── Trusted-device registry ───────────────────────────────────────────────────

def _device_out(d, current_did: str | None) -> dict:
    return {
        'id':           d.id,
        'device_name':  d.device_name or 'Unknown device',
        'user_agent':   d.user_agent,
        'ip_address':   d.ip_address,
        'revoked':      d.revoked,
        'last_seen_at': d.last_seen_at.isoformat() if d.last_seen_at else None,
        'created_at':   d.created_at.isoformat() if d.created_at else None,
        'current':      bool(current_did) and d.device_id == current_did,
    }


@router.get('/devices')
def list_devices(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the caller's trusted devices (admins see everyone's)."""
    from models.trusted_device import TrustedDevice
    current_did = (request.headers.get('X-Device-Id') or '').strip() or None
    q = db.query(TrustedDevice)
    if not current_user.is_superuser:
        q = q.filter(TrustedDevice.user_id == current_user.id)
    rows = q.order_by(TrustedDevice.last_seen_at.desc()).all()
    return [_device_out(d, current_did) for d in rows]


@router.post('/devices/{device_pk}/revoke')
def revoke_device(
    device_pk: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke a device — its session is rejected on the next request."""
    from models.trusted_device import TrustedDevice
    dev = db.query(TrustedDevice).filter(TrustedDevice.id == device_pk).first()
    if not dev:
        raise HTTPException(status_code=404, detail='Device not found')
    if dev.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail='Not permitted')
    dev.revoked = True
    dev.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {'message': 'Device revoked', 'id': dev.id}


@router.delete('/devices/{device_pk}')
def delete_device(
    device_pk: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a device from the registry entirely."""
    from models.trusted_device import TrustedDevice
    dev = db.query(TrustedDevice).filter(TrustedDevice.id == device_pk).first()
    if not dev:
        raise HTTPException(status_code=404, detail='Device not found')
    if dev.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail='Not permitted')
    db.delete(dev)
    db.commit()
    return {'message': 'Device removed', 'id': device_pk}
