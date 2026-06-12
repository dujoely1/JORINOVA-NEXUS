"""
Track 4 unlock — label clinical.jsonl with Claude-generated interpretations.

INPUT:  datasets/clinical.jsonl                (43 rows, interpretation field empty)
OUTPUT: datasets/clinical_with_interp.jsonl    (same rows + Claude's interpretation)

The output file is the training set for TRACK 4 — fine-tuning Phi-3-mini
to produce offline clinical interpretations matching Claude's quality.

USAGE:
    # one-shot
    python scripts/generate_interpretations_with_claude.py

    # dry-run on one row (no API call cost)
    python scripts/generate_interpretations_with_claude.py --dry-run

    # only label rows N..M (useful for testing)
    python scripts/generate_interpretations_with_claude.py --limit 3

SAFETY:
  - Reads ANTHROPIC_API_KEY from backend/.env (never from CLI args, never logs it).
  - Resume-safe: re-running skips rows already labelled.
  - Appends to output file row-by-row so a crash mid-run preserves work.
  - Cost cap: by default refuses to label more than 200 rows in one go.
  - DO NOT run inside a Colab notebook — Colab sees the key.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Resolve repo paths whether the script is invoked from repo root or scripts/
HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SRC  = REPO / 'datasets' / 'clinical.jsonl'
OUT  = REPO / 'datasets' / 'clinical_with_interp.jsonl'
ENV  = REPO / 'backend' / '.env'

# Default model — Haiku 4.5 is fast/cheap, plenty for short clinical paragraphs.
DEFAULT_MODEL    = 'claude-haiku-4-5-20251001'
MAX_OUTPUT_TOKS  = 220   # ~2-3 sentences max
SOFT_CAP_ROWS    = 200   # cost guardrail; raise with --no-cap
RETRY_DELAYS_S   = [2, 5, 15]   # exponential backoff for transient errors


# ─────────────────────────────────────────────────────────────────────────────
# .env loader — minimal, no extra dep required
# ─────────────────────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Prompt — concise, structured, anti-hallucination
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior consultant pathologist writing the
'Clinical Interpretation' section of a Rwandan hospital lab report.

For each request, write exactly 2–3 short sentences that:
  - State whether the panel is normal / borderline / clearly abnormal
  - If abnormal, name the most likely pattern in plain terms (e.g. "raised
    inflammatory marker", "iron-deficiency anaemia pattern", "acute kidney
    injury panel"). Only use a diagnosis word if the data clearly supports it.
  - Suggest ONE concrete next step (further test, clinical correlation,
    repeat in N days, urgent referral). Just one — not a list.

Hard rules — do not break:
  - Comment only on the values shown. Do NOT invent values you weren't given.
  - Do NOT prescribe medications.
  - Do NOT diagnose conditions that require physical examination.
  - Use SI units exactly as provided. Do not convert.
  - No headings, no bullet lists, no markdown. Plain prose only.
  - Total length: 30–60 words.
"""

