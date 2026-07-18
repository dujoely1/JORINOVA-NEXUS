"""
Lab result interpretation — reference ranges + rule-based pattern flags.
No model/GPU: deterministic rules + (optionally) the LLM on top. Adult defaults;
sex-specific where it matters. Values are illustrative clinical defaults — a lab
should confirm against its own validated ranges.

interpret(results, sex, age) -> {'results':[...], 'impressions':[...], 'critical':[...]}
"""
from typing import Optional
import json
from pathlib import Path

# analyte: (unit, low, high, crit_low, crit_high)  — use None where N/A.
# Sex-specific analytes carry {'M': (...), 'F': (...)}.
RANGES = {
    # ── Biochemistry ──
    'glucose':        ('mmol/L', 3.9, 5.5, 2.2, 25.0),
    'urea':           ('mmol/L', 2.5, 7.1, None, None),
    'creatinine':     ('µmol/L', 62, 106, None, 600),
    'sodium':         ('mmol/L', 135, 145, 120, 160),
    'potassium':      ('mmol/L', 3.5, 5.1, 2.5, 6.5),
    'chloride':       ('mmol/L', 98, 107, None, None),
    'calcium':        ('mmol/L', 2.20, 2.60, 1.60, 3.50),
    'alt':            ('U/L', 7, 56, None, None),
    'ast':            ('U/L', 10, 40, None, None),
    'alp':            ('U/L', 44, 147, None, None),
    'bilirubin_total':('µmol/L', 3, 21, None, None),
    'albumin':        ('g/L', 35, 52, None, None),
    'total_protein':  ('g/L', 64, 83, None, None),
    'cholesterol':    ('mmol/L', 0, 5.2, None, None),
    'triglycerides':  ('mmol/L', 0, 1.7, None, None),
    'hdl':            ('mmol/L', 1.0, 3.0, None, None),
    'ldl':            ('mmol/L', 0, 3.4, None, None),
    'uric_acid':      ('µmol/L', 200, 430, None, None),
    'amylase':        ('U/L', 28, 100, None, None),
    'crp':            ('mg/L', 0, 5, None, None),
    'hba1c':          ('%', 4.0, 5.6, None, None),
    'ferritin':       {'M': ('µg/L', 30, 400, None, None), 'F': ('µg/L', 15, 150, None, None)},
    # ── CBC ──
    'wbc':            ('10^9/L', 4.0, 11.0, 1.0, 30.0),
    'rbc':            {'M': ('10^12/L', 4.5, 5.9, None, None), 'F': ('10^12/L', 4.0, 5.2, None, None)},
    'hb':             {'M': ('g/dL', 13.0, 17.0, 7.0, 20.0), 'F': ('g/dL', 12.0, 15.0, 7.0, 20.0)},
    'hct':            {'M': ('%', 40, 52, None, None), 'F': ('%', 36, 48, None, None)},
    'mcv':            ('fL', 80, 100, None, None),
    'mch':            ('pg', 27, 33, None, None),
    'mchc':           ('g/dL', 32, 36, None, None),
    'platelets':      ('10^9/L', 150, 450, 20, 1000),
    'neutrophils_pct':('%', 40, 75, None, None),
    'lymphocytes_pct':('%', 20, 45, None, None),
    # ── Coagulation ──
    'pt':             ('s', 11, 14, None, None),
    'inr':            ('', 0.8, 1.2, None, 5.0),
    'aptt':           ('s', 25, 35, None, None),
    'fibrinogen':     ('g/L', 2.0, 4.0, None, None),
    'd_dimer':        ('mg/L', 0, 0.5, None, None),
    # ── Hormones ──
    'tsh':            ('mIU/L', 0.4, 4.0, None, None),
    'ft4':            ('pmol/L', 12, 22, None, None),
    'ft3':            ('pmol/L', 3.1, 6.8, None, None),
    'cortisol_am':    ('nmol/L', 170, 540, None, None),
    # ── Tumour markers ──
    'psa':            ('ng/mL', 0, 4.0, None, None),
    'afp':            ('ng/mL', 0, 10, None, None),
    'cea':            ('ng/mL', 0, 5.0, None, None),
    'ca_125':         ('U/mL', 0, 35, None, None),
    'ca_19_9':        ('U/mL', 0, 37, None, None),
}

# accept common aliases -> canonical key
ALIASES = {
    'glucose_fasting': 'glucose', 'fbs': 'glucose', 'rbs': 'glucose',
    'creat': 'creatinine', 'na': 'sodium', 'k': 'potassium', 'cl': 'chloride',
    'ca': 'calcium', 'sgpt': 'alt', 'sgot': 'ast', 'tbil': 'bilirubin_total',
    'hgb': 'hb', 'haemoglobin': 'hb', 'hemoglobin': 'hb', 'plt': 'platelets',
    'ddimer': 'd_dimer', 'ca125': 'ca_125', 'ca199': 'ca_19_9',
}


