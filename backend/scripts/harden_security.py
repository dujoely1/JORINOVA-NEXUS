"""
One-shot production security hardening.

Run this once before/at deployment. It:
  1. Rotates the password of every super_admin (admin, dujoely, …) to a strong
     random value — replacing any password that was hard-coded in source and is
     therefore exposed in git history.
  2. Generates a strong SECRET_KEY and writes it to backend/.env (the app was
     running on the insecure default). This signs all JWTs and invalidates every
     pre-existing session token.
  3. Writes the new credentials + SECRET_KEY to backend/.secrets/credentials.secret
     — a GITIGNORED local file. Nothing secret is printed to the screen.

    cd backend
    python scripts/harden_security.py

After it finishes:
  • Open backend/.secrets/credentials.secret to read the new passwords.
  • Restart the backend so the new SECRET_KEY loads.
  • Log in with the new password (you can change it to a memorable one in-app).

NOTE: post-quantum signatures (CRYSTALS-Dilithium3 via pqcrypto) are already
active — this script only verifies and reports that; it does not change it.
"""
import os
import sys
import secrets
import datetime as _dt
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from core.database import SessionLocal           # noqa: E402
from core.security import hash_password           # noqa: E402
from models.user import User                      # noqa: E402
import core.pqc as pqc                            # noqa: E402

ENV_PATH     = BACKEND / '.env'
SECRETS_DIR  = BACKEND / '.secrets'
SECRETS_FILE = SECRETS_DIR / 'credentials.secret'


def _new_password() -> str:
    """Strong, URL-safe, no ambiguous quoting characters."""
    return secrets.token_urlsafe(15)              # ~20 chars, ~120 bits


def _upsert_env(key: str, value: str) -> None:
    """Set KEY=value in backend/.env, replacing an existing line or appending."""
    lines: list[str] = []
    found = False
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding='utf-8').splitlines()
        for i, ln in enumerate(lines):
            if ln.strip().startswith(f'{key}=') or ln.strip().startswith(f'{key} ='):
                lines[i] = f'{key}={value}'
                found = True
                break
    if not found:
        if lines and lines[-1].strip() != '':
            lines.append('')
        lines.append(f'# Added by harden_security.py on {_dt.date.today().isoformat()}')
        lines.append(f'{key}={value}')
    ENV_PATH.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main() -> None:
    db = SessionLocal()
    rotated: list[tuple[str, str, str]] = []   # (username, email, password)
    try:
        admins = db.query(User).filter(User.role == 'super_admin').order_by(User.id).all()
        if not admins:
            admins = db.query(User).order_by(User.id).all()
        if not admins:
            print('FAIL: no users in the database to rotate.')
            sys.exit(1)

        for u in admins:
            pw = _new_password()
            u.hashed_password = hash_password(pw)
            if hasattr(u, 'login_attempts'):
                u.login_attempts = 0
            rotated.append((u.username, u.email or '', pw))
        db.commit()
    finally:
        db.close()

    # Strong signing key — invalidates every old JWT.
    secret_key = secrets.token_urlsafe(48)
    _upsert_env('SECRET_KEY', secret_key)

    # Write the one and only copy of the secrets to a gitignored local file.
    SECRETS_DIR.mkdir(exist_ok=True)
    stamp = _dt.datetime.now().isoformat(timespec='seconds')
    body = [
        'JORINOVA NEXUS — rotated credentials (KEEP PRIVATE, do NOT commit)',
        f'Generated: {stamp}',
        '=' * 60,
        '',
        'LOGIN ACCOUNTS:',
    ]
    for username, email, pw in rotated:
        body.append(f'  username: {username}')
        body.append(f'  email:    {email}')
        body.append(f'  password: {pw}')
        body.append('')
    body += [
        'SECRET_KEY (written to backend/.env — signs all JWTs):',
        f'  {secret_key}',
        '',
        '=' * 60,
        'NEXT STEPS:',
        '  1. Restart the backend so the new SECRET_KEY loads.',
        '  2. Log in with a password above at http://localhost:3000',
        '  3. Optional: change it to a memorable one via the app.',
        '  4. This file is gitignored. Delete it once you have stored the',
        '     passwords in your password manager.',
    ]
    SECRETS_FILE.write_text('\n'.join(body) + '\n', encoding='utf-8')
    try:
        os.chmod(SECRETS_FILE, 0o600)   # best-effort; no-op on some Windows FS
    except Exception:
        pass

    # Report — NEVER print the actual passwords or key.
    st = pqc.status()
    print('PASS ✅  Security hardened.')
    print('-' * 56)
    print(f'  Rotated passwords for {len(rotated)} account(s): '
          + ', '.join(u for u, _, _ in rotated))
    print('  New strong SECRET_KEY written to backend/.env (old sessions killed).')
    print(f'  Post-quantum: {st.get("backend")} as {st.get("algorithm")} '
          f'(real_pqc={st.get("real_pqc")}).')
    print('-' * 56)
    print(f'  >>> Read the new passwords here: {SECRETS_FILE}')
    print('  >>> Then RESTART the backend so the new SECRET_KEY takes effect.')


if __name__ == '__main__':
    main()
