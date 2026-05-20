"""Final DB state audit — run after all fixes."""
import sys
sys.path.insert(0, r'D:\JORINOVA NEXUS\backend')

from core.database import SessionLocal, engine
from models.user import User
from models.core_config import Hospital, TestCatalog
from models.worklist import SpecimenTypeConfig
from models.inventory import InventoryItem
from models.quality import IQCResult
from sqlalchemy import inspect as sa_inspect

db = SessionLocal()
print('=== POST-REFACTOR DB STATE ===')
print(f'  Users:          {db.query(User).count()}')
print(f'  Hospitals:      {db.query(Hospital).count()}')
print(f'  Test catalog:   {db.query(TestCatalog).count()}')
print(f'  Specimen types: {db.query(SpecimenTypeConfig).count()}')
print(f'  Inventory:      {db.query(InventoryItem).count()}')
print(f'  IQC results:    {db.query(IQCResult).count()}')
print()
for u in db.query(User).order_by(User.username).all():
    print(f'  {u.username:15s}  role={u.role:15s}  email={u.email}')

inspector = sa_inspect(engine)
tables = set(inspector.get_table_names())
crit = ['users','patients','hospitals','lab_requests','lab_results',
        'audit_logs','escalation_records','sample_rejections']
print()
print('CRITICAL TABLE CHECK:')
all_ok = True
for t in crit:
    ok = t in tables
    print(f'  {"PASS" if ok else "FAIL"}  {t}')
    if not ok: all_ok = False
print()
print('ALL CRITICAL TABLES PRESENT:', all_ok)
print('TOTAL TABLES:', len(tables))
db.close()
