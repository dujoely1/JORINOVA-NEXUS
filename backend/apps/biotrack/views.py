"""
NexusCare BioTrack — Cyber-Physical Healthcare Logistics Intelligence
GeoTrack · Drone · Robot · Field Surveillance · Biosafety
ISO 15189 Decision Support System ONLY
"""
import json, random, hashlib, math
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from django.utils import timezone


@login_required
def dashboard(request):
    return render(request, 'biotrack.html', {
        'page_title': '🌐 BioTrack — ALIS-X',
        'today':      timezone.now().date(),
    })


def _rng(seed):
    return random.Random(hashlib.md5(str(seed).encode()).hexdigest()[:8])


ISO_DISCLAIMER = 'BioTrack is a Decision Support System. All transport, handling, and biosafety decisions require human authorization.'


# ─── API: GeoTrack Intelligence ───────────────────────────────────────────────

@login_required
def api_geotrack(request):
    """GeoTrack epidemiological risk assessment for a patient origin."""
    district  = request.GET.get('district', 'Kigali')
    province  = request.GET.get('province', 'Kigali City')
    sample_id = request.GET.get('sample_id', '')

    rng = _rng(district + province)

    # Rwanda district risk map (demo)
    HIGH_RISK_ZONES = ['Rusizi', 'Rubavu', 'Nyamasheke', 'Karongi']  # Western Province (DRC border)
    MEDIUM_RISK_ZONES = ['Musanze', 'Burera', 'Nyagatare', 'Kirehe']

    if district in HIGH_RISK_ZONES:
        risk_level = 'HIGH'
        risk_color = '#FF6D00'
        alerts = [
            f'⚠️ {district} is in a HIGH epidemiological risk zone',
            'Border proximity — elevated Ebola / VHF surveillance recommended',
            'Enhanced biosafety precautions required for all samples',
        ]
    elif district in MEDIUM_RISK_ZONES:
        risk_level = 'MODERATE'
        risk_color = '#FFD600'
        alerts = [f'Sample from {district} — moderate epidemiological risk. Standard precautions.']
    else:
        risk_level = 'LOW'
        risk_color = '#00E676'
        alerts = [f'District {district} — no current active outbreak signals detected.']

    active_outbreaks = []
    if rng.random() > 0.7:
        active_outbreaks = [
            {'disease': 'Malaria', 'status': 'ENDEMIC', 'cases_7d': rng.randint(5, 30), 'trend': 'STABLE'},
        ]
    if district in HIGH_RISK_ZONES and rng.random() > 0.6:
        active_outbreaks.append({'disease': 'Mpox', 'status': 'WATCH', 'cases_7d': rng.randint(1, 5), 'trend': 'RISING'})

    return JsonResponse({
        'module':                  'GEOTRACK',
        'district':                district,
        'province':                province,
        'risk_level':              risk_level,
        'risk_color':              risk_color,
        'status':                  'NORMAL' if risk_level == 'LOW' else 'WARNING' if risk_level == 'MODERATE' else 'CRITICAL',
        'alerts':                  alerts,
        'active_outbreaks':        active_outbreaks,
        'bsl_awareness':           'BSL-2' if risk_level in ['LOW', 'MODERATE'] else 'BSL-3 AWARENESS',
        'epidemiological_context': f'Origin: {district}, {province}. Risk: {risk_level}. Active diseases: {len(active_outbreaks)} under surveillance.',
        'coordinates':             {'lat': -1.9403 + rng.uniform(-0.3, 0.3), 'lng': 29.8739 + rng.uniform(-0.5, 0.5)},
        'iso_disclaimer':          ISO_DISCLAIMER,
        'timestamp':               timezone.now().isoformat(),
    })


