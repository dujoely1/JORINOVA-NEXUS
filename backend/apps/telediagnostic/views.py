"""TeleDiagnostic views — Remote field diagnostic module"""
import json
import uuid
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from django.utils import timezone
from django.conf import settings


# In-memory session store (replace with Redis/DB in production)
_SESSIONS = {}


@login_required
def manager_dashboard(request):
    """Lab Manager: deploy sessions, monitor field devices, review captures."""
    return render(request, 'telediagnostic.html', {
        'page_title': '📡 TeleDiagnostic — ALIS-X',
        'today': timezone.now().date(),
        'user': request.user,
    })


@login_required
def field_view(request, session_code):
    """Field staff: camera interface + AI test capture."""
    session = _SESSIONS.get(session_code)
    return render(request, 'telediagnostic_field.html', {
        'page_title': '📡 TeleDiag Field — ALIS-X',
        'session_code': session_code,
        'session': session,
        'user': request.user,
        'ws_url': f"ws://{request.get_host()}/ws/telediag/{session_code}/",
    })


# ─── API endpoints ────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_create_session(request):
    """Lab Manager creates a field deployment session."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    session_code = str(uuid.uuid4())[:8].upper()
    session = {
        'code':        session_code,
        'created_by':  request.user.get_full_name(),
        'created_at':  timezone.now().isoformat(),
        'location':    data.get('location', 'Field'),
        'purpose':     data.get('purpose', 'General'),
        'staff_ids':   data.get('staff_ids', []),
        'expires_at':  (timezone.now() + timezone.timedelta(hours=int(data.get('duration_hours', 8)))).isoformat(),
        'status':      'active',
        'devices':     [],
        'captures':    [],
    }
    _SESSIONS[session_code] = session
    field_url = f"/telediagnostic/field/{session_code}/"
    return JsonResponse({
        'session_code': session_code,
        'field_url':    field_url,
        'expires_at':   session['expires_at'],
    })


@login_required
def api_list_sessions(request):
    """List active deployment sessions."""
    sessions = [
        {k: v for k, v in s.items() if k != 'captures'}
        for s in _SESSIONS.values()
        if s['status'] == 'active'
    ]
    return JsonResponse({'sessions': sessions})


@login_required
def api_session_detail(request, session_code):
    """Full session detail including captures and AI results."""
    session = _SESSIONS.get(session_code)
    if not session:
        return JsonResponse({'error': 'Session not found'}, status=404)
    return JsonResponse({'session': session})


@login_required
@require_http_methods(['POST'])
def api_submit_capture(request):
    """Field device submits a captured image + test metadata for AI interpretation."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    session_code = data.get('session_code', '')
    image_data   = data.get('image', '')          # base64 JPEG
    test_type    = data.get('test_type', 'photo') # ast|api_20e|rdt_malaria|rdt_covid|wound|patient|id
    patient_id   = data.get('patient_id', '')
    notes        = data.get('notes', '')

    if not image_data:
        return JsonResponse({'error': 'No image provided'}, status=400)

    capture_id = str(uuid.uuid4())[:12].upper()
    ai_result  = _interpret_test(test_type, image_data, patient_id)

    capture = {
        'id':          capture_id,
        'test_type':   test_type,
        'patient_id':  patient_id,
        'notes':       notes,
        'captured_at': timezone.now().isoformat(),
        'captured_by': request.user.get_full_name(),
        'ai_result':   ai_result,
        'image_size':  len(image_data),
    }

    if session_code in _SESSIONS:
        _SESSIONS[session_code]['captures'].append(capture)

    return JsonResponse({
        'capture_id': capture_id,
        'ai_result':  ai_result,
        'status':     'processed',
    })