# ─────────────────────────────────────────────────────────────────────────────
# Curated JSON knowledge wired into the rules engine. The *_reference.json files
# EXTEND RANGES (+ notes/panels); the qualitative maps are exposed for the LLM/RAG.
# All loading is best-effort — the engine still works if a file is missing.
# ─────────────────────────────────────────────────────────────────────────────
_AIDIR = Path(__file__).resolve().parent


def _load_json(name: str) -> dict:
    try:
        return json.loads((_AIDIR / name).read_text(encoding='utf-8'))
    except Exception:
        return {}


NOTES: dict = {}    # analyte -> interpretation note
PANELS: dict = {}   # analyte -> panel (renal/lft/cardiac/...)


def _merge_numeric_ranges():
    """Extend RANGES with curated analytes from the reference JSONs (add-only, so
    the existing tested defaults always win); capture notes + panel tags."""
    for fname in ('clinical_chemistry_reference.json',
                  'endocrinology_reference.json',
                  'coagulation_reference.json'):
        for key, info in (_load_json(fname).get('analytes') or {}).items():
            if not isinstance(info, dict):
                continue
            RANGES.setdefault(key, (info.get('units', ''), info.get('ref_low'),
                                    info.get('ref_high'), info.get('critical_low'),
                                    info.get('critical_high')))
            if info.get('note'):
                NOTES.setdefault(key, info['note'])
            if info.get('panel'):
                PANELS.setdefault(key, info['panel'])
    for key, info in (_load_json('tumor_markers_reference.json').get('markers') or {}).items():
        if isinstance(info, dict):
            RANGES.setdefault(key, (info.get('units', ''), 0, info.get('ref_high'), None, None))
            if info.get('note'):
                NOTES.setdefault(key, info['note'])


_merge_numeric_ranges()

# Qualitative interpretation knowledge bases -> consumed by cloud_llm.py / medical_rag.py.
_KB_FILES = {
    'clinical_chemistry':   'clinical_chemistry_reference.json',
    'endocrinology':        'endocrinology_reference.json',
    'tumor_markers':        'tumor_markers_reference.json',
    'coagulation':          'coagulation_reference.json',
    'serology':             'serology_reference.json',
    'urinalysis':           'urinalysis_chemistry_reference.json',
    'body_fluid':           'body_fluid_reference.json',
    'blood_gas':            'blood_gas_reference.json',
    'semen':                'semen_analysis_reference.json',
    'microbiology_ast':     'microbiology_ast_reference.json',
    'toxicology':           'toxicology_reference.json',
    'hematology_neoplasms': 'hematology_neoplasms.json',
    'staining':             'staining_methods.json',
    'preservation':         'specimen_preservation.json',
    # vision detector maps — folded in so RAG/LLM can search their disease knowledge too
    'pbs_morphology':       'pbs_disorders.json',
    'leukaemia':            'leukemia_disorders.json',
    'helminths':            'helminths_organisms.json',
    'protozoa':             'protozoa_organisms.json',
    'blood_parasites':      'blood_parasite_organisms.json',
    'urine_sediment':       'urine_sediment_findings.json',
    'bacteriology':         'bacteriology_organisms.json',
    'mycology':             'mycology_organisms.json',
    'cytology':             'cytology_findings.json',
    'histology':            'histology_findings.json',
    'tb_cxr':               'tb_cxr_findings.json',
    'virology_rdt':         'virology_rdt_findings.json',
    'virology_cyto':        'virology_cyto_findings.json',
}
KB: dict = {topic: _load_json(f) for topic, f in _KB_FILES.items()}


def knowledge(topic: Optional[str] = None):
    """Return a curated interpretation KB (or all of them) for the LLM/RAG layer."""
    return KB.get(topic) if topic else KB


def search_kb(query: str, limit: int = 8) -> list:
    """Token-scored search across all interpretation KBs -> compact hits (topic,
    key, name, disease, significance, note), ranked by how many distinct query
    tokens each entry contains. Used to inject LLM/RAG context."""
    import re
    q = str(query or '').strip().lower()
    tokens = {t for t in re.split(r'[^a-z0-9]+', q) if len(t) > 2}
    if not tokens:
        return []
    scored = []
    for topic, data in KB.items():
        for group, entries in (data or {}).items():
            if group == '_meta' or not isinstance(entries, dict):
                continue
            for key, info in entries.items():
                if not isinstance(info, dict):
                    continue
                blob = (key + ' ' + json.dumps(info, ensure_ascii=False)).lower()
                score = sum(1 for t in tokens if t in blob)
                if score:
                    scored.append((score, {'topic': topic, 'key': key, 'name': info.get('name', key),
                                           'disease': info.get('disease') or info.get('disorders'),
                                           'significance': info.get('significance'), 'note': info.get('note')}))
    scored.sort(key=lambda x: -x[0])
    return [h for _, h in scored[:limit]]


