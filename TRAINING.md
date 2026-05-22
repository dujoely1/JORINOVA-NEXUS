# JORINOVA NEXUS — AI Training Runbook (Day 1)

This is the day-one training pipeline. It does NOT fine-tune model weights —
that needs GPU time you don't have today. What it DOES do, in one day:

1. Build a reusable dataset-extraction pipeline (DB → JSONL)
2. Run an eval harness with a hand-curated golden set
3. Score every Ollama worker on the same set and pick winners
4. Show you exactly where the system is wrong, by language and intent

After today, you'll know which models to fine-tune, on what data, against
what evals. That's the precondition for all later training.

## What lives where

```
backend/training/
├── extract.py             DB → JSONL (intent, lis_mapping, clinical)
├── synthetic.py           Template-driven utterance generator (en/fr/rw)
├── golden/
│   ├── intent_golden.jsonl       62 hand-curated examples
│   └── lis_mapping_golden.jsonl  10 OCR snippets w/ expected fields
├── eval_intent.py         Score the cascade (regex/local/cloud/auto)
├── eval_lis_mapping.py    Score the LIS extractors (DB-free)
└── benchmark_models.py    Per-worker Ollama leaderboard
```

## Prerequisites

```
cd backend
pip install -r requirements.txt        # one-time
# Optional but recommended for stages 3 & 4:
ollama serve                            # start Ollama daemon
ollama pull phi3:mini mistral nous-hermes llama3 tinyllama
```

If Ollama isn't running, the local/cloud/auto stages just SKIP — they don't
crash. You still get the regex baseline.

## The one-day pipeline

### Step 1 — Extract training data (5 min)

```
cd backend
python -m training.extract --out training/datasets
```

Output:
- `intent.jsonl`   — synthetic en/fr/rw utterances per intent (always works)
- `lis_mapping.jsonl` — one row per real LabRequest in the pilot DB
- `clinical.jsonl` — completed LabRequest + results (interpretation blank)

`lis_mapping` and `clinical` only produce rows if the pilot DB has records.
If it's empty, those files end up empty too — and that's the signal you
need to seed data before training those tasks.

### Step 2 — Score the current system (2 min, no Ollama needed)

```
python -m training.eval_intent --stage regex
python -m training.eval_lis_mapping --show-misses
```

The regex baseline is now **100% on the intent golden** (after the fixes
checked in today). The LIS eval shows per-field accuracy + test
precision/recall/f1.

### Step 3 — Benchmark the Ollama workers (10–30 min)

```
ollama serve   # in another terminal
python -m training.benchmark_models --out training/benchmark.json
```

Each of the five workers (fast / deep / chat / general / fallback) runs the
full intent golden. You get latency p95 + accuracy. Pick the winner per
task and update the corresponding env var:

```
# .env
OLLAMA_MODEL_CHAT=<winner>      # used by intent.classify()
OLLAMA_MODEL_FAST=<winner>      # used by structured-output tasks
```

### Step 4 — Run the full cascade (5 min)

```
python -m training.eval_intent --stage all
```

You get a leaderboard:
```
── leaderboard ────────────────────────
   auto    100.0%   (62/62)   18.4s
   regex   100.0%   (62/62)    0.0s
   local    97.0%   (60/62)    9.2s
   cloud    98.4%   (61/62)    8.1s
```

If `auto` doesn't outrank every individual stage, the cascade order is
wrong — re-tune.

### Step 5 — Grow the golden set (continuous)

Every time the system misclassifies a real user utterance, append it to
`backend/training/golden/intent_golden.jsonl` with the correct label.
The eval harness will catch regressions next time anyone changes the
matcher or the prompts.

Rule of thumb: a useful golden set has at least 100 examples per task,
covering all intent classes and all supported languages. You're at 62 now.

## What this DOES NOT do (and the next steps that would)

This toolkit is the foundation. The actual model-training steps still
ahead:

1. **Real-data labeling** — replace synthetic intent corpus with
   transcribed pilot recordings (~2000 utterances). Without this, every
   model trained on synthetic data will overfit to template phrasing.
2. **OCR fine-tune** — needs ~500–2000 scanned lab request forms with
   field bounding boxes. Tooling: Tesseract `tesstrain` + LabelStudio.
3. **Whisper-rw fine-tune** — needs ~10–50h labeled Kinyarwanda audio.
   Tooling: HuggingFace `transformers` + a GPU.
4. **Local LLM LoRA fine-tune** — needs the labeled intent/LIS data
   above + GPU. Tooling: `unsloth` or `peft`, ~4–8h per epoch on a 24GB
   GPU. Output is an Ollama-importable Modelfile.

Each of those is a multi-week workstream. None of them are blockers for
running the system — the off-the-shelf models + the cascade are good
enough to pilot. They're how you get from "works in demo" to "reliable
in clinic."

## Commands cheat-sheet

| Command | Purpose | Needs Ollama |
|---|---|---|
| `python -m training.extract` | DB → JSONL | No (skips empty tasks) |
| `python -m training.synthetic` | Print synthetic intent corpus | No |
| `python -m training.eval_intent --stage regex` | Baseline accuracy | No |
| `python -m training.eval_intent --stage all` | Full cascade leaderboard | Yes (for local/cloud) |
| `python -m training.eval_lis_mapping --show-misses` | LIS extractor scoreboard | No |
| `python -m training.benchmark_models` | Per-worker model leaderboard | Yes |
| `python -m training.benchmark_models --model phi3:mini` | One model only | Yes |
