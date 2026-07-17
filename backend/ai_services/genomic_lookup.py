"""
Genomic variant lookup — automatic classification from public databases.
========================================================================
Given a gene + variant (HGVS c./p.) or an rsID, query **NCBI ClinVar**
(E-utilities, keyless) for the germline clinical significance + condition, and
fall back to the **Claude LLM** (ACMG-style reasoning) when ClinVar has no
record. Manual entry stays available in the MedGenome UI either way.

Privacy: only the gene symbol + variant notation leave the system — never
patient identifiers. Decision support only; a molecular pathologist validates.
"""
from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger('genomic_lookup')

EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

# ClinVar germline classification text -> our short code (matches the MedGenome UI).
# Order matters: "conflicting"/"uncertain" must be checked BEFORE bare "pathogenic"
# because "Conflicting classifications of pathogenicity" contains "pathogenic".
_CLS_MAP = [
    ('conflicting',                  'vus'),
    ('uncertain significance',       'vus'),
    ('pathogenic/likely pathogenic', 'likely_pathogenic'),
    ('likely pathogenic',            'likely_pathogenic'),
    ('benign/likely benign',         'benign'),
    ('likely benign',                'benign'),
    ('pathogenic',                   'pathogenic'),
    ('benign',                       'benign'),
]


def _to_code(desc: str) -> str:
    d = (desc or '').strip().lower()
    for needle, code in _CLS_MAP:
        if needle in d:
            return code
    return 'vus'


async def _clinvar(gene: str, variant: str, rsid: Optional[str]) -> Optional[dict]:
    """Query ClinVar via E-utilities (esearch -> esummary). None if no record."""
    import httpx
    term = rsid.strip() if rsid else f'{gene}[gene] AND {variant}'.strip()
    async with httpx.AsyncClient(timeout=12) as cx:
        es = await cx.get(f'{EUTILS}/esearch.fcgi',
                          params={'db': 'clinvar', 'retmode': 'json', 'term': term, 'retmax': '5'})
        es.raise_for_status()
        ids = (es.json().get('esearchresult') or {}).get('idlist') or []
        if not ids:
            return None
        su = await cx.get(f'{EUTILS}/esummary.fcgi',
                          params={'db': 'clinvar', 'retmode': 'json', 'id': ','.join(ids)})
        su.raise_for_status()
        res = su.json().get('result') or {}

    for uid in res.get('uids', []):
        rec = res.get(uid) or {}
        # newer summaries use germline_classification; older ones clinical_significance
        gc = rec.get('germline_classification') or rec.get('clinical_significance') or {}
        desc = gc.get('description') if isinstance(gc, dict) else str(gc)
        if not desc:
            continue
        review = (gc.get('review_status') if isinstance(gc, dict) else '') or ''
        traits = []
        ts = (gc.get('trait_set') if isinstance(gc, dict) else None) or rec.get('trait_set') or []
        for t in ts:
            nm = (t or {}).get('trait_name')
            if nm and nm.lower() not in ('not provided', 'not specified'):
                traits.append(nm)
        cond = ', '.join(dict.fromkeys(traits)) or 'condition not specified'
        title = rec.get('title', '')
        interp = f'ClinVar: {desc} for {cond}.'
        if review:
            interp += f' Review status: {review}.'
        if title:
            interp += f' [{title}]'
        return {
            'classification': _to_code(desc),
            'interpretation': interp,
            'source': 'ClinVar (NCBI)',
            'clinvar_significance': desc,
            'condition': cond,
            'review_status': review,
            'found': True,
        }
    return None


async def _llm(gene: str, variant: str) -> Optional[dict]:
    """Claude ACMG-style interpretation when ClinVar has no record."""
    from ai_services import cloud_llm
    if not cloud_llm.is_configured():
        return None
    prompt = (
        'You are a clinical molecular geneticist. Classify this germline variant using '
        'ACMG/AMP criteria.\n'
        f'Gene: {gene}\nVariant: {variant or "(not specified)"}\n'
        'Return ONLY a JSON object: {"classification": one of '
        '"pathogenic" | "likely_pathogenic" | "vus" | "benign", '
        '"interpretation": "2-3 sentences: the associated condition, the mechanism, and a '
        'clinical note"}. If the evidence is insufficient, use "vus" and say so. '
        'No markdown, no text outside the JSON.'
    )
    resp = await cloud_llm.generate(prompt, max_tokens=400, temperature=0.0)
    if resp.error or not resp.content:
        return None
    import json, re
    m = re.search(r'\{.*\}', resp.content.strip(), re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except Exception:
        return None
    code = str(data.get('classification', 'vus')).lower().replace(' ', '_')
    if code not in ('pathogenic', 'likely_pathogenic', 'vus', 'benign'):
        code = 'vus'
    return {
        'classification': code,
        'interpretation': (data.get('interpretation') or '').strip() or 'No interpretation available.',
        'source': 'AI (Claude, ACMG-style) — no ClinVar record; verify before reporting',
        'found': False,
    }


async def lookup_variant(gene: str, variant: str = '', rsid: str = '') -> dict:
    """Automatic variant classification: ClinVar first, Claude LLM fallback."""
    gene = (gene or '').strip()
    variant = (variant or '').strip()
    rsid = (rsid or '').strip()
    if not gene and not rsid:
        return {'error': 'gene or rsID is required'}

    try:
        cv = await _clinvar(gene, variant, rsid)
        if cv:
            return cv
    except Exception as e:
        logger.warning('ClinVar lookup failed (%s %s): %s', gene, variant, e)

    try:
        ai = await _llm(gene, variant)
        if ai:
            return ai
    except Exception as e:
        logger.warning('LLM variant fallback failed: %s', e)

    return {
        'classification': 'vus',
        'interpretation': (f'No ClinVar record found for {gene} {variant}. '
                           'Classify manually per ACMG with your laboratory evidence.'),
        'source': 'none (manual review required)',
        'found': False,
    }
