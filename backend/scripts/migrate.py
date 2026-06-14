"""
Database migration / bootstrap entrypoint.

Invoked by the `migrate` service in docker-compose.yml (`python scripts/migrate.py`)
before the API starts. It:
  1. waits for the database to accept connections (Postgres may still be warming up),
  2. creates every table via create_all_tables() (the project uses SQLAlchemy
     create_all rather than live Alembic upgrades), and
  3. ensures a super_admin account exists, using ADMIN_PASSWORD / OWNER_PASSWORD
     from the environment (a strong random password is generated and logged once
     if they are not set).

Exits 0 on success so the compose dependency `service_completed_successfully`
is satisfied; exits non-zero only if the database never becomes reachable.
"""
import os
import sys
import time
import secrets
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Allow `python scripts/migrate.py` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import models  # noqa: F401  — registers every ORM model with the shared Base
from core.database import create_all_tables, SessionLocal, engine
from core.security import hash_password
from models.user import User


def _wait_for_db(retries: int = 30, delay: float = 2.0) -> None:
    from sqlalchemy import text
    last = None
    for i in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            print(f'[migrate] database reachable (attempt {i}).')
            return
        except Exception as e:  # pragma: no cover
            last = e
            print(f'[migrate] waiting for database… ({i}/{retries})')
            time.sleep(delay)
    print(f'[migrate] FAILED: database not reachable: {last}')
    sys.exit(1)


def _ensure_admin() -> None:
    db = SessionLocal()
    try:
        accounts = [
            ('admin', 'admin@alis-x.rw', 'ADMIN_PASSWORD'),
            ('dujoely', 'dujoely1@gmail.com', 'OWNER_PASSWORD'),
        ]
        from core.bootstrap import resolve_seed_password
        for username, email, env_key in accounts:
            if db.query(User).filter(User.username == username).first():
                print(f'[migrate] account "{username}" already exists — skipped.')
                continue
            # Deterministic: password from the env var; production fails fast if
            # it is missing (no silent random generation).
            pw, generated = resolve_seed_password(env_key)
            if generated:
                print(f'[migrate] [DEV MODE] {env_key} not set — TEMPORARY random password for '
                      f'"{username}": {pw}  (set {env_key}; production would fail fast instead)')
            db.add(User(
                username=username, email=email, first_name=username.capitalize(),
                last_name='', hashed_password=hash_password(pw),
                role='super_admin', is_active=True, is_superuser=True,
            ))
        db.commit()
        print('[migrate] admin accounts ensured.')
    finally:
        db.close()


def main() -> None:
    print('[migrate] starting database bootstrap…')
    _wait_for_db()
    create_all_tables()
    print('[migrate] tables created / verified.')
    _ensure_admin()
    print('[migrate] done.')


if __name__ == '__main__':
    main()
