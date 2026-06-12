"""
Idempotent: give the owner a personal account on dujoely1@gmail.com WITHOUT
disturbing the admin account.

Background: the `admin` account was installed with email dujoely1@gmail.com.
Sharing one email across two users makes forgot-password ambiguous, so this
script:
  1. Restores admin to its documented credentials (admin@alis-x.rw / Admin@2026).
  2. Creates/refreshes a separate `dujoely` super-admin that OWNS the email,
     so login AND the forgot-password (email OTP) flow both work for it.

Re-run safely any time:   python scripts/add_user_dujoely.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.database import SessionLocal
from core.security import hash_password
from models.user import User
from models.core_config import Hospital

EMAIL          = 'dujoely1@gmail.com'
USERNAME       = 'dujoely'
PASSWORD       = 'Jorinova@2026'        # known login password (change after first login)
ADMIN_EMAIL    = 'admin@alis-x.rw'
ADMIN_PASSWORD = 'Admin@2026'


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
            print(f'admin restored: admin / {ADMIN_PASSWORD}  (email {admin.email})')

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
        print(f'OK — owner account {action}: {USERNAME} / {PASSWORD}  <{EMAIL}>  role={user.role}')
    except Exception as e:
        db.rollback()
        print(f'FAILED: {e}')
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
