"""
JORINOVA NEXUS ALIS-X — FastAPI Application
Version 2.0 | FastAPI + SQLAlchemy + Hybrid AI (Local + Cloud)
"""
import os
import re
import sys
import logging
from contextlib import asynccontextmanager
from datetime import date as date_today, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status, Cookie
from fastapi import WebSocket, WebSocketDisconnect

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# ── Ensure backend is on sys.path ──────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

# Force UTF-8 console so emoji / accented chars in log lines (☎ 🚨 — etc.) never
# crash logging on a Windows cp1252 terminal.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')   # type: ignore[attr-defined]
    except Exception:
        pass

from core.config import get_settings
from core.database import create_all_tables
from core.security import hash_password

# Centralized deterministic bootstrap (must run before any demo/seed/random generation)
try:
    from core.bootstrap import initialize_application

    # Enforce Python 3.12-only runtime compatibility
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(
            f"ALIS-X requires Python 3.12.x only. Current interpreter: {sys.version}"
        )

    initialize_application()

except Exception as _e:
    logging.getLogger('alis_x').warning('Determinism/ORM bootstrap failed, continuing: %s', str(_e)[:160])

logging.basicConfig(
    level=logging.INFO,

    format='%(asctime)s [%(levelname)s] %(name)s — %(message)s',
)
logger   = logging.getLogger('alis_x')
settings = get_settings()

# Production guard: FAIL FAST on a default/placeholder signing key. A weak
# SECRET_KEY lets anyone forge JWTs, so in production this is fatal, not a warning.
_weak_key = (str(settings.secret_key).startswith('change-this')
             or str(settings.secret_key).startswith('alis-x-change-this'))
if _weak_key:
    if settings.debug:
        logger.warning('SECURITY: SECRET_KEY is the default — OK for dev, but set a strong '
                       'SECRET_KEY before production (python -c "import secrets; print(secrets.token_urlsafe(48))").')
    else:
        raise RuntimeError(
            'SECRET_KEY is the insecure default in a production run (DEBUG=false). '
            'Set a strong SECRET_KEY in .env before starting '
            '(python -c "import secrets; print(secrets.token_urlsafe(48))").')


# ── Startup / Shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('ALIS-X starting up — offline-first mode…')
    create_all_tables()
    await _seed_default_data()
    logger.info('Database ready.')

    # AI services: probe asynchronously — never block startup
    import asyncio
    asyncio.create_task(_probe_ai_services())

    yield
    logger.info('ALIS-X shutting down.')


async def _probe_ai_services():
    """
    Background AI service probe on startup.
    Does not block — system is operational regardless of AI status.
    """
    import asyncio
    await asyncio.sleep(2)   # let app fully start first
    try:
        from ai_services.local_llm import is_available as ollama_ok, pull_model_if_missing
        from ai_services.cloud_llm import is_available as cloud_ok

        local_up = await ollama_ok()
        cloud_up = await cloud_ok()

        logger.info('AI Status — Local(Ollama): %s | Cloud(Claude): %s',
                    '✓ Online' if local_up else '✗ Offline',
                    '✓ Online' if cloud_up  else '✗ Offline (using local/rules)')

        if local_up:
            # Pull model in background if not already present
            asyncio.create_task(pull_model_if_missing())
        else:
            logger.info('System running in OFFLINE mode — rules engine + coded responses active')

    except Exception as e:
        logger.warning('AI probe error (non-critical): %s', e)


