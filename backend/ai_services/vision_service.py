"""
ALIS-X Vision Service
=====================
Asynchronous image analysis for laboratory microscopy and smear images.

Processing strategy:
  - All image tasks are QUEUED (never block the request thread)
  - Offline: lightweight rule-based descriptors + basic CV
  - Online: optional cloud vision via Claude's vision API
  - Human review is always required — AI is decision support only

Supported image types:
  - blood_smear   : RBC/WBC morphology, parasite detection
  - slide         : histology / cytology preliminary description
  - gel           : electrophoresis bands (HbA1c, protein)
  - microscopy    : gram stain, AFB stain, culture plate
  - xray_cxr      : TB screening (CXR) — cloud preferred
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from pathlib import Path
from typing import Optional

from ai_services.schemas import VisionResult, VisionTask

logger = logging.getLogger('vision_service')

# ── In-memory task tracker (replace with Redis in production) ─────────────────

_task_store: dict[str, VisionResult] = {}   # task_id → VisionResult


def _task_id() -> str:
    return str(uuid.uuid4())[:12]


# ── Offline descriptors (no AI, no network) ───────────────────────────────────
# Rule-based image quality and basic feature checks.
# These run synchronously before any AI queue.

def _basic_image_check(file_path: str) -> dict:
    """
    Validate image file and extract basic metadata.
    Returns dict with is_valid, width, height, format, file_size_kb.
    """
    result = {'is_valid': False, 'error': ''}
    path = Path(file_path)
    if not path.exists():
        result['error'] = f'File not found: {file_path}'
        return result
    if path.stat().st_size < 1024:   # < 1 KB = likely empty/corrupt
        result['error'] = 'File too small — may be corrupt'
        return result
    result['file_size_kb'] = round(path.stat().st_size / 1024, 1)
    try:
        from PIL import Image
        with Image.open(file_path) as img:
            result.update({
                'is_valid': True,
                'width':    img.width,
                'height':   img.height,
                'format':   img.format or 'unknown',
                'mode':     img.mode,
            })
    except ImportError:
        # Pillow not installed — skip validation, proceed anyway
        result['is_valid'] = True
        result['note']     = 'Pillow not installed — skipping image validation'
    except Exception as e:
        result['error'] = f'Image read error: {e}'
    return result


def _offline_blood_smear_rules(file_path: str) -> dict:
    """
    Attempt lightweight offline blood smear analysis.
    Uses basic colour histogram analysis (no ML model required).
    Returns preliminary findings or empty if Pillow not available.
    """
    findings: list[str] = []
    confidence = 0.0

    try:
        import numpy as np
        from PIL import Image

        with Image.open(file_path) as img:
            img_rgb = img.convert('RGB')
            arr = np.array(img_rgb, dtype=np.float32)

        # Very basic colour statistics
        mean_r, mean_g, mean_b = arr[:,:,0].mean(), arr[:,:,1].mean(), arr[:,:,2].mean()

        # Rough heuristics for Giemsa-stained smear
        if mean_r > 180 and mean_b < 120:
            findings.append('Predominantly eosinophilic staining pattern — may indicate RBC-dominant smear')
        if mean_b > mean_r and mean_b > 140:
            findings.append('Basophilic staining present — possible nucleated cells or platelet clumping area')

        # Colour variance (rough cellularity proxy)
        variance = arr.var()
        if variance < 500:
            findings.append('Low image variance — smear may be too thin or image quality poor')
        elif variance > 4000:
            findings.append('High image variance — dense cellular area detected')

        confidence = 0.3 if findings else 0.1
        findings.append('⚠ Offline analysis only — quantitative morphology requires manual microscopy review')

    except Exception as e:
        logger.debug('Offline smear analysis: %s', e)
        findings = ['Offline image analysis unavailable — manual review required']

    return {'findings': findings, 'confidence': confidence, 'layer': 'offline_cv'}


# ── Cloud vision analysis ─────────────────────────────────────────────────────

async def _cloud_vision_analysis(
    image_type: str,
    file_path:  str,
    context:    str = '',
) -> dict:
    """
    Send image to Claude vision API for advanced analysis.
    Returns empty if cloud unavailable — never raises.
    """
    # Gate on the key being present — NOT on cloud_llm.is_available(), whose 3s
    # network probe caches a transient failure for 60s and would wrongly skip
    # Claude on a cold instance. The Claude call below fails gracefully (returns
    # an 'error' dict) if the network is genuinely down, so trying is safe.
    from ai_services.cloud_llm import is_configured
    if not is_configured():
        return {'error': 'Cloud vision unavailable — ANTHROPIC_API_KEY not set', 'layer': 'cloud_skipped'}

    path = Path(file_path)
    if not path.exists():
        return {'error': f'Image file not found: {file_path}'}

    try:
        import base64
        import anthropic
        from core.config import get_settings
        s = get_settings()

        with open(file_path, 'rb') as f:
            img_data = base64.standard_b64encode(f.read()).decode()

        suffix_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                      '.png': 'image/png', '.webp': 'image/webp'}
        media_type = suffix_map.get(path.suffix.lower(), 'image/jpeg')

        # Shared JSON tail — every prompt carries a calibrated confidence + a
        # suggested follow-up test (which the reflex-test workflow can pick up).
        _tail = (
            '\nAlso include: "confidence" (0.0-1.0, calibrated certainty), '
            '"suggested_followup" (single next test/action a clinician should consider, or ""), '
            '"critical" (true if urgent notification is warranted), '
            '"requires_human_review" (always true). '
            'Return ONLY the JSON object — no prose, no markdown fences.'
        )
        prompts = {
            'blood_smear': (
                'This is a Giemsa-stained peripheral blood smear. Report RBC morphology '
                '(size/shape/colour/inclusions), WBC types and abnormalities, platelet estimate, '
                'and any parasites (malaria species + stage, trypanosomes, microfilariae).\n'
                'JSON keys: "rbc_morphology","wbc_observations","parasites_seen"(bool),'
                '"parasite_description","platelet_comment","overall_impression".' + _tail
            ),
            'parasitology': (
                'This is a stained stool/blood parasitology preparation. Identify ova, cysts, '
                'larvae, trophozoites, or blood parasites; name the organism and stage if visible.\n'
                'JSON keys: "organisms_seen"(list),"positivity"(bool),"stage","impression".' + _tail
            ),
            'gram_stain': (
                'This is a Gram-stained microbiology smear. Report Gram reaction, morphology '
                '(cocci/bacilli, arrangement), yeast, pus cells, and quantity.\n'
                'JSON keys: "gram_reaction","morphology","yeast_seen"(bool),"pus_cells","quantity","impression".' + _tail
            ),
            'afb': (
                'This is a Ziehl-Neelsen (AFB) smear screening for M. tuberculosis. Report acid-fast '
                'bacilli presence and semi-quantitative grade (Neg, Scanty, 1+, 2+, 3+).\n'
                'JSON keys: "afb_seen"(bool),"grade","impression".' + _tail
            ),
            'koh': (
                'This is a KOH wet mount for fungal elements (hyphae, pseudohyphae, budding yeast, spores).\n'
                'JSON keys: "fungal_elements_seen"(bool),"description","impression".' + _tail
            ),
            'urine_microscopy': (
                'This is a urine sediment microscopy field. Report RBCs, WBCs/pus cells, epithelial '
                'cells, casts, crystals, bacteria, and yeast per HPF.\n'
                'JSON keys: "rbc","wbc","casts"(list),"crystals"(list),"bacteria","impression".' + _tail
            ),
            'slide': (
                'This is a histology/cytology slide from anatomic pathology.\n'
                f'Context: {context or "no additional context"}\n'
                'Describe cellular pattern, architecture, staining, and features suggesting malignancy.\n'
                'JSON keys: "pattern","cellularity","notable_findings"(list),"malignancy_flag"(bool),"impression".' + _tail
            ),
            'xray_cxr': (
                'This is a chest X-ray from a TB screening program. Screen for cavitation, '
                'consolidation, infiltrates, effusion, lymphadenopathy, miliary pattern.\n'
                'JSON keys: "findings"(list),"tb_features_present"(bool),"tb_likelihood"'
                '("low|medium|high"),"other_findings"(list),"recommendation".' + _tail
            ),
            'microscopy': (
                'This is a laboratory microscopy image.\n'
                f'Image context: {context or image_type}\n'
                'Describe observable features relevant to laboratory diagnosis.\n'
                'JSON keys: "observations"(list),"key_findings"(list),'
                '"quality_assessment"("adequate|inadequate|poor"),"impression".' + _tail
            ),
        }

        prompt_text = prompts.get(image_type, prompts['microscopy'])
        system_prompt = (
            'You are a laboratory image-interpretation assistant for a hospital lab in Rwanda. '
            'You provide DECISION SUPPORT ONLY — never an autonomous diagnosis; a qualified '
            'scientist or pathologist always validates. Report only what is visible, state '
            'uncertainty honestly, flag anything critical, and if image quality is inadequate to '
            'interpret, say so rather than guessing.'
        )

        client = anthropic.AsyncAnthropic(api_key=s.anthropic_api_key)
        t0 = time.time()
        msg = await client.messages.create(
            model=getattr(s, 'vision_model', None) or s.claude_model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': img_data}},
                    {'type': 'text', 'text': prompt_text},
                ],
            }],
        )
        raw = msg.content[0].text.strip() if msg.content else ''
        # Strip markdown code fences if the model wrapped the JSON.
        if raw.startswith('```'):
            raw = raw.split('```', 2)[1] if raw.count('```') >= 2 else raw
            if raw.lstrip().lower().startswith('json'):
                raw = raw.lstrip()[4:]
            raw = raw.strip('`').strip()
        import json
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            result = {'raw_text': raw[:500]}
        result['layer']      = 'cloud_vision'
        result['latency_ms'] = int((time.time()-t0)*1000)
        result['requires_human_review'] = True
        return result

    except Exception as e:
        logger.error('Cloud vision error: %s', e)
        return {'error': str(e), 'layer': 'cloud_vision_failed'}


# ── Local trained vision models (YOLOv8) — generic registry ───────────────────
# Any weights at backend/models/<key>/<key>.pt auto-load by the image_type below.
# Train a new one with ml/ (see ml/TRAINING_ROADMAP.md), drop the .pt in, done —
# no code change. Falls back to Claude vision when weights/ultralytics absent.

# image_type (from the frontend) -> model key (folder + <key>.pt filename)
_MODEL_REGISTRY = {
    'blood_smear': 'malaria', 'smear': 'malaria', 'malaria': 'malaria',
    'parasitology': 'parasitology', 'stool': 'parasitology', 'ova': 'parasitology',
    'urine_parasite': 'parasitology',
    'pbs': 'pbs', 'peripheral_blood_smear': 'pbs',
    'leukemia': 'leukemia', 'blast': 'leukemia',
    'anemia': 'anemia', 'rbc_morphology': 'anemia',
    'trypanosoma': 'trypanosoma', 'leishmania': 'leishmania', 'microfilaria': 'microfilaria',
    'gram_stain': 'gram', 'afb': 'tb_afb', 'tb_smear': 'tb_afb',
    'fungi': 'fungi', 'koh': 'fungi',
    'cytology': 'cytology', 'histology': 'histology', 'cancer': 'cancer',
    'urine_microscopy': 'urine',
}
_MALARIA_STAGES = ('ring', 'trophozoite', 'schizont', 'gametocyte')
_MODEL_CACHE: dict = {}   # model_key -> loaded YOLO | None
_MAP_CACHE: dict = {}   # json filename -> flattened {class-or-alias -> info}


def _load_disorder_map(filename: str, groups: tuple) -> dict:
    """Load + flatten (with `aka` aliases) a morphology/organism -> info JSON from
    ai_services/<filename>. Cached; returns {} if missing/bad. Used to attach
    related disorders/diseases to detected classes (PBS, parasitology, ...)."""
    if filename not in _MAP_CACHE:
        flat: dict = {}
        try:
            import json
            data = json.loads((Path(__file__).resolve().parent / filename).read_text(encoding='utf-8'))
            for group in groups:
                for cls, info in (data.get(group) or {}).items():
                    flat[cls] = info
                    for alias in (info.get('aka') or []):
                        flat.setdefault(alias, info)
        except Exception as e:
            logger.debug('map %s load skipped: %s', filename, e)
        _MAP_CACHE[filename] = flat
    return _MAP_CACHE[filename]


def _model_key(image_type: str) -> str:
    return _MODEL_REGISTRY.get(image_type, image_type)


def _model_path(key: str):
    p = Path(__file__).resolve().parents[1] / 'models' / key / f'{key}.pt'
    return p if p.exists() else None


def _load_model(key: str):
    if key in _MODEL_CACHE:
        return _MODEL_CACHE[key]
    mp = _model_path(key)
    if not mp:
        _MODEL_CACHE[key] = None
        return None
    try:
        from ultralytics import YOLO
        _MODEL_CACHE[key] = YOLO(str(mp))
    except Exception as e:
        logger.debug('load model %s skipped: %s', key, e)
        _MODEL_CACHE[key] = None
    return _MODEL_CACHE[key]


def _local_detect(image_type: str, file_path: str) -> Optional[dict]:
    """Run the trained detector for this image_type. None if no weights/ultralytics."""
    key = _model_key(image_type)
    model = _load_model(key)
    if model is None:
        return None
    try:
        res = model.predict(file_path, verbose=False, conf=0.25)[0]
        names = res.names
        counts, boxes = {}, []
        for b in res.boxes:
            cls = names.get(int(b.cls), str(int(b.cls)))
            counts[cls] = counts.get(cls, 0) + 1
            boxes.append({'class': cls, 'confidence': round(float(b.conf), 3),
                          'xyxy': [round(float(v), 1) for v in b.xyxy[0].tolist()]})
        total = sum(counts.values())
        summary = ', '.join(f'{v} {k}' for k, v in sorted(counts.items(), key=lambda x: -x[1]))
        findings = [f'{key} detector: {summary}'] if total else \
                   [f'{key} detector: nothing detected — confirm on manual reading']
        result = {
            'layer': f'local_{key}', 'model': f'{key}.pt', 'class_counts': counts,
            'detections': boxes[:200], 'findings': findings,
            'confidence': 0.8 if total else 0.55, 'requires_human_review': True,
        }
        # malaria-specific enrichment: stage counts + parasitaemia estimate
        if key == 'malaria':
            stages = {k: counts[k] for k in _MALARIA_STAGES if k in counts}
            rbc = counts.get('red_blood_cell', 0)
            parasites = sum(stages.values())
            result.update({'stage_counts': stages, 'parasite_count': parasites,
                           'rbc_count': rbc, 'positive': parasites > 0})
            if rbc:
                result['parasitaemia_pct'] = round(parasites / rbc * 100, 2)
            if parasites:
                f = 'Malaria parasites: ' + ', '.join(f'{v} {k}' for k, v in stages.items())
                if 'parasitaemia_pct' in result:
                    f += f' (~{result["parasitaemia_pct"]}% parasitaemia)'
                result['findings'] = [f]
        # Haematology morphology enrichment (PBS + leukaemia): map each detected
        # abnormal cell to its related disorders + a critical flag.
        _MORPH = {
            'pbs':      ('pbs_disorders.json',      ('normal', 'abnormal', 'artifact'),  'PBS morphology'),
            'leukemia': ('leukemia_disorders.json', ('normal', 'malignant'), 'Leukaemia'),
        }
        if key in _MORPH:
            fname, groups, label = _MORPH[key]
            dmap = _load_disorder_map(fname, groups)
            def _norm(name: str) -> str:
                return str(name).lower().replace(' ', '_').replace('-', '_')
            abnormal, related, criticals = {}, [], []
            for cls, n in counts.items():
                info = dmap.get(cls) or dmap.get(_norm(cls))
                if not info or info.get('significance', 'normal') == 'normal':
                    continue
                abnormal[cls] = n
                entry = {'finding': info.get('name', cls), 'count': n,
                         'significance': info.get('significance'),
                         'disorders': info.get('disorders', [])}
                if info.get('note'):
                    entry['note'] = info['note']
                related.append(entry)
                if info.get('significance') == 'critical':
                    criticals.append(info.get('name', cls))
            result.update({'abnormal_counts': abnormal, 'related_disorders': related,
                           'critical': bool(criticals)})
            if related:
                related.sort(key=lambda e: 0 if e['significance'] == 'critical' else 1)
                lines = [f'{e["count"]}x {e["finding"]} -> {", ".join(e["disorders"][:3])}' for e in related]
                result['findings'] = [label + ': ' + '; '.join(lines)]
                result['confidence'] = 0.8
            if criticals:
                result['findings'].insert(0, 'CRITICAL: ' + ', '.join(criticals) + ' - urgent haematology review')
        # Organism/finding enrichment: map each detected organism/finding to its disease.
        # Shared by parasitology (ova/cysts), stool protozoa, blood parasites (filariae)
        # and urine sediment — every map uses the same {name, aka, disease, significance,
        # note} schema under an 'organisms' or 'findings' group.
        _ORGMAP = {
            'parasitology':   ('parasitology_organisms.json',   'Parasitology',   'no ova/parasites detected - confirm on manual O&P'),
            'protozoa':       ('protozoa_organisms.json',       'Stool protozoa', 'no protozoa detected - confirm on manual O&P (wet prep / trichrome)'),
            'microfilaria':   ('blood_parasite_organisms.json', 'Blood parasites','no blood parasites detected - confirm on thick/thin film'),
            'urine_sediment': ('urine_sediment_findings.json',  'Urine sediment', 'no significant sediment - confirm on manual microscopy'),
            'bacteriology':   ('bacteriology_organisms.json',   'Bacteriology',   'no organisms seen - confirm on culture'),
            'mycology':       ('mycology_organisms.json',       'Mycology',       'no fungal elements seen - confirm on culture'),
            'cytology':       ('cytology_findings.json',        'Cytology',       'no abnormal cells - screening only, cytopathologist reviews'),
            'histology':      ('histology_findings.json',       'Histology',      'no malignancy identified - pathologist reviews'),
            'tb_cxr':         ('tb_cxr_findings.json',          'TB chest X-ray', 'no significant CXR finding - radiologist reviews'),
        }
        if key in _ORGMAP:
            omfile, olabel, oempty = _ORGMAP[key]
            omap = _load_disorder_map(omfile, ('organisms', 'findings'))
            def _norm(name: str) -> str:
                return str(name).lower().replace(' ', '_').replace('-', '_')
            organisms, criticals = [], []
            for cls, n in counts.items():
                info = omap.get(cls) or omap.get(_norm(cls))
                if not info:
                    organisms.append({'organism': cls, 'count': n})
                    continue
                entry = {'organism': info.get('name', cls), 'count': n,
                         'disease': info.get('disease', ''),
                         'significance': info.get('significance', 'significant')}
                if info.get('note'):
                    entry['note'] = info['note']
                organisms.append(entry)
                if info.get('significance') == 'critical':
                    criticals.append(info.get('name', cls))
            result.update({'organisms_seen': organisms, 'positive': bool(organisms),
                           'critical': bool(criticals)})
            if organisms:
                lines = [f'{o["count"]}x {o["organism"]}' + (f' -> {o["disease"]}' if o.get('disease') else '')
                         for o in organisms]
                result['findings'] = [olabel + ': ' + '; '.join(lines)]
                result['confidence'] = 0.8
            else:
                result['findings'] = [olabel + ' detector: ' + oempty]
            if criticals:
                result['findings'].insert(0, 'NOTE: ' + ', '.join(criticals) + ' - clinically important, verify + treat')
        return result
    except Exception as e:
        logger.debug('local detect (%s) skipped: %s', key, e)
        return None


def available_local_models() -> list:
    """Which trained model keys are present on disk (for /health and diagnostics)."""
    root = Path(__file__).resolve().parents[1] / 'models'
    keys = sorted(set(_MODEL_REGISTRY.values()))
    return [k for k in keys if (root / k / f'{k}.pt').exists()]


# ── Public API ────────────────────────────────────────────────────────────────

async def submit_image_task(task: VisionTask) -> str:
    """
    Submit image for analysis. Returns task_id immediately.
    Processing happens asynchronously in background.
    """
    task_id = task.task_id or _task_id()

    # Initial pending result
    _task_store[task_id] = VisionResult(
        task_id=task_id,
        findings=['Analysis queued — processing in background'],
        confidence=0.0,
        layer_used='pending',
        requires_review=True,
    )

    # Validate image first (synchronous, fast)
    check = _basic_image_check(task.file_path)
    if not check.get('is_valid'):
        _task_store[task_id] = VisionResult(
            task_id=task_id,
            findings=[f'Image validation failed: {check.get("error", "unknown")}'],
            confidence=0.0,
            layer_used='validation',
            requires_review=True,
            raw_output=check,
        )
        return task_id

    # Schedule background processing
    asyncio.create_task(_process_image_task(task_id, task))
    return task_id


async def _process_image_task(task_id: str, task: VisionTask) -> None:
    """Background coroutine: offline analysis first, then optionally cloud."""
    try:
        # Step 1: offline analysis
        if task.image_type in ('blood_smear', 'smear'):
            offline_result = _offline_blood_smear_rules(task.file_path)
        else:
            offline_result = {
                'findings':   ['Offline analysis: visual inspection recommended'],
                'confidence': 0.1,
                'layer':      'offline_rules',
            }

        findings   = offline_result.get('findings', [])
        confidence = offline_result.get('confidence', 0.1)
        layer      = 'offline'

        # Step 1b: any locally-trained detector for this image_type. Auto-loads
        # backend/models/<key>/<key>.pt via _MODEL_REGISTRY and takes priority.
        local_result = _local_detect(task.image_type, task.file_path) or {}
        if local_result.get('findings'):
            findings   = local_result['findings']
            confidence = local_result.get('confidence', 0.75)
            layer      = local_result.get('layer', 'local_model')

        # Step 2: cloud vision (narrative interpretation; also the fallback when
        # no local model is present).
        cloud_result = {}
        from ai_services.cloud_llm import is_configured
        if is_configured():
            cloud_result = await _cloud_vision_analysis(task.image_type, task.file_path)
            if not cloud_result.get('error'):
                cloud_findings = cloud_result.get('findings', []) or cloud_result.get('observations', [])
                if cloud_findings and not layer.startswith('local_'):
                    findings   = cloud_findings
                    confidence = 0.65
                    layer      = 'cloud_vision'

        _task_store[task_id] = VisionResult(
            task_id=task_id,
            findings=findings,
            confidence=confidence,
            layer_used=layer,
            requires_review=True,   # always — AI is decision support
            raw_output={**offline_result, **local_result, **cloud_result},
        )
        logger.info('Vision task %s complete (layer=%s)', task_id, layer)

    except Exception as e:
        logger.error('Vision task %s failed: %s', task_id, e)
        _task_store[task_id] = VisionResult(
            task_id=task_id,
            findings=['Analysis failed — manual review required'],
            confidence=0.0,
            layer_used='error',
            requires_review=True,
            raw_output={'error': str(e)},
        )


def get_task_result(task_id: str) -> Optional[VisionResult]:
    """Poll for vision task result. Returns None if unknown task_id."""
    return _task_store.get(task_id)


def clear_completed_tasks(older_than_hours: int = 24) -> int:
    """Housekeeping — remove old completed tasks from in-memory store."""
    # Simple implementation: clear all (in production use Redis TTL)
    count = len(_task_store)
    _task_store.clear()
    return count


def health_status() -> dict:
    pillow_ok = False
    try:
        from PIL import Image   # noqa: F401
        pillow_ok = True
    except ImportError:
        pass
    return {
        'pillow_installed': pillow_ok,
        'queued_tasks':     len(_task_store),
        'local_models':     available_local_models(),
        'cloud_vision':     'available when cloud LLM is connected',
        'offline_capable':  True,
    }