# ─── API: Drone Intelligence ──────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_drone_assessment(request):
    """
    Evaluates biological sample suitability for drone transport.
    Computes Sample Integrity Score (SIS: 0-100).
    NEVER authorizes flight — only recommends.
    """
    try:
        data = json.loads(request.body)
        sample_type      = data.get('sample_type', 'blood')
        temp_sensitive   = data.get('temperature_sensitive', True)
        fragility        = data.get('fragility', 'medium')          # low|medium|high
        transport_delay  = int(data.get('transport_delay_min', 30)) # minutes
        origin_risk      = data.get('origin_risk', 'LOW')
        weather_ok       = data.get('weather_ok', True)
        distance_km      = float(data.get('distance_km', 15))
        containment_class= data.get('containment_class', 'CAT_B')  # CAT_A|CAT_B
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    rng = _rng(sample_type + str(transport_delay))

    # Compute SIS (Sample Integrity Score)
    sis = 100.0
    factors = []

    if temp_sensitive and transport_delay > 30:
        sis -= min(25, transport_delay * 0.5)
        factors.append({'factor': 'Temperature sensitivity', 'deduction': -min(25, transport_delay*0.5), 'note': f'Delay {transport_delay}min — cold chain risk'})

    if fragility == 'high':
        sis -= 20
        factors.append({'factor': 'High fragility', 'deduction': -20, 'note': 'Vibration risk during flight'})
    elif fragility == 'medium':
        sis -= 8
        factors.append({'factor': 'Medium fragility', 'deduction': -8, 'note': 'Standard drone packaging acceptable'})

    if not weather_ok:
        sis -= 30
        factors.append({'factor': 'Adverse weather', 'deduction': -30, 'note': 'Rain/wind may compromise transport'})

    if origin_risk in ['HIGH', 'CRITICAL']:
        sis -= 15
        factors.append({'factor': 'High-risk origin zone', 'deduction': -15, 'note': 'Epidemiological risk — enhanced containment required'})

    if containment_class == 'CAT_A':
        sis -= 25
        factors.append({'factor': 'CAT A dangerous goods', 'deduction': -25, 'note': 'CAT A requires special aviation authorization'})

    if distance_km > 50:
        sis -= 10
        factors.append({'factor': 'Long distance', 'deduction': -10, 'note': f'{distance_km}km — battery + ETA risk'})

    sis = max(0, round(sis))

    # Compute Transport Risk Level
    if sis >= 75 and weather_ok and containment_class == 'CAT_B':
        transport_risk = 'LOW'
        recommendation = 'DRONE'
        rec_color = '#00E676'
        rec_emoji = '🚁'
        rec_note  = 'Sample integrity adequate for drone transport. Standard CAT-B packaging.'
    elif sis >= 50 and weather_ok:
        transport_risk = 'MODERATE'
        recommendation = 'DRONE_WITH_PRECAUTIONS'
        rec_color = '#FFD600'
        rec_emoji = '⚠️'
        rec_note  = 'Drone transport possible with enhanced packaging and priority routing.'
    elif not weather_ok or containment_class == 'CAT_A':
        transport_risk = 'HIGH'
        recommendation = 'HUMAN_COURIER'
        rec_color = '#FF1744'
        rec_emoji = '🚑'
        rec_note  = 'Conditions unfavorable for drone. Human courier with BSL transport kit required.'
    else:
        transport_risk = 'MODERATE'
        recommendation = 'ROBOT_INTERNAL'
        rec_color = '#FF6D00'
        rec_emoji = '🤖'
        rec_note  = 'Low SIS — internal robot handling only. Do not dispatch externally until sample stabilized.'

    eta_minutes = round(distance_km / 80 * 60 + 5)  # ~80km/h drone

    return JsonResponse({
        'module':                'DRONE',
        'status':                'NORMAL' if sis >= 75 else 'WARNING' if sis >= 50 else 'CRITICAL',
        'sample_type':           sample_type,
        'sis_score':             sis,
        'sis_label':             'EXCELLENT' if sis >= 85 else 'GOOD' if sis >= 70 else 'FAIR' if sis >= 50 else 'POOR',
        'transport_risk':        transport_risk,
        'risk_color':            rec_color,
        'recommendation':        recommendation,
        'recommendation_emoji':  rec_emoji,
        'recommendation_note':   rec_note,
        'sis_factors':           factors,
        'estimated_eta_min':     eta_minutes,
        'distance_km':           distance_km,
        'containment_class':     containment_class,
        'packaging_requirement': 'Triple containment + absorbent + CAT-B label' if containment_class == 'CAT_B' else 'CAT-A UN2814 packaging — specialist required',
        'flight_authorization':  'REQUIRES HUMAN APPROVAL — system does not authorize flight autonomously',
        'epidemiological_context': f'Origin risk: {origin_risk}. Transport risk: {transport_risk}.',
        'safety_note':           rec_note,
        'iso_disclaimer':        ISO_DISCLAIMER,
        'timestamp':             timezone.now().isoformat(),
    })