async def _seed_default_data():
    """Create default hospital, departments, admin user, and test rules if empty."""
    from core.database import SessionLocal
    from models.core_config import Hospital, LaboratoryDepartment, TestCatalog
    from models.core_config import TestInterpretationRule, ReflexTestRule
    from models.user import User

    db = SessionLocal()
    try:
        # Default hospital
        hospital = db.query(Hospital).first()
        if not hospital:
            hospital = Hospital(
                name='JORINOVA NEXUS Default Hospital',
                address='Rwanda', district='Kigali', phone='+250000000000',
                hospital_type='public', has_lab=True,
            )
            db.add(hospital)
            db.flush()
            logger.info('Default hospital created.')

        # Admin user — DETERMINISTIC: the password comes ONLY from ADMIN_PASSWORD.
        # We resolve the password ONLY when the admin must be created (idempotent),
        # so existing deployments are never forced to set it. In production a
        # missing ADMIN_PASSWORD fails fast instead of inventing a random one.
        import os as _os
        _admin_email = (_os.environ.get('ADMIN_EMAIL') or 'admin@alis-x.rw').strip()
        _existing_admin = db.query(User).filter(User.username == 'admin').first()
        if not _existing_admin:
            from core.bootstrap import resolve_seed_password
            _admin_pw, _generated = resolve_seed_password('ADMIN_PASSWORD')
            admin = User(
                username='admin', email=_admin_email,
                first_name='ALIS-X', last_name='Admin',
                hashed_password=hash_password(_admin_pw),
                role='super_admin', is_superuser=True, is_active=True,
                hospital_id=hospital.id,
            )
            db.add(admin)
            if _generated:
                logger.warning('[DEV MODE] Admin created with a TEMPORARY random password: '
                               'admin / %s — set ADMIN_PASSWORD and change it. This NEVER '
                               'happens in production (it would fail fast instead).', _admin_pw)
            else:
                logger.info('Admin user created: admin <%s> (password from ADMIN_PASSWORD env).', _admin_email)
        elif _os.environ.get('ADMIN_EMAIL') and _existing_admin.email != _admin_email:
            # Keep the admin contact in sync with ADMIN_EMAIL (no manual DB edit
            # needed — set ADMIN_EMAIL in the env and redeploy). Skips if another
            # user already owns that email (unique constraint).
            _clash = db.query(User).filter(User.email == _admin_email, User.id != _existing_admin.id).first()
            if _clash:
                logger.warning('ADMIN_EMAIL %s already used by another user — admin email unchanged.', _admin_email)
            else:
                _existing_admin.email = _admin_email
                logger.info('Admin email updated to %s from ADMIN_EMAIL env.', _admin_email)

        db.commit()

        # Seed inventory if empty
        from models.inventory import InventoryItem
        if db.query(InventoryItem).count() == 0:
            _seed_inventory(db, hospital)

        # Seed specimen types if empty
        from services.worklist_service import seed_specimen_types
        from models.worklist import SpecimenTypeConfig
        if db.query(SpecimenTypeConfig).count() == 0:
            seeded = seed_specimen_types(db)
            logger.info('Specimen types seeded: %d', seeded)

        # Load test rules if empty
        if db.query(TestCatalog).count() == 0:
            logger.info('Loading test catalog and rules…')
            from services.test_rules_loader import load_test_rules
            await load_test_rules(db, hospital)
            logger.info('Test rules loaded.')

    except Exception as e:
        logger.error(f'Seed error: {e}')
        db.rollback()
    finally:
        db.close()