def _range_for(key, sex):
    r = RANGES.get(key)
    if isinstance(r, dict):
        return r.get((sex or 'M').upper(), r.get('M'))
    return r


def _flag(value, low, high, clo, chi):
    if clo is not None and value <= clo: return 'CRITICAL LOW'
    if chi is not None and value >= chi: return 'CRITICAL HIGH'
    if low is not None and value < low:  return 'LOW'
    if high is not None and value > high: return 'HIGH'
    return 'NORMAL'


def interpret(results: list, sex: Optional[str] = None, age: Optional[int] = None) -> dict:
    """results: [{'test': 'hb', 'value': 8.1}, ...]. Returns flags + pattern impressions."""
    out, vals, criticals = [], {}, []
    for r in results:
        raw = str(r.get('test', '')).strip().lower().replace(' ', '_').replace('%', '_pct')
        key = ALIASES.get(raw, raw)
        try:
            value = float(r.get('value'))
        except (TypeError, ValueError):
            continue
        rng = _range_for(key, sex)
        if not rng:
            out.append({'test': raw, 'value': value, 'flag': 'UNKNOWN', 'reference': None})
            continue
        unit, low, high, clo, chi = rng
        flag = _flag(value, low, high, clo, chi)
        vals[key] = value
        ref = f'{low}-{high} {unit}'.strip()
        row = {'test': key, 'value': value, 'unit': unit, 'flag': flag, 'reference': ref}
        if flag != 'NORMAL' and NOTES.get(key):
            row['note'] = NOTES[key]
        out.append(row)
        if flag.startswith('CRITICAL'):
            criticals.append(f'{key} {value} {unit} ({flag})')

    impressions = _patterns(vals, sex)
    return {'results': out, 'impressions': impressions, 'critical': criticals,
            'requires_human_review': True}


def _patterns(v: dict, sex) -> list:
    """Derive clinical patterns from the flagged values."""
    imp = []
    hb = v.get('hb'); mcv = v.get('mcv')
    hb_low = (12.0 if (sex or 'M').upper() == 'F' else 13.0)
    if hb is not None and hb < hb_low:
        if mcv is None:      typ = ''
        elif mcv < 80:       typ = ' — microcytic (iron deficiency / thalassaemia / anaemia of chronic disease)'
        elif mcv > 100:      typ = ' — macrocytic (B12/folate deficiency, alcohol, hypothyroid)'
        else:                typ = ' — normocytic (acute blood loss, haemolysis, chronic disease, renal)'
        sev = ' SEVERE' if hb < 7 else ''
        imp.append(f'Anaemia{sev} (Hb {hb}){typ}')
    wbc = v.get('wbc')
    if wbc is not None:
        if wbc > 11:  imp.append(f'Leukocytosis (WBC {wbc}) — infection/inflammation; if very high consider leukaemia → PBS')
        elif wbc < 4: imp.append(f'Leukopenia (WBC {wbc}) — viral, marrow, drugs')
    plt = v.get('platelets')
    if plt is not None:
        if plt < 150: imp.append(f'Thrombocytopenia (PLT {plt})' + (' — bleeding risk' if plt < 50 else ''))
        elif plt > 450: imp.append(f'Thrombocytosis (PLT {plt})')
    pt = v.get('pt'); aptt = v.get('aptt')
    if pt is not None and aptt is not None:
        pt_hi, aptt_hi = pt > 14, aptt > 35
        if pt_hi and aptt_hi:   imp.append('Both PT & APTT prolonged — common pathway / liver / DIC / anticoagulant')
        elif pt_hi:             imp.append('PT prolonged (APTT normal) — extrinsic pathway (factor VII) / warfarin / early liver')
        elif aptt_hi:           imp.append('APTT prolonged (PT normal) — intrinsic pathway (VIII/IX/XI) / heparin / lupus anticoagulant')
    urea = v.get('urea'); creat = v.get('creatinine')
    if (urea and urea > 7.1) and (creat and creat > 106):
        imp.append('Raised urea + creatinine — renal impairment; check eGFR/hydration')
    glu = v.get('glucose'); a1c = v.get('hba1c')
    if (glu and glu >= 7.0) or (a1c and a1c >= 6.5):
        imp.append('Hyperglycaemia / HbA1c ≥6.5% — consistent with diabetes (confirm per criteria)')
    tsh = v.get('tsh'); ft4 = v.get('ft4')
    if tsh is not None and ft4 is not None:
        if tsh > 4.0 and ft4 < 12:   imp.append('High TSH + low FT4 — primary hypothyroidism')
        elif tsh < 0.4 and ft4 > 22: imp.append('Low TSH + high FT4 — hyperthyroidism')
    k = v.get('potassium')
    if k is not None and (k >= 6.5 or k <= 2.5):
        imp.append(f'Potassium {k} — cardiac risk, verify (haemolysis?) and act urgently')
    return imp