# ─── API: Robot Handling ──────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_robot_routing(request):
    """
    AI suggests safe sample sorting + handling sequence for lab robotics.
    Does NOT physically control robots.
    """
    try:
        data = json.loads(request.body)
        samples = data.get('samples', [])
        if not samples:
            samples = [
                {'id': 'SMP-001', 'type': 'blood', 'risk': 'LOW',  'test': 'CBC'},
                {'id': 'SMP-002', 'type': 'sputum','risk': 'HIGH', 'test': 'ZN/TB'},
                {'id': 'SMP-003', 'type': 'csf',   'risk': 'HIGH', 'test': 'Gram+Culture'},
                {'id': 'SMP-004', 'type': 'blood', 'risk': 'LOW',  'test': 'Chemistry'},
                {'id': 'SMP-005', 'type': 'stool', 'risk': 'MEDIUM','test': 'Parasitology'},
            ]
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    # Sort samples: HIGH risk first (isolation), then MEDIUM, then LOW
    priority_order = {'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
    sorted_samples = sorted(samples, key=lambda s: priority_order.get(s.get('risk', 'LOW'), 3))

    routing_plan = []
    contamination_risks = []

    for i, s in enumerate(sorted_samples):
        risk = s.get('risk', 'LOW')
        stype = s.get('type', 'blood')

        if risk == 'HIGH' or stype in ['sputum', 'csf']:
            lane = 'ISOLATION_LANE'
            handling = 'Sealed transport to BSL-2 cabinet. Robot arm — Class II BSC.'
            if stype == 'sputum':
                contamination_risks.append({'sample': s['id'], 'risk': 'Aerosol generation — TB risk', 'action': 'Sealed centrifuge only'})
        elif stype in ['stool', 'wound_swab']:
            lane = 'ENTERIC_LANE'
            handling = 'Enteric safety lane. Gloves + eye protection mandatory.'
        else:
            lane = 'ROUTINE_LANE'
            handling = 'Standard BSL-2 handling. Routine processing queue.'

        routing_plan.append({
            'sample_id':  s.get('id', f'SMP-{i+1:03d}'),
            'sample_type':stype,
            'risk_level': risk,
            'priority':   i + 1,
            'lane':       lane,
            'handling_instruction': handling,
            'centrifuge_required':  stype in ['blood', 'urine', 'csf'],
            'bsc_required':         risk == 'HIGH' or stype == 'sputum',
        })

    return JsonResponse({
        'module':              'ROBOT',
        'status':              'WARNING' if any(s.get('risk') == 'HIGH' for s in samples) else 'NORMAL',
        'risk_level':          'HIGH' if any(s.get('risk') == 'HIGH' for s in samples) else 'MODERATE',
        'routing_plan':        routing_plan,
        'contamination_risks': contamination_risks,
        'high_risk_count':     sum(1 for s in samples if s.get('risk') == 'HIGH'),
        'isolation_required':  any(s.get('risk') == 'HIGH' for s in samples),
        'transport_recommendation': 'Robot-assisted isolation handling for HIGH-risk samples. Human confirmation required.',
        'safety_note':         'ROBOT SYSTEM DOES NOT EXECUTE WITHOUT HUMAN CONFIRMATION.',
        'iso_disclaimer':      ISO_DISCLAIMER,
        'timestamp':           timezone.now().isoformat(),
    })


# ─── API: Field Surveillance ──────────────────────────────────────────────────

@login_required
def api_field_surveillance(request):
    """
    Analyzes field data signals for early outbreak warning.
    DOES NOT declare official public health emergency.
    """
    rng = _rng(timezone.now().strftime('%Y%m%d%H'))

    # Simulated cluster analysis
    clusters = []
    if rng.random() > 0.5:
        clusters.append({
            'disease': 'Malaria',
            'district': 'Nyagatare',
            'cases_7d': rng.randint(12, 45),
            'positivity_rate': round(rng.uniform(18, 42), 1),
            'trend': 'RISING',
            'signal_strength': 'MODERATE',
            'color': '#FF6D00',
            'action': 'Enhanced surveillance + rapid response team advisory',
        })
    if rng.random() > 0.75:
        clusters.append({
            'disease': 'Acute Watery Diarrhea (AWD)',
            'district': 'Kirehe',
            'cases_7d': rng.randint(8, 20),
            'positivity_rate': round(rng.uniform(12, 28), 1),
            'trend': 'STABLE',
            'signal_strength': 'LOW',
            'color': '#FFD600',
            'action': 'Water source investigation recommended',
        })

    early_warnings = []
    if any(c['trend'] == 'RISING' for c in clusters):
        early_warnings.append({'warning': 'Positivity rate trending upward in ≥1 district', 'severity': 'MODERATE', 'color': '#FF6D00'})
    early_warnings.append({'warning': 'Routine surveillance active — no PHEIC signals detected', 'severity': 'INFO', 'color': '#00AAFF'})

    return JsonResponse({
        'module':              'FIELD_SURVEILLANCE',
        'status':              'WARNING' if clusters else 'NORMAL',
        'risk_level':          'MODERATE' if clusters else 'LOW',
        'insight':             f'{len(clusters)} active cluster(s) under enhanced surveillance.',
        'active_clusters':     clusters,
        'early_warnings':      early_warnings,
        'positivity_trend':    'STABLE',
        'data_sources_active': ['RHMIS national DB', 'Lab results feed', 'CHW network', 'Sentinel sites'],
        'last_update':         timezone.now().isoformat(),
        'official_declaration':'NO — This is an AI early warning signal only. Official outbreak declaration requires WHO/MINISANTE authority.',
        'epidemiological_context': f'Field surveillance covering {rng.randint(25, 30)} districts. {len(clusters)} signals above threshold.',
        'transport_recommendation': 'No special transport restrictions. Standard sample routing applies.',
        'safety_note':         ISO_DISCLAIMER,
        'iso_disclaimer':      ISO_DISCLAIMER,
        'timestamp':           timezone.now().isoformat(),
    })


# ─── API: Integrated ISIS/ERAVS Score ────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_integrated_score(request):
    """
    Computes ISIS (Integrated Sample Integrity Score) +
    ERAVS (Epidemiological Risk-Adjusted Validity Score).
    """
    try:
        data = json.loads(request.body)
        sis         = float(data.get('sis', 85))
        geo_risk    = data.get('geo_risk', 'LOW')       # LOW|MODERATE|HIGH|CRITICAL
        transport_h = float(data.get('transport_hours', 1))
        temp_breach = data.get('temperature_breach', False)
        lab_handling= data.get('lab_handling_quality', 'STANDARD')
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    # ERAVS computation
    risk_multipliers = {'LOW': 1.0, 'MODERATE': 0.92, 'HIGH': 0.82, 'CRITICAL': 0.68}
    eravs = sis * risk_multipliers.get(geo_risk, 1.0)
    if transport_h > 4:    eravs *= 0.9
    if temp_breach:        eravs *= 0.75
    if lab_handling == 'POOR': eravs *= 0.85
    eravs = round(max(0, eravs))

    isis = round((sis * 0.6 + eravs * 0.4))

    return JsonResponse({
        'sis':   sis,
        'eravs': eravs,
        'isis':  isis,
        'isis_label': 'OPTIMAL' if isis >= 85 else 'ACCEPTABLE' if isis >= 65 else 'MARGINAL' if isis >= 45 else 'UNACCEPTABLE',
        'isis_color': '#00E676' if isis >= 85 else '#FFD600' if isis >= 65 else '#FF6D00' if isis >= 45 else '#FF1744',
        'validity_assessment': (
            'Sample is valid for all tests. Full diagnostic workup recommended.' if isis >= 85 else
            'Sample valid with caveats. Document transport conditions in report.' if isis >= 65 else
            'Sample validity marginal. Recollection recommended if clinical urgency permits.' if isis >= 45 else
            'Sample integrity unacceptable. REJECT and recollect. Document reason for rejection.'
        ),
        'rejection_recommended': isis < 45,
        'iso_disclaimer': ISO_DISCLAIMER,
        'timestamp': timezone.now().isoformat(),
    })