def _seed_inventory(db, hospital):
    """Seed essential lab inventory items into PostgreSQL."""
    from models.inventory import InventoryItem
    from datetime import date
    items = [
        InventoryItem(item_code='EDTA-4ML',   name='EDTA 4mL Lavender Tubes',          category='consumable', unit='box/100', quantity=12, min_stock=5,  unit_cost=8500,  lot_number='L2026A', expiry_date=date(2027,3,1),  location='Store A',   hospital_id=hospital.id),
        InventoryItem(item_code='SST-5ML',    name='SST Gold Top 5mL Tubes',           category='consumable', unit='box/100', quantity=8,  min_stock=10, unit_cost=12000, lot_number='L2026B', expiry_date=date(2027,6,1),  location='Store A',   hospital_id=hospital.id),
        InventoryItem(item_code='CITRATE-3ML',name='Citrate 3mL Blue Tubes',           category='consumable', unit='box/100', quantity=6,  min_stock=5,  unit_cost=9000,  lot_number='L2026C', expiry_date=date(2027,4,1),  location='Store A',   hospital_id=hospital.id),
        InventoryItem(item_code='FLUOR-2ML',  name='Fluoride/Oxalate 2mL Grey Tubes',  category='consumable', unit='box/100', quantity=10, min_stock=5,  unit_cost=7500,  expiry_date=date(2027,6,1),  location='Store A',   hospital_id=hospital.id),
        InventoryItem(item_code='CHEM-GLUC',  name='Glucose Reagent (Cobas)',          category='reagent',    unit='cassette',quantity=4,  min_stock=3,  unit_cost=45000, lot_number='RG2026',  expiry_date=date(2026,8,15), location='Cold Room', hospital_id=hospital.id),
        InventoryItem(item_code='CHEM-CREAT', name='Creatinine Reagent',               category='reagent',    unit='cartridge',quantity=6, min_stock=3,  unit_cost=38000, expiry_date=date(2026,9,1),  location='Cold Room', hospital_id=hospital.id),
        InventoryItem(item_code='CHEM-LFT',   name='Liver Function Test Pack',         category='reagent',    unit='pack',    quantity=3,  min_stock=2,  unit_cost=95000, expiry_date=date(2026,10,1), location='Cold Room', hospital_id=hospital.id),
        InventoryItem(item_code='MAL-RDT',    name='Malaria RDT (HRP2/pLDH)',          category='reagent',    unit='box/25',  quantity=15, min_stock=5,  unit_cost=18000, lot_number='MAL2026', expiry_date=date(2026,12,1), location='Store B',   hospital_id=hospital.id),
        InventoryItem(item_code='HIV-COMBO',  name='HIV Ag/Ab Combo 4th Gen',          category='reagent',    unit='box/25',  quantity=22, min_stock=10, unit_cost=25000, expiry_date=date(2027,1,1),  location='Cold Room', hospital_id=hospital.id),
        InventoryItem(item_code='HBSAG-RDT',  name='HBsAg Rapid Test',                category='reagent',    unit='box/25',  quantity=18, min_stock=8,  unit_cost=15000, expiry_date=date(2026,11,1), location='Store B',   hospital_id=hospital.id),
        InventoryItem(item_code='BACTEC-AER', name='BACTEC Aerobic Blood Culture Bottles', category='reagent',unit='bottle', quantity=30, min_stock=20, unit_cost=4500,  expiry_date=date(2026,10,1), location='Cold Room', hospital_id=hospital.id),
        InventoryItem(item_code='GX-CRTG',    name='GeneXpert MTB/RIF Ultra Cartridges',category='reagent',  unit='cartridge',quantity=2, min_stock=5,  unit_cost=25000, expiry_date=date(2026,9,1),  location='Molecular', hospital_id=hospital.id),
        InventoryItem(item_code='GLOVES-M',   name='Latex Gloves Medium',             category='ppe',        unit='box/100', quantity=25, min_stock=10, unit_cost=3500,  location='PPE Store',         hospital_id=hospital.id),
        InventoryItem(item_code='GLOVES-L',   name='Latex Gloves Large',              category='ppe',        unit='box/100', quantity=18, min_stock=10, unit_cost=3500,  location='PPE Store',         hospital_id=hospital.id),
        InventoryItem(item_code='MASK-N95',   name='N95 Respirator Masks',            category='ppe',        unit='box/20',  quantity=8,  min_stock=5,  unit_cost=12000, expiry_date=date(2028,1,1),  location='PPE Store',         hospital_id=hospital.id),
        InventoryItem(item_code='SLIDE-PLAIN',name='Plain Glass Slides',              category='consumable', unit='box/72',  quantity=20, min_stock=5,  unit_cost=4500,  location='Store A',           hospital_id=hospital.id),
        InventoryItem(item_code='IMMERSION',  name='Immersion Oil (Type A)',          category='reagent',    unit='bottle',  quantity=5,  min_stock=2,  unit_cost=8000,  expiry_date=date(2028,6,1),  location='Microscopy', hospital_id=hospital.id),
        InventoryItem(item_code='LANCETS',    name='Safety Lancets 21G',              category='consumable', unit='box/200', quantity=12, min_stock=5,  unit_cost=6000,  expiry_date=date(2028,1,1),  location='Store A',   hospital_id=hospital.id),
    ]
    for it in items:
        db.add(it)
    db.commit()
    logger.info('Inventory seeded: %d items', len(items))


