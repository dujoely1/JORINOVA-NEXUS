"""
Idempotent: give the owner a personal account on dujoely1@gmail.com WITHOUT
disturbing the admin account.

Background: the `admin` account was installed with email dujoely1@gmail.com.
Sharing one email across two users makes forgot-password ambiguous, so this
script:
  1. Restores admin (email admin@alis-x.rw) with the ADMIN_PASSWORD env value
     (or a random one printed once).
  2. Creates/refreshes a separate `dujoely` super-admin that OWNS the email,
     so login AND the forgot-password (email OTP) flow both work for it.

Re-run safely any time:   python scripts/add_user_dujoely.py
"""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.database import SessionLocal
from core.security import hash_password
from models.user import User
from models.core_config import Hospital

EMAIL       = 'dujoely1@gmail.com'
USERNAME    = 'dujoely'
ADMIN_EMAIL = 'admin@alis-x.rw'

# Passwords come ONLY from env (deterministic). In production a missing variable
# fails fast; a temporary random password is allowed solely in dev mode.
from core.bootstrap import resolve_seed_password
PASSWORD, _owner_generated       = resolve_seed_password('OWNER_PASSWORD')
ADMIN_PASSWORD, _admin_generated = resolve_seed_password('ADMIN_PASSWORD')


def main() -> None:
    db = SessionLocal()
    try:
        hospital = db.query(Hospital).first()
        hospital_id = hospital.id if hospital else None

        # 1) Restore the admin account so the email is free for the owner and the
        #    documented pilot credential keeps working.
        admin = db.query(User).filter(User.username == 'admin').first()
        if admin:
            if (admin.email or '').lower() == EMAIL.lower():
                admin.email = ADMIN_EMAIL
            admin.hashed_password = hash_password(ADMIN_PASSWORD)
            admin.is_active = True
            _shown = f' / {ADMIN_PASSWORD}' if _admin_generated else ' (from ADMIN_PASSWORD env)'
            print(f'admin restored: admin{_shown}  (email {admin.email})')

        # 2) Owner account — matched by username only (never hijack by email).
        user = db.query(User).filter(User.username == USERNAME).first()
        if user:
            user.email           = EMAIL
            user.hashed_password = hash_password(PASSWORD)
            user.is_active       = True
            action = 'updated'
        else:
            user = User(
                username           = USERNAME,
                email              = EMAIL,
                first_name         = 'Joely',
                last_name          = 'Du',
                hashed_password    = hash_password(PASSWORD),
                role               = 'super_admin',
                is_active          = True,
                is_superuser       = True,
                preferred_language = 'en',
                hospital_id        = hospital_id,
            )
            db.add(user)
            action = 'created'

        db.commit()
        _opw = f' / {PASSWORD}' if _owner_generated else ' (from OWNER_PASSWORD env)'
        print(f'OK — owner account {action}: {USERNAME}{_opw}  <{EMAIL}>  role={user.role}')
    except Exception as e:
        db.rollback()
        print(f'FAILED: {e}')
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
