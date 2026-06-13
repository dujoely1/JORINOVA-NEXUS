"""
Securely rotate a user's password on the LIVE database.

Use this to replace any password that was hard-coded in the source (and is
therefore exposed in git history). The new password is typed into a HIDDEN
prompt (getpass) — it never appears on screen, in your shell history, or in
this repo. It is hashed with the SAME function the app uses to verify logins.

    cd backend
    python scripts/set_password.py            # asks which user, then password
    python scripts/set_password.py admin      # rotate a specific user

Nothing is printed except a success line. Re-run for each account you want to
rotate (e.g. admin and dujoely).
"""
import sys
import getpass
from pathlib import Path

# UTF-8 console so the success line never crashes a Windows cp1252 terminal.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.database import SessionLocal           # noqa: E402
from core.security import hash_password           # noqa: E402
from models.user import User                      # noqa: E402

MIN_LEN = 8


def main() -> None:
    db = SessionLocal()
    try:
        username = sys.argv[1] if len(sys.argv) > 1 else ''
        if not username:
            users = db.query(User).order_by(User.id).all()
            if not users:
                print('No users in the database.')
                sys.exit(1)
            print('Users:')
            for u in users:
                print(f'  - {u.username}   ({u.email or "no email"}, role={u.role})')
            username = input('\nWhich username to rotate? ').strip()

        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f'FAIL: no user named "{username}".')
            sys.exit(1)

        print(f'Rotating password for: {user.username}  ({user.email or "no email"})')
        pw1 = getpass.getpass('New password (hidden): ')
        if len(pw1) < MIN_LEN:
            print(f'FAIL: password must be at least {MIN_LEN} characters.')
            sys.exit(1)
        pw2 = getpass.getpass('Confirm new password:  ')
        if pw1 != pw2:
            print('FAIL: passwords do not match.')
            sys.exit(1)

        user.hashed_password = hash_password(pw1)
        # A rotated password clears any lockout from earlier failed attempts.
        if hasattr(user, 'login_attempts'):
            user.login_attempts = 0
        db.commit()
        print(f'PASS ✅  Password updated for "{user.username}". Log in with the new password.')
    finally:
        db.close()


if __name__ == '__main__':
    main()