async def _load_test_rules(db, hospital):
    """Load comprehensive test catalog — same data as Django management command."""
    from models.core_config import (LaboratoryDepartment, TestCatalog,
                                    TestInterpretationRule, ReflexTestRule)
    # Import the data from the services module
    try:
        from services.test_rules_data import DEPARTMENTS, TESTS, RULES, REFLEX
        dept_map: dict[str, LaboratoryDepartment] = {}
        for d in DEPARTMENTS:
            dept = LaboratoryDepartment(
                code=d['code'], name=d['name'], abbreviation=d['abbr'],
                color_hex=d['color'], order=d['order'], hospital_id=hospital.id,
            )
            db.add(dept)
            db.flush()
            dept_map[d['code']] = dept

        test_map: dict[str, TestCatalog] = {}
        for t in TESTS:
            code, name, short, dept_code, unit, specimen, tube, tat, price, ref, order = t
            dept = dept_map.get(dept_code)
            if not dept:
                continue
            test = TestCatalog(
                code=code, name=name, short_name=short, department_id=dept.id,
                unit=unit, specimen_type=specimen, tube_type=tube,
                tat_hours=tat, price=price, reference_range=ref,
                order_in_dept=order, is_active=True,
            )
            db.add(test)
            db.flush()
            test_map[code] = test

        for r in RULES:
            code, flag, interp, sig, causes, actions, req_doc, doc_msg, doc_urg = r
            test = test_map.get(code)
            if not test:
                continue
            db.add(TestInterpretationRule(
                test_id=test.id, flag_trigger=flag, interpretation=interp,
                clinical_significance=sig, possible_causes=causes,
                recommended_actions=actions, requires_doctor_confirmation=req_doc,
                doctor_message=doc_msg, doctor_urgency=doc_urg or '',
            ))

        for r in REFLEX:
            trig_code, trig_flag, sug_code, rtype, reason, dept_name, note = r
            trigger   = test_map.get(trig_code)
            suggested = test_map.get(sug_code)
            if not trigger or not suggested:
                continue
            db.add(ReflexTestRule(
                trigger_test_id=trigger.id, trigger_flag=trig_flag,
                suggested_test_id=suggested.id, suggestion_type=rtype,
                reason=reason, suggested_department=dept_name, note_to_doctor=note,
            ))

        db.commit()
    except ImportError:
        logger.warning('test_rules_data.py not found — test catalog not loaded.')


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title     = settings.app_name,
    version   = settings.app_version,
    description = 'Hospital Laboratory Information System — FastAPI + Hybrid AI',
    docs_url  = '/api/docs',
    redoc_url = '/api/redoc',
    lifespan  = lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

# CORS — restrict origins in production (never use '*' in production)
_ALLOWED_ORIGINS = (
    [o.strip() for o in settings.allowed_hosts.split(',') if o.strip()]
    if not settings.debug
    else ['*']
)
if settings.debug:
    logger.warning('CORS: allow_origins=["*"] (debug mode — restrict in production!)')
else:
    logger.info('CORS origins: %s', _ALLOWED_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS if not settings.debug else ['*'],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type', 'X-Request-ID', 'Accept-Language', 'X-Lang'],
    expose_headers=['X-Request-ID'],
    max_age=600,
)

