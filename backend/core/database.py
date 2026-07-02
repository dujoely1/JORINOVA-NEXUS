"""Database engine and session factory."""
import logging

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from .config import get_settings

log = logging.getLogger('alis_x.db')

settings = get_settings()

# Sync engine (used for most operations)
engine = create_engine(
    settings.database_url,
    connect_args={'check_same_thread': False} if 'sqlite' in settings.database_url else {},
    pool_pre_ping=True,
    echo=settings.debug,
)

# SQLite WAL mode for better concurrent reads
if 'sqlite' in settings.database_url:
    @event.listens_for(engine, 'connect')
    def _set_wal(conn, _):
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=ON')

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a database session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all_tables():
    """Create all tables (called on startup). Import ALL models to register them."""
    from models import (  # noqa: F401
        user, patient, core_config, laboratory,
        blood_bank, biochemistry, inventory,
        microbiology, molecular,
        voice_settings, escalation, rejection,
        # New clinical models
        hematology, coagulation, serology, urinalysis,
        quality, staffhub, audit, surveillance,
        notifications, anapath,
        voice_biometric,
        # Worklist preparation & billing
        worklist, billing,
        # Sync (offline-first)
        sync_queue,
        # Security — 2FA backup/recovery codes
        two_factor_backup,
        # Staff Security Hub — hospital device registry + dynamic attributes
        device_registry,
        # License / activation keys
        license,
    )
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """Lightweight, non-destructive auto-migration.

    ``create_all`` only creates tables that don't exist yet — it never alters an
    existing table. So when a new (additive) column is introduced on a model, an
    older database keeps the stale schema and every ORM query then fails with
    "no such column". This walks every mapped table and, for any column missing
    from the live DB, runs ``ALTER TABLE ... ADD COLUMN``.

    Safe by design: it ONLY adds columns (never drops/renames), and adds them as
    nullable so existing rows stay valid. Currently SQLite-only; on other engines
    use a real migration tool.
    """
    if 'sqlite' not in settings.database_url:
        return
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # freshly created by create_all — already complete
            live_cols = {c['name'] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in live_cols:
                    continue
                try:
                    col_type = col.type.compile(dialect=engine.dialect)
                except Exception:
                    col_type = 'TEXT'
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'
                default = getattr(col, 'server_default', None)
                if default is not None and getattr(default, 'arg', None) is not None:
                    try:
                        ddl += f' DEFAULT {default.arg.text}'  # type: ignore[attr-defined]
                    except Exception:
                        pass
                try:
                    conn.execute(text(ddl))
                    log.warning('Auto-migrated: added column %s.%s', table.name, col.name)
                except Exception as exc:                       # pragma: no cover
                    log.error('Could not add column %s.%s: %s', table.name, col.name, exc)
