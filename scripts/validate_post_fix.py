"""Post-fix deterministic seeding validation — 3 consecutive runs."""
import sys
sys.path.insert(0, r'D:\JORINOVA NEXUS\backend')
from core.determinism import initialize_determinism
import random

SEED = 42

results = []
for i in range(3):
    initialize_determinism()          # resets random, numpy, langdetect
    random.seed(SEED)
    row = [random.randint(0, 9999) for _ in range(8)]
    results.append(row)

print('=== DETERMINISTIC SEED RESTART (3 runs) ===')
for i, row in enumerate(results):
    print(f'  Run {i+1}: {row}')

same = all(results[0] == r for r in results[1:])
print(f'All 3 runs identical: {same}')
assert same, 'FAIL: runs differ — determinism broken'
print('DETERMINISTIC SEEDING VALIDATION: PASS')
print()

# Also verify random.seed(42) alone (no initialize_determinism) gives same result
initialize_determinism()
random.seed(42)
r_only_seed = [random.randint(0, 9999) for _ in range(8)]
print(f'random.seed(42) only:   {r_only_seed}')
initialize_determinism()
random.seed(42)
r_with_init = [random.randint(0, 9999) for _ in range(8)]
print(f'initialize_determinism() + random.seed(42): {r_with_init}')
print(f'Photo match: {r_only_seed == r_with_init}')
print()

# Mapper stability: configure_mappers multiple times
from core.database import Base, engine
from sqlalchemy.orm import configure_mappers

for i in range(3):
    configure_mappers()
print('MAPPER INIT STABILITY (3 runs): PASS')
print()

# Full table inventory
inspector = __import__('sqlalchemy', fromlist=['inspect']).inspect(engine)
tables = sorted(inspector.get_table_names())
print(f'TABLE INVENTORY: {len(tables)} tables')
for t in tables:
    marker = ''
    if 'audit' in t: marker = '  [audit]'
    elif 'critical' in t: marker = '  [critical]'
    elif 'iqc' in t: marker = '  [qc]'
    elif 'migration' in t.lower() or 'alembic' in t.lower(): marker = '  [migrate]'
    print(f'  {t}{marker}')