# ── Rate Limiting (slowapi) ───────────────────────────────────────────────────
# The Limiter itself lives in core.limiter so routers (e.g. auth) can decorate
# their endpoints with the SAME instance via `@limit("5/minute")`.
from core.limiter import limiter
if limiter is not None:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    logger.info('Rate limiter: active (200/min global, 5/min on login)')
else:
    logger.warning('slowapi not installed — rate limiting disabled. Run: pip install slowapi')

# ── Security headers middleware ───────────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
import uuid

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        request_id = str(uuid.uuid4())[:8]
        response = await call_next(request)
        response.headers['X-Request-ID']       = request_id
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options']    = 'DENY'
        response.headers['X-XSS-Protection']   = '1; mode=block'
        if not settings.debug:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Static files ──────────────────────────────────────────────────────────────

FRONTEND_DIR = Path(__file__).parent.parent / 'frontend'

# Media files (staff photos, uploads). Lives at <backend>/media — the dir the
# Dockerfile creates and chowns (writable by the non-root app user). Using one
# extra .parent pointed at the container root (/media, root-owned) → upload 500s.
MEDIA_DIR = Path(__file__).parent / 'media'
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount('/media', StaticFiles(directory=str(MEDIA_DIR)), name='media')

# ── API Routers (register all — graceful import) ─────────────────────────────

_ROUTERS = [
    # Core
    ('routers.sync',            'router'),   # first: ping has no auth
    ('routers.setup',           'router'),   # public — first-run init wizard
    ('routers.media',           'router'),   # public — serves DB-stored avatars
    ('routers.auth',            'router'),
    ('routers.qr_login',        'router'),   # QR / phone approval login
    ('routers.patients',        'router'),
    ('routers.laboratory',      'router'),
    ('routers.ai_nexus',        'router'),
    # Clinical departments
    ('routers.hematology',      'router'),
    ('routers.coagulation',     'router'),
    ('routers.serology',        'router'),
    ('routers.urinalysis',      'router'),
    ('routers.microbiology',    'router'),
    ('routers.molecular',       'router'),
    ('routers.biochemistry',    'router'),
    ('routers.anapath',         'router'),
    ('routers.toxicology',      'router'),
    ('routers.molecular_advanced', 'router'),
    ('routers.blood_bank',      'router'),
    # Operations
    ('routers.inventory',       'router'),
    ('routers.quality',         'router'),
    ('routers.staffhub',        'router'),
    ('routers.surveillance',    'router'),
    ('routers.dashboard',       'router'),
    ('routers.reports',         'router'),
    ('routers.records',         'router'),
    ('routers.amendments',      'router'),
    ('routers.reception',       'router'),
    ('routers.shift_handover',  'router'),
    ('routers.notifications',   'router'),
    ('routers.audit',           'router'),
    ('routers.interoperability','router'),
    ('routers.admin_dashboard',  'router'),
    ('routers.voice_biometric',  'router'),
    # Communication & safety
    ('routers.voice',            'router'),
    ('routers.escalation',      'router'),
    ('routers.rejection',       'router'),
    ('routers.documents',       'router'),
    # LIS auto-mapping (lab request form → worklist)
    ('routers.lis_mapping',      'router'),
    # Training / AI demo scenarios
    ('routers.training',         'router'),
    # IoT / analyzer-agnostic ingestion (HL7, ASTM, JSON, CSV; any vendor)
    ('routers.iot',              'router'),
    # PDF reports, SMS notifications, token refresh
    ('routers.pdf_sms',          'router'),
    # Worklist preparation + sample reception
    ('routers.worklist',         'router'),
    # Inline billing at reception
    ('routers.billing',          'router'),
    # Production voice AI assistant
    ('routers.voice_assistant',  'router'),
    # Staff Mobile Hub — Android companion app backend
    ('routers.staff_mobile',     'router'),
    # Staff Security Hub — RBAC sync, hospital device registry, biometric onboarding
    ('routers.staff_security_hub', 'router'),
]