def build_user_prompt(row: dict) -> str:
    dx = row.get('diagnosis') or '(no diagnosis stated)'
    results_lines = []
    for r in row.get('results', []):
        flag = r.get('flag') or 'N'
        results_lines.append(
            f"  - {r.get('test_name','?')} ({r.get('test_code','?')}): "
            f"{r.get('value','?')} {r.get('unit','')} "
            f"[flag {flag}, ref {r.get('reference','—')}]"
        )
    results_block = '\n'.join(results_lines) if results_lines else '  (no results)'
    return (
        f"Clinical indication: {dx}\n\n"
        f"Lab results:\n{results_block}\n\n"
        f"Write the 2-3 sentence clinical interpretation."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Claude call (with light retry)
# ─────────────────────────────────────────────────────────────────────────────

def call_claude(client, row: dict, model: str) -> str:
    """Call Claude with retry. Returns the interpretation text."""
    user_prompt = build_user_prompt(row)
    last_exc: Optional[Exception] = None
    for attempt, delay in enumerate([0, *RETRY_DELAYS_S]):
        if delay:
            time.sleep(delay)
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=MAX_OUTPUT_TOKS,
                system=SYSTEM_PROMPT,
                messages=[{'role': 'user', 'content': user_prompt}],
            )
            # Concatenate any text blocks in the response
            parts = []
            for block in resp.content:
                txt = getattr(block, 'text', None)
                if txt:
                    parts.append(txt)
            return (' '.join(parts)).strip()
        except Exception as e:
            last_exc = e
            print(f'    retry {attempt+1}/{len(RETRY_DELAYS_S)+1}: {type(e).__name__}: {str(e)[:80]}',
                  file=sys.stderr)
    assert last_exc is not None
    raise last_exc


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true',
                    help='process the first row only, do not write output')
    ap.add_argument('--limit',  type=int, default=0,
                    help='only label the first N un-labelled rows')
    ap.add_argument('--model',  default=DEFAULT_MODEL,
                    help=f'Claude model (default: {DEFAULT_MODEL})')
    ap.add_argument('--no-cap', action='store_true',
                    help=f'disable the {SOFT_CAP_ROWS}-row safety cap')
    args = ap.parse_args()

    # ── Inputs ──
    if not SRC.is_file():
        print(f'ERROR: input file not found: {SRC}', file=sys.stderr)
        return 2

    rows: list[dict] = []
    for line in SRC.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    print(f'Loaded {len(rows)} rows from {SRC.relative_to(REPO)}')

    # ── Resume detection ──
    done_ids: set[str] = set()
    if OUT.is_file():
        for line in OUT.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line:
                try:
                    done_ids.add(json.loads(line).get('request_id') or '')
                except json.JSONDecodeError:
                    pass
        print(f'Found {len(done_ids)} rows already labelled in {OUT.relative_to(REPO)} — will skip those.')

    pending = [r for r in rows if r.get('request_id') and r['request_id'] not in done_ids]
    if not pending:
        print('Nothing to do — all rows already labelled.')
        return 0

    if args.limit:
        pending = pending[: args.limit]
        print(f'--limit {args.limit}: will only process {len(pending)} rows this run.')

    if not args.no_cap and len(pending) > SOFT_CAP_ROWS:
        print(f'Refusing to label {len(pending)} rows (cap {SOFT_CAP_ROWS}). '
              f'Pass --no-cap or --limit N.', file=sys.stderr)
        return 3

    # ── API key from .env ──
    env = load_env(ENV)
    api_key = env.get('ANTHROPIC_API_KEY') or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print(f'ERROR: ANTHROPIC_API_KEY not found in {ENV} or environment.',
              file=sys.stderr)
        return 4

    try:
        from anthropic import Anthropic
    except ImportError:
        print('ERROR: anthropic SDK not installed. Run: pip install anthropic', file=sys.stderr)
        return 5

    client = Anthropic(api_key=api_key)

    # ── Dry-run shortcut ──
    if args.dry_run:
        sample = pending[0]
        print(f'\n[DRY-RUN] request_id={sample.get("request_id")} '
              f'pid={sample.get("patient_pid")}')
        print(f'  diagnosis: {sample.get("diagnosis","")[:90]}')
        try:
            interp = call_claude(client, sample, args.model)
        except Exception as e:
            print(f'  FAILED: {type(e).__name__}: {e}', file=sys.stderr)
            return 6
        print(f'  Claude says:\n    {interp}\n')
        print('Dry-run complete. Output file NOT written.')
        return 0

    # ── Real run ──
    print(f'\nLabelling {len(pending)} rows with {args.model} '
          f'-> {OUT.relative_to(REPO)}\n')
    ok = 0
    fail = 0
    with OUT.open('a', encoding='utf-8') as out_fp:
        for i, row in enumerate(pending, 1):
            rid = row.get('request_id')
            print(f'[{i:>3}/{len(pending)}] {rid:<10} dx="{row.get("diagnosis","")[:50]}..."',
                  end=' ')
            try:
                interp = call_claude(client, row, args.model)
            except Exception as e:
                print(f'FAIL {type(e).__name__}: {str(e)[:60]}')
                fail += 1
                continue
            row['interpretation']        = interp
            row['interp_model']          = args.model
            row['interp_generated_at']   = int(time.time())
            out_fp.write(json.dumps(row, ensure_ascii=False) + '\n')
            out_fp.flush()
            ok += 1
            words = len(interp.split())
            print(f'OK ({words} words)')

    print(f'\nDone. {ok} labelled, {fail} failed.')
    print(f'Output: {OUT.relative_to(REPO)} '
          f'(now {len(done_ids) + ok} of {len(rows)} rows total)')
    if fail:
        print('Re-run the script to retry the failed rows.')
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