@login_required
@require_http_methods(['POST'])
def api_trigger_camera(request):
    """Lab manager triggers camera on a remote device via WebSocket broadcast."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    session_code = data.get('session_code', '')
    device_id    = data.get('device_id', '')
    command      = data.get('command', 'capture')  # capture|stream_start|stream_stop

    # Send via Channels layer
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'telediag_{session_code}',
            {
                'type':      'camera_command',
                'command':   command,
                'device_id': device_id,
                'sender':    request.user.get_full_name(),
                'timestamp': timezone.now().isoformat(),
            }
        )
        return JsonResponse({'sent': True, 'command': command})
    except Exception as e:
        return JsonResponse({'sent': False, 'error': str(e)}, status=500)


@login_required
@require_http_methods(['POST'])
def api_close_session(request, session_code):
    """Close a field session."""
    if session_code in _SESSIONS:
        _SESSIONS[session_code]['status'] = 'closed'
        _SESSIONS[session_code]['closed_at'] = timezone.now().isoformat()
    return JsonResponse({'closed': True})


# ─── AI Test Interpretation (demo — production calls AI microservice) ─────────

_TEST_PROFILES = {
    'ast': {
        'name': 'AST Strip / Color Reaction',
        'description': 'Aspartate Aminotransferase colorimetric interpretation',
    },
    'api_20e': {
        'name': 'API 20E — Gram-negative Enterobacteriaceae',
        'description': 'bioMérieux API 20E bacterial identification strip',
    },
    'api_20ne': {
        'name': 'API 20NE — Non-Enterobacteriaceae',
        'description': 'bioMérieux API 20 NE bacterial identification strip',
    },
    'rdt_malaria': {
        'name': 'Malaria RDT',
        'description': 'Rapid Diagnostic Test for Plasmodium species',
    },
    'rdt_covid': {
        'name': 'COVID-19 Ag RDT',
        'description': 'SARS-CoV-2 Antigen Rapid Test',
    },
    'rdt_hiv': {
        'name': 'HIV RDT',
        'description': 'HIV 1/2 Antibody Rapid Test',
    },
    'wound': {
        'name': 'Wound Assessment',
        'description': 'AI-assisted wound classification and severity',
    },
    'patient': {
        'name': 'Patient Photo',
        'description': 'Clinical photography — demographic and visible condition',
    },
    'gram_stain': {
        'name': 'Gram Stain Slide',
        'description': 'Gram stain microscopy interpretation',
    },
    'photo': {
        'name': 'General Photo',
        'description': 'General clinical or documentation photo',
    },
}


def _interpret_test(test_type, image_data, patient_id):
    """
    Demo AI interpreter — production sends image to AI microservice.
    Returns structured interpretation result.
    """
    import random
    rng = random.Random(len(image_data) % 997)  # deterministic per image size

    if test_type == 'ast':
        level = rng.randint(12, 180)
        flag  = 'NORMAL' if level < 40 else ('ELEVATED' if level < 120 else 'CRITICALLY HIGH')
        color = '#00E676' if flag == 'NORMAL' else ('#FFD600' if flag == 'ELEVATED' else '#FF1744')
        return {
            'test':       'Aspartate Aminotransferase (AST)',
            'result':     f'{level} U/L',
            'flag':       flag,
            'flag_color': color,
            'reference':  '10–40 U/L',
            'interpretation': f'AST level {level} U/L — {flag}. '
                + ('Within normal limits.' if flag == 'NORMAL'
                   else 'Elevated AST may indicate liver injury, myocardial damage, or intense physical activity. Correlate with ALT, GGT, and clinical findings.'
                   if flag == 'ELEVATED'
                   else 'Critically elevated — immediate hepatic or cardiac evaluation required.'),
            'confidence': f'{rng.randint(88, 97)}%',
            'method':     'Colorimetric AI color-band analysis (NEXUS Vision v2.1)',
        }

    elif test_type == 'api_20e':
        organisms = [
            ('Escherichia coli',      '5144572', 99.9),
            ('Klebsiella pneumoniae', '5213773', 98.4),
            ('Salmonella typhi',      '4304553', 97.1),
            ('Enterobacter cloacae',  '3305573', 95.6),
            ('Proteus mirabilis',     '0672232', 94.2),
        ]
        pick = organisms[rng.randint(0, len(organisms) - 1)]
        wells = [rng.choice([0, 1]) for _ in range(20)]
        profile_str = ''.join(str(w) for w in wells)
        return {
            'test':        'API 20E — Gram-negative Identification',
            'organism':    pick[0],
            'api_profile': pick[1],
            'raw_wells':   profile_str,
            'wells':       wells,
            'confidence':  f'{pick[2]}%',
            'biotype':     rng.randint(1, 8),
            'interpretation': f'Identified as {pick[0]} — API profile {pick[1]} (confidence {pick[2]}%). '
                'Confirm antibiotic susceptibility testing. Check resistance markers.',
            'susceptibility_note': 'Recommend: ampicillin, TMP-SMX, fluoroquinolone, carbapenem panel.',
            'method': 'NEXUS API-Vision pattern recognition + NCBI database matching',
        }

    elif test_type == 'api_20ne':
        organisms_ne = [
            ('Pseudomonas aeruginosa', '1156004', 99.2),
            ('Acinetobacter baumannii','1404004', 97.8),
            ('Burkholderia cepacia',   '0756004', 94.1),
        ]
        pick = organisms_ne[rng.randint(0, 2)]
        wells = [rng.choice([0, 1]) for _ in range(20)]
        return {
            'test':        'API 20NE — Non-Enterobacteriaceae',
            'organism':    pick[0],
            'api_profile': pick[1],
            'wells':       wells,
            'confidence':  f'{pick[2]}%',
            'interpretation': f'Identified as {pick[0]} — profile {pick[1]} ({pick[2]}% confidence). '
                'Non-fermentative Gram-negative bacillus. High risk of multidrug resistance.',
            'method': 'NEXUS API-Vision + VITEK2 cross-reference',
        }

    elif test_type == 'rdt_malaria':
        results = [
            {'result': 'POSITIVE', 'species': 'Plasmodium falciparum', 'lines': 'C+T1', 'color': '#FF1744'},
            {'result': 'POSITIVE', 'species': 'Plasmodium vivax',      'lines': 'C+T2', 'color': '#FF6D00'},
            {'result': 'NEGATIVE', 'species': None,                    'lines': 'C only','color': '#00E676'},
        ]
        r = results[rng.randint(0, 2)]
        return {
            'test':   'Malaria RDT (HRP2/pLDH)',
            'result': r['result'],
            'flag_color': r['flag_color'] if 'flag_color' in r else r['color'],
            'species': r['species'],
            'lines_visible': r['lines'],
            'interpretation': (
                f"MALARIA POSITIVE — {r['species']} detected. Initiate ACT (Artemether-Lumefantrine) as per national guidelines. "
                "Report to District Health Officer."
            ) if r['result'] == 'POSITIVE' else
            'Malaria RDT NEGATIVE — no Plasmodium antigen detected. Consider thick/thin blood smear if clinical suspicion remains.',
            'confidence': f'{rng.randint(91,98)}%',
            'method': 'Band intensity analysis — NEXUS Vision',
        }

    elif test_type == 'rdt_covid':
        positive = rng.random() < 0.25
        return {
            'test':   'SARS-CoV-2 Antigen RDT',
            'result': 'POSITIVE' if positive else 'NEGATIVE',
            'flag_color': '#FF1744' if positive else '#00E676',
            'lines_visible': 'C+T' if positive else 'C only',
            'interpretation': (
                'COVID-19 Ag POSITIVE — Isolate patient, initiate contact tracing. Report to MINISANTE within 24 hours.'
            ) if positive else 'COVID-19 Ag NEGATIVE — antigen not detected. Consider PCR if high clinical suspicion.',
            'confidence': f'{rng.randint(89,96)}%',
            'method': 'NEXUS Vision band detection',
        }

    elif test_type == 'wound':
        severity = rng.choice(['Grade I', 'Grade II', 'Grade III', 'Grade IV'])
        types    = ['Laceration', 'Puncture', 'Abrasion', 'Burn', 'Infected wound', 'Surgical wound']
        wound_t  = rng.choice(types)
        infection= rng.random() < 0.4
        color    = {'Grade I':'#00E676','Grade II':'#FFD600','Grade III':'#FF6D00','Grade IV':'#FF1744'}[severity]
        return {
            'test':       'Wound Assessment AI',
            'wound_type': wound_t,
            'severity':   severity,
            'flag_color': color,
            'infection_signs': infection,
            'dimensions_est': f'{rng.randint(1,8)}×{rng.randint(1,5)} cm (estimated)',
            'interpretation': (
                f'{wound_t} — {severity}. '
                + ('Signs of infection detected: erythema, possible exudate. Antibiotic therapy recommended. Clean and redress daily. '
                   if infection else 'No obvious infection signs. Clean wound. Standard dressing protocol. ')
                + f'Estimated size {rng.randint(1,8)}×{rng.randint(1,5)} cm.'
            ),
            'recommended_action': (
                'Systemic antibiotics + wound culture' if infection and severity in ['Grade III','Grade IV']
                else 'Topical antiseptic + redress' if infection
                else 'Standard care'
            ),
            'confidence': f'{rng.randint(82,94)}%',
            'method': 'NEXUS WoundAI — CNN wound classification model',
        }

    elif test_type == 'gram_stain':
        findings = [
            ('Gram-positive cocci in clusters', 'Staphylococcus sp. suspected', '#FF6D00'),
            ('Gram-positive cocci in chains',   'Streptococcus sp. suspected',  '#FF6D00'),
            ('Gram-negative rods',              'Enterobacteriaceae or non-fermenter', '#00AAFF'),
            ('Gram-positive rods',              'Bacillus or Clostridium sp.',   '#FFD600'),
            ('Mixed flora',                     'Polymicrobial — confirm culture', '#A78BFA'),
        ]
        f = findings[rng.randint(0, 4)]
        return {
            'test':   'Gram Stain Microscopy',
            'morphology': f[0],
            'interpretation': f'{f[0]} — {f[1]}. Perform culture and sensitivity. '
                'Field diagnosis: initiate empiric therapy per clinical picture.',
            'flag_color': f[2],
            'cell_density': rng.choice(['Rare', 'Moderate (+)', 'Abundant (++)', 'Heavy (+++)']),
            'wbc_present': rng.choice([True, False]),
            'confidence': f'{rng.randint(78,92)}%',
            'method': 'NEXUS MicroVision — Gram stain CNN classifier',
        }

    else:  # general photo / patient
        return {
            'test':   'Clinical Photography',
            'result': 'Photo captured and logged',
            'flag_color': '#00AAFF',
            'interpretation': 'Image captured and stored in patient record. '
                'For diagnostic test interpretation, select a specific test type (AST, API 20E, RDT, Wound, Gram Stain).',
            'confidence': 'N/A',
            'method': 'NEXUS TeleDiag — clinical photography',
        }