for _mod, _attr in _ROUTERS:
    try:
        import importlib
        _m = importlib.import_module(_mod)
        _r = getattr(_m, _attr)
        app.include_router(_r, prefix='/api/v1')
        logger.info('Router registered: %s', _mod)
    except Exception as _e:
        logger.warning('Router skipped %s: %s', _mod, _e)



@app.get('/', include_in_schema=False)
def root():
    return JSONResponse({
        'app': 'JORINOVA NEXUS ALIS-X',
        'status': 'ok',
        'docs': '/docs',
        'health': '/api/v1/health',
    })


@app.get('/api/v1/health')
def health():
    return {'status': 'ok', 'app': settings.app_name, 'version': settings.app_version}


# ── Error handlers (with French / Kinyarwanda localization) ───────────────────

from starlette.exceptions import HTTPException as StarletteHTTPException
from core.api_i18n import lang_from_request, translate_detail


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Localize the `detail` of any HTTPException to the request language,
    preserving the status code and headers (e.g. WWW-Authenticate on 401)."""
    lang   = lang_from_request(request)
    detail = translate_detail(exc.detail, lang)
    return JSONResponse(
        {'detail': detail},
        status_code=exc.status_code,
        headers=getattr(exc, 'headers', None),
    )


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    logger.error(f'Unhandled error: {exc}')
    lang = lang_from_request(request)
    return JSONResponse(
        {'detail': translate_detail('Internal server error', lang)},
        status_code=500,
    )


# ---------------------------
# Zero-touch demo WebSocket
# ---------------------------

@app.websocket('/ws/zero-touch')
async def ws_zero_touch(websocket: WebSocket):
    await websocket.accept()

    # Simple demo handshake + step loop driven by backend.
    # Frontend is responsible for executing cursor moves / voice / highlights.
    try:
        await websocket.send_json({
            'type': 'STEP',
            'payload': {
                'step': {
                    'id': 'step1_search',
                    'target': 'patient_search',
                    'voiceText': 'Accessing patient records for ID One-Zero-One.',
                    'action': 'type',
                }
            }
        })

        while True:
            msg = await websocket.receive_text()
            # Expect DONE ack from the frontend
            try:
                data = __import__('json').loads(msg)
            except Exception:
                continue

            if data.get('type') != 'DONE':
                continue

            done_step_id = (data.get('payload') or {}).get('stepId')

            if done_step_id == 'step1_search':
                await websocket.send_json({
                    'type': 'STEP',
                    'payload': {
                        'step': {
                            'id': 'step2_analysis',
                            'target': 'lab_results',
                            'voiceText':
                                'Analyzing laboratory data. Hemoglobin is normal, but White Blood Cell count is elevated at 15,000 cells per microliter. Flagging mild leukocytosis.',
                            'action': 'highlight_row',
                        }
                    }
                })
                continue

            if done_step_id == 'step2_analysis':
                await websocket.send_json({
                    'type': 'STEP',
                    'payload': {
                        'step': {
                            'id': 'step3_approve',
                            'target': 'approve_sign',
                            'voiceText':
                                'No critical panic values detected. Results have been automatically validated, digitally signed under Jorinova Nexus protocols, and transmitted.',
                            'action': 'approve',
                        }
                    }
                })
                continue

            if done_step_id == 'step3_approve':
                # Demo complete; send a single terminal message and close.
                await websocket.send_json({
                    'type': 'DONE',
                    'payload': {'stepId': 'complete'}
                })
                await websocket.close()
                return

    except WebSocketDisconnect:
        return
    except Exception:
        # Ensure socket closes on unexpected errors
        try:
            await websocket.close()
        except Exception:
            pass
        return


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True, log_level='info')

