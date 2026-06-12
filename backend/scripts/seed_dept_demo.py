"""
Supplemental department demo seeder (pilot screens must not be empty).

`seed_production_clinical.py` populates the generic `lab_results` table, but the
per-department module pages (Biochemistry, Microbiology, Serology, Blood Bank,
Hematology) read their OWN tables. This script drops a small, realistic set of
rows into those tables so every clinical screen shows data on stage.

Idempotent: each table is skipped if it already has rows. Safe to re-run.

    cd backend && python scripts/seed_dept_demo.py
"""
from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, datetime, timedelta, timezone

import models  # noqa: F401  (register all tables)
from core.database import engine
from sqlalchemy import MetaData, Table, select, func, insert

NOW = datetime.now(timezone.utc)
TODAY = date.today()
_meta = MetaData()


def _table(name: str) -> Table:
    return Table(name, _meta, autoload_with=engine)


def _ids(conn, table: str, col: str, limit: int = 30) -> list:
    t = _table(table)
    return [r[0] for r in conn.execute(select(t.c[col]).limit(limit)).fetchall()]


def _count(conn, table: str) -> int:
    return conn.execute(select(func.count()).select_from(_table(table))).scalar() or 0


def seed():
    with engine.begin() as conn:
        patients = _ids(conn, 'patients', 'id')
        reqs     = _ids(conn, 'lab_requests', 'id')
        if not patients:
            print('No patients — run seed_production_clinical.py first.'); return
        pid = lambda i: patients[i % len(patients)]
        rid = lambda i: (reqs[i % len(reqs)] if reqs else None)

        # ── Biochemistry ──────────────────────────────────────────────────
        if _count(conn, 'biochem_results') == 0:
            rows = [
                ('GENERAL', 'GLUC',  'Glucose',          6.1,  'mmol/L', 'N',  '3.9–6.1',   True,  'VALIDATED'),
                ('GENERAL', 'UREA',  'Urea',             12.4, 'mmol/L', 'H',  '2.5–7.1',   True,  'VALIDATED'),
                ('RENAL',   'CREA',  'Creatinine',       210,  'µmol/L', 'HH', '62–106',    True,  'VALIDATED'),
                ('LIVER',   'ALT',   'ALT',              88,   'U/L',    'H',  '7–56',      False, 'PENDING'),
                ('LIVER',   'AST',   'AST',              45,   'U/L',    'N',  '10–40',     False, 'PENDING'),
                ('LIPIDS',  'CHOL',  'Cholesterol',      5.0,  'mmol/L', 'N',  '<5.2',      True,  'VALIDATED'),
                ('CARDIAC', 'TROP',  'Troponin I',       0.8,  'ng/mL',  'HH', '<0.04',     True,  'VALIDATED'),
                ('ENDO',    'TSH',   'TSH',              0.2,  'mIU/L',  'L',  '0.4–4.0',   True,  'VALIDATED'),
            ]
            t = _table('biochem_results')
            for i, (sec, code, name, val, unit, flag, ref, validated, status) in enumerate(rows):
                conn.execute(insert(t).values(
                    lab_request_id=rid(i), patient_id=pid(i), test_id=(i % 20) + 1,
                    section=sec,
                    result_value=str(val), numeric_value=float(val), unit=unit,
                    flag=flag, reference_range_text=ref,
                    result_source='analyzer', entry_mode='manual',
                    is_validated=validated, authorized=validated, status=status,
                    requires_document=False, created_at=NOW - timedelta(hours=i),
                ))
            print(f'biochem_results: +{len(rows)}')

        # ── Microbiology cultures ─────────────────────────────────────────
        if _count(conn, 'micro_cultures') == 0:
            rows = [
                ('C-0001', 'Blood',  'Growth',    'Staphylococcus aureus',     'GPC clusters', True,  False, False, 'VALIDATED'),
                ('C-0002', 'Urine',  'Growth',    'Escherichia coli (ESBL)',   'GNB',          False, True,  False, 'VALIDATED'),
                ('C-0003', 'Sputum', 'No growth', None,                         'No organisms', False, False, False, 'VALIDATED'),
                ('C-0004', 'Wound',  'Growth',    'Klebsiella pneumoniae (CRO)','GNB',          False, False, True,  'PENDING'),
            ]
            t = _table('micro_cultures')
            for i, (cid, spec, growth, org, gram, mrsa, esbl, cro, status) in enumerate(rows):
                conn.execute(insert(t).values(
                    culture_id=cid, lab_request_id=rid(i), patient_id=pid(i),
                    specimen_type=spec, growth_status=growth, organism_identified=org,
                    gram_stain_done=True, gram_stain_result=gram,
                    is_mrsa=mrsa, is_esbl=esbl, is_cro=cro, is_vrsa=False,
                    status=status, is_validated=(status == 'VALIDATED'),
                    is_critical=(mrsa or esbl or cro), critical_notified=False,
                    readback_confirmed=False, created_at=NOW - timedelta(hours=i),
                ))
            print(f'micro_cultures: +{len(rows)}')

        # ── Parasitology ──────────────────────────────────────────────────
        if _count(conn, 'parasitology_results') == 0:
            rows = [
                ('P-0001', 'BLOOD', 'Blood', 'Malaria parasites seen', 'Plasmodium falciparum', 4.5, True),
                ('P-0002', 'STOOL', 'Stool', 'No parasites seen',       None,                    None, False),
            ]
            t = _table('parasitology_results')
            for i, (paraid, cat, spec, result, sp, pct, crit) in enumerate(rows):
                conn.execute(insert(t).values(
                    para_id=paraid, lab_request_id=rid(i), patient_id=pid(i),
                    category=cat, specimen_type=spec, result=result,
                    parasite_name=sp, parasite_species=sp, parasitemia_pct=pct,
                    rdt_done=True, is_validated=True, is_critical=crit, status='VALIDATED',
                    created_at=NOW - timedelta(hours=i),
                ))
            print(f'parasitology_results: +{len(rows)}')

        # ── Serology ──────────────────────────────────────────────────────
        if _count(conn, 'serology_results') == 0:
            rows = [
                ('S-0001', 'HIV',   'HIV Ag/Ab Combo', 'INFECTIOUS', 'Non-reactive', 0.2, False),
                ('S-0002', 'HBSAG', 'HBsAg',           'INFECTIOUS', 'Reactive',     8.7, True),
                ('S-0003', 'HCV',   'Anti-HCV',        'INFECTIOUS', 'Non-reactive', 0.1, False),
                ('S-0004', 'SYPH',  'Syphilis (RPR)',  'INFECTIOUS', 'Reactive',     4.0, True),
            ]
            t = _table('serology_results')
            for i, (sid, code, name, cat, qual, sco, react) in enumerate(rows):
                conn.execute(insert(t).values(
                    sero_id=sid, lab_request_id=rid(i), patient_id=pid(i),
                    test_code=code, test_name=name, test_category=cat,
                    qualitative=qual, sco_ratio=sco, method='ELISA',
                    result_source='analyzer', bsl_2_alert=react,
                    confirmatory_required=react, confirmatory_done=False,
                    is_validated=True, is_critical=react, status='VALIDATED',
                    created_at=NOW - timedelta(hours=i),
                ))
            print(f'serology_results: +{len(rows)}')

        # ── Blood bank donors ─────────────────────────────────────────────
        if _count(conn, 'donors') == 0:
            rows = [
                ('D-0001', 'Uwimana', 'Jean',   'O+',  'M', '+250788000001', True,  4),
                ('D-0002', 'Mukamana','Alice',  'A+',  'F', '+250788000002', True,  2),
                ('D-0003', 'Niyonzima','Eric',  'B+',  'M', '+250788000003', False, 1),
                ('D-0004', 'Ingabire', 'Claire','O-',  'F', '+250788000004', True,  6),
                ('D-0005', 'Habimana', 'Paul',  'AB+', 'M', '+250788000005', True,  3),
            ]
            t = _table('donors')
            for i, (did, fam, oth, grp, sex, phone, elig, n) in enumerate(rows):
                conn.execute(insert(t).values(
                    donor_id=did, family_name=fam, other_names=oth, blood_group=grp,
                    gender=sex, phone=phone, is_eligible=elig, total_donations=n,
                    last_donation=TODAY - timedelta(days=30 * (i + 1)),
                ))
            print(f'donors: +{len(rows)}')

        # ── Blood bags (top up so the stock grid shows several groups) ─────
        if _count(conn, 'blood_bags') <= 1:
            rows = [
                ('BAG-1001', 'Whole Blood',          'A+',  450, 'available'),
                ('BAG-1002', 'Packed Red Cells',     'O+',  280, 'available'),
                ('BAG-1003', 'Packed Red Cells',     'O-',  280, 'available'),
                ('BAG-1004', 'Fresh Frozen Plasma',  'B+',  250, 'available'),
                ('BAG-1005', 'Platelets',            'AB+', 200, 'available'),
                ('BAG-1006', 'Packed Red Cells',     'A-',  280, 'reserved'),
            ]
            t = _table('blood_bags')
            for i, (bag, comp, grp, vol, status) in enumerate(rows):
                conn.execute(insert(t).values(
                    bag_number=bag, component=comp, blood_group=grp, volume_ml=vol,
                    status=status, collection_date=TODAY - timedelta(days=10 + i),
                    expiry_date=TODAY + timedelta(days=25 - i),
                    is_irradiated=False, is_leukoreduced=(comp == 'Packed Red Cells'),
                ))
            print(f'blood_bags: +{len(rows)}')

        # ── Hematology ────────────────────────────────────────────────────
        if _count(conn, 'hem_results') == 0:
            t = _table('hem_results')
            hgbs = [13.5, 6.2, 11.0, 14.2, 4.8, 12.1]
            wbcs = [7.2, 15.0, 9.1, 6.0, 22.5, 8.3]
            plts = [250, 90, 180, 300, 45, 210]
            for i in range(6):
                crit = i in (1, 4)
                conn.execute(insert(t).values(
                    hem_id=f'H-{1001 + i}', lab_request_id=rid(i), patient_id=pid(i),
                    hgb=hgbs[i], wbc=wbcs[i], plt=plts[i],
                    overall_flag=('HH' if crit else 'N'),
                    result_source='analyzer', is_validated=True, is_critical=crit,
                    critical_notified=False, status='VALIDATED',
                    created_at=NOW - timedelta(hours=i),
                ))
            print('hem_results: +6')

    print('\nDepartment demo data ready.')


if __name__ == '__main__':
    seed()
