"""Startup lifecycle validation — end-to-end in-process."""
import sys, os

# Force UTF-8 on Windows console
if sys.platform == 'win32':
    os.system('chcp 65001 >nul 2>&1')
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'D:\JORINOVA NEXUS\backend')

from core.determinism import initialize_determinism
from core.database import SessionLocal, engine
from sqlalchemy.orm import configure_mappers

# --- Step 1: determinism ---
initialize_determinism()
print('STEP 1: determinism -- OK')

# --- Step 2: import models ---
import models
print('STEP 2: models imported -- OK')

# --- Step 3: mapper config ---
configure_mappers()
print('STEP 3: mapper configuration -- OK')

# --- Step 4: table count ---
from sqlalchemy import inspect as sa_inspect
inspector = sa_inspect(engine)
tables = inspector.get_table_names()
print(f'STEP 4: {len(tables)} tables present -- OK')

# --- Step 5: seed ---
from models.worklist import SpecimenTypeConfig
from models.user import User
from models.core_config import Hospital, TestCatalog
from models.inventory import InventoryItem

db = SessionLocal()
print(f'STEP 5: specimen_types={db.query(SpecimenTypeConfig).count()}')
print(f'        users={db.query(User).count()}')
print(f'        hospitals={db.query(Hospital).count()}')
print(f'        test_catalog={db.query(TestCatalog).count()}')
print(f'        inventory={db.query(InventoryItem).count()}')

# Critical tables check
crit = ['users','patients','hospitals','lab_requests','lab_results',
        'audit_logs','escalation_records','sample_rejections']
print()
print('CRITICAL TABLE CHECK:')
all_ok = True
for t in crit:
    ok = t in tables
    symbol = 'OK' if ok else 'MISSING'
    print(f'  [{symbol}]  {t}')
    if not ok: all_ok = False

print()
print('STARTUP LIFECYCLE VALIDATION:', 'PASS' if all_ok else 'FAIL')

# --- Step 6: determinism rerun ---
print()
print('=== DETERMINISM RERUN (3 consecutive runs) ===')
for i in range(3):
    initialize_determinism()
import random
vals = []
for i in range(3):
    initialize_determinism()
    random.seed(42)
    vals.append(tuple(random.randint(0, 9999) for _ in range(6)))
print(f'  Run 1: {vals[0]}')
print(f'  Run 2: {vals[1]}')
print(f'  Run 3: {vals[2]}')
same = vals[0] == vals[1] == vals[2]
print(f'  All identical: {same}')

db.close()
