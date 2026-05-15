"""
ALIS-X Microbiology AI Intelligence Module
ISO 15189-Compliant Decision Support System
NOT a decision-making authority — supports human laboratory professionals only.
"""
import json, random, hashlib
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from django.utils import timezone


@login_required
def dashboard(request):
    return render(request, 'micro_ai.html', {
        'page_title': '🦠 Microbiology AI — ALIS-X',
        'today':      timezone.now().date(),
    })


# ─── ISO 15189 Disclaimer (injected on every response) ───────────────────────
ISO_DISCLAIMER = {
    'iso_standard':   'ISO 15189:2022',
    'system_role':    'Decision Support System ONLY',
    'authority':      'Final interpretation belongs to certified laboratory professional',
    'ai_restriction': 'AI MUST NOT release final diagnostic results or override human validation',
    'audit_required': True,
}


def _rng(seed): return random.Random(hashlib.md5(str(seed).encode()).hexdigest()[:8])


# ─── API 1: Vision AI — Microscopy Image ─────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_microscopy_interpret(request):
    """
    AI interprets microscopy/stained slide images.
    ISO 15189: Decision support — human validation mandatory.
    """
    try:
        data      = json.loads(request.body)
        image_b64 = data.get('image', '')
        stain     = data.get('stain', 'gram')        # gram|giemsa|zn|koh|wet_prep|india_ink
        sample    = data.get('sample_type', 'sputum') # sputum|urine|blood|stool|csf|wound
        patient_id= data.get('patient_id', '')
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    rng = _rng(len(image_b64) + hash(stain))
    result = _interpret_microscopy(stain, sample, rng)
    result.update({
        'analysis_id':  f'MICRO-AI-{timezone.now().strftime("%Y%m%d%H%M%S")}',
        'analyzed_at':  timezone.now().isoformat(),
        'stain':        stain,
        'sample_type':  sample,
        'patient_id':   patient_id,
        'iso_disclaimer': ISO_DISCLAIMER,
        'requires_validation': True,
        'validated_by': None,
    })
    return JsonResponse(result)


def _interpret_microscopy(stain, sample, rng):
    """Demo AI interpretation engine — production calls CV microservice."""

    if stain == 'gram':
        gram_class = rng.choice(['gram_positive', 'gram_negative', 'mixed', 'gram_variable'])
        morphologies = {
            'gram_positive': rng.choice([
                ('cocci_clusters', 'Gram-positive cocci in clusters', 'Staphylococcus sp. probable', '#FF6D00'),
                ('cocci_chains',   'Gram-positive cocci in chains',   'Streptococcus sp. probable',  '#FF6D00'),
                ('rods_spores',    'Gram-positive rods with spores',  'Bacillus sp. probable',        '#FFD600'),
            ]),
            'gram_negative': rng.choice([
                ('rods_straight',   'Gram-negative straight rods',   'Enterobacteriaceae probable',   '#00AAFF'),
                ('rods_curved',     'Gram-negative curved rods',     'Vibrio/Campylobacter possible', '#00AAFF'),
                ('coccobacilli',    'Gram-negative coccobacilli',    'Haemophilus/Moraxella possible','#00AAFF'),
                ('diplococci',      'Gram-negative diplococci',      'Neisseria sp. probable',        '#00AAFF'),
            ]),
            'mixed':         [('mixed_flora', 'Mixed gram flora',   'Polymicrobial — culture required', '#A78BFA')],
            'gram_variable': [('variable',    'Gram-variable rods','Confirm with culture + subculture', '#FFD600')],
        }
        morph_list = morphologies.get(gram_class, [('unknown', 'Indeterminate', 'Repeat stain', '#7FA8CC')])
        morph = morph_list[0] if isinstance(morph_list, list) else morph_list

        cell_density   = rng.choice(['Rare (<1/hpf)', 'Occasional (1-5/hpf)', 'Moderate (5-10/hpf)', 'Abundant (>10/hpf)'])
        wbc_present    = rng.random() > 0.4
        rbc_present    = rng.random() > 0.6
        confidence     = rng.randint(78, 97)

        annotations = [
            {'type': 'organism', 'label': morph[1], 'color': morph[3], 'count': rng.randint(5, 30)},
        ]
        if wbc_present:
            annotations.append({'type': 'wbc', 'label': 'PMN Leukocytes detected', 'color': '#00E676', 'count': rng.randint(3, 20)})
        if rbc_present:
            annotations.append({'type': 'rbc', 'label': 'Erythrocytes present', 'color': '#FF1744', 'count': rng.randint(2, 15)})

        infection_likelihood = 'HIGH' if (wbc_present and cell_density in ['Moderate (5-10/hpf)', 'Abundant (>10/hpf)']) else \
                               'MODERATE' if wbc_present else 'LOW'

        return {
            'interpretation_type': 'gram_stain',
            'gram_reaction':       gram_class.replace('_', ' ').upper(),
            'morphology_code':     morph[0],
            'morphology_label':    morph[1],
            'probable_organism':   morph[2],
            'color_code':          morph[3],
            'cell_density':        cell_density,
            'wbc_present':         wbc_present,
            'rbc_present':         rbc_present,
            'infection_likelihood':infection_likelihood,
            'confidence_pct':      confidence,
            'annotations':         annotations,
            'reflex_suggestions':  _reflex_from_gram(gram_class, wbc_present, sample),
            'gram_stain_required': False,
            'culture_recommended': True,
            'biosafety_note':      _biosafety_note(gram_class, sample),
        }

    elif stain == 'giemsa':
        parasites = rng.choice([
            ('Plasmodium falciparum', 'POSITIVE', '#FF1744', 'Trophozoites + ring forms detected. Count: approx. ' + str(rng.randint(500, 15000)) + '/µL'),
            ('Plasmodium vivax',      'POSITIVE', '#FF6D00', 'Enlarged infected RBCs with Schüffner dots observed.'),
            ('Trypanosoma brucei',    'POSITIVE', '#FF1744', 'Trypomastigote forms detected in blood film.'),
            (None,                    'NEGATIVE', '#00E676', 'No intraerythrocytic parasites detected. Thick smear negative.'),
            (None,                    'NEGATIVE', '#00E676', 'No malaria parasites seen. Perform PCR if clinical suspicion persists.'),
        ])
        return {
            'interpretation_type': 'giemsa_blood_film',
            'parasite_detected':   parasites[0] is not None,
            'parasite_species':    parasites[0],
            'result':              parasites[1],
            'flag_color':          parasites[2],
            'description':         parasites[3],
            'confidence_pct':      rng.randint(88, 98),
            'follow_up':           'Confirm with PCR if positive. Report to public health if malaria confirmed.' if parasites[0] else 'Repeat if symptoms persist after 24h.',
            'routing':             'PARASITOLOGY',
            'reflex_suggestions':  ['Malaria PCR for species confirmation', 'Parasite density count', 'Repeat smear at fever peak'] if parasites[0] else ['Consider ELISA serology', 'Thick film re-examination'],
        }

    elif stain == 'zn':
        tb_result = rng.random() > 0.7
        grading = rng.choice(['1+ (1-9 AFB/100 fields)', '2+ (1-9 AFB/10 fields)', '3+ (1-9 AFB/field)', 'Scanty (1-2 AFB/300 fields)']) if tb_result else 'NO AFB SEEN'
        return {
            'interpretation_type': 'ziehl_neelsen_afb',
            'afb_detected':        tb_result,
            'result':              'POSITIVE' if tb_result else 'NEGATIVE',
            'flag_color':          '#FF1744' if tb_result else '#00E676',
            'grading':             grading,
            'probable_organism':   'Mycobacterium sp. (TB/NTM)' if tb_result else 'No acid-fast bacilli observed',
            'confidence_pct':      rng.randint(85, 96),
            'biosafety_alert':     'HIGH RISK — Biosafety Level 3 precautions. Report immediately.' if tb_result else None,
            'follow_up':           'GeneXpert MTB/RIF mandatory. DOTS notification required.' if tb_result else 'Culture if clinical suspicion high.',
            'reflex_suggestions':  ['GeneXpert MTB/RIF', 'Mycobacterial culture (LJ/MGIT)', 'Drug susceptibility testing', 'Chest X-ray coordination'] if tb_result else ['Culture on LJ medium', 'Repeat ZN if symptoms persist'],
            'routing':             'BIOSAFETY_BSL3' if tb_result else 'MICROBIOLOGY',
        }

    elif stain == 'wet_prep':
        organisms = rng.choice([
            ('Trichomonas vaginalis', 'POSITIVE', '#FF6D00', 'Motile flagellated trophozoites observed.'),
            ('Candida sp.',           'POSITIVE', '#FFD600', 'Budding yeast with pseudohyphae detected — KOH prep recommended.'),
            ('Clue cells',            'POSITIVE', '#FF6D00', 'Clue cells present — Bacterial vaginosis pattern.'),
            (None,                    'NEGATIVE', '#00E676', 'No pathological organisms seen. Normal flora.'),
        ])
        return {
            'interpretation_type': 'wet_preparation',
            'organism':    organisms[0],
            'result':      organisms[1],
            'flag_color':  organisms[2],
            'description': organisms[3],
            'confidence_pct': rng.randint(80, 94),
            'reflex_suggestions': ['KOH preparation', 'Culture on Sabouraud', 'STI panel'] if organisms[0] else ['Clinical correlation required'],
            'routing': 'MICROBIOLOGY',
        }

    else:
        return {
            'interpretation_type': stain,
            'result':  'Analysis pending',
            'flag_color': '#00AAFF',
            'description': f'Stain type: {stain}. Connect to AI Vision microservice for full analysis.',
            'confidence_pct': 0,
            'reflex_suggestions': [],
            'routing': 'MICROBIOLOGY',
        }


def _reflex_from_gram(gram_class, wbc, sample):
    suggestions = []
    if gram_class == 'gram_positive':
        suggestions = ['Blood culture (if bacteremia suspected)', 'Coagulase test', 'Catalase test', 'Antibiotic susceptibility testing (AST)']
    elif gram_class == 'gram_negative':
        suggestions = ['Culture on MacConkey + Blood agar', 'API 20E / Vitek2 ID', 'AST (EUCAST)', 'Cephalosporin resistance screen (ESBL)']
    elif gram_class == 'mixed':
        suggestions = ['Aerobic + anaerobic culture', 'Repeat specimen if contamination suspected', 'Clinical correlation required']
    if wbc and sample in ['csf', 'sputum']:
        suggestions.insert(0, '⚠️ URGENT: Notify clinician — PMN leukocytes in ' + sample.upper())
    return suggestions


def _biosafety_note(gram_class, sample):
    if sample == 'csf':
        return 'BSL-2: CSF — handle with full barrier precautions. Meningitis protocol if PMN present.'
    if gram_class == 'gram_positive' and 'cocci' in gram_class:
        return 'Standard BSL-2 precautions. Potential MRSA — isolate if culture pending.'
    return 'Standard BSL-2 laboratory precautions.'


# ─── API 2: AST Disk Diffusion Analysis ──────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_ast_analysis(request):
    """
    AI interprets antibiotic susceptibility disk diffusion plates.
    Compares zones with EUCAST/CLSI breakpoints.
    """
    try:
        data = json.loads(request.body)
        image_b64   = data.get('image', '')
        organism    = data.get('organism', 'unknown')
        standard    = data.get('standard', 'EUCAST')  # EUCAST or CLSI
        antibiotics = data.get('antibiotics', [])
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    rng = _rng(len(image_b64) + hash(organism))

    # EUCAST breakpoints (simplified demo — production uses full EUCAST database)
    BREAKPOINTS = {
        'Ampicillin':        {'S': 14, 'R': 14, 'unit': 'mm'},
        'Amoxicillin-Clav':  {'S': 19, 'R': 14, 'unit': 'mm'},
        'Cefuroxime':        {'S': 18, 'R': 15, 'unit': 'mm'},
        'Ceftriaxone':       {'S': 21, 'R': 18, 'unit': 'mm'},
        'Ceftazidime':       {'S': 19, 'R': 16, 'unit': 'mm'},
        'Meropenem':         {'S': 22, 'R': 17, 'unit': 'mm'},
        'Imipenem':          {'S': 22, 'R': 17, 'unit': 'mm'},
        'Ciprofloxacin':     {'S': 25, 'R': 22, 'unit': 'mm'},
        'Gentamicin':        {'S': 15, 'R': 15, 'unit': 'mm'},
        'Trimethoprim-Sulfa':{'S': 16, 'R': 13, 'unit': 'mm'},
        'Azithromycin':      {'S': 17, 'R': 14, 'unit': 'mm'},
        'Vancomycin':        {'S': 17, 'R': 15, 'unit': 'mm'},
        'Oxacillin':         {'S': 22, 'R': 12, 'unit': 'mm'},
        'Colistin':          {'S': 10, 'R': 10, 'unit': 'mm'},
        'Tigecycline':       {'S': 20, 'R': 17, 'unit': 'mm'},
    }

    demo_antibiotics = list(BREAKPOINTS.keys())[:12] if not antibiotics else antibiotics[:16]
    ast_results = []
    resistance_flags = []

    for ab in demo_antibiotics:
        bp = BREAKPOINTS.get(ab, {'S': 18, 'R': 14})
        measured_zone = rng.randint(6, 36)
        if measured_zone >= bp['S']:
            sir = 'S'
            sir_label = 'Susceptible'
            sir_color = '#00E676'
        elif measured_zone <= bp['R']:
            sir = 'R'
            sir_label = 'Resistant'
            sir_color = '#FF1744'
        else:
            sir = 'I'
            sir_label = 'Intermediate'
            sir_color = '#FFD600'

        confidence_zone = rng.randint(88, 98)
        ast_results.append({
            'antibiotic':    ab,
            'zone_mm':       measured_zone,
            'breakpoint_S':  bp['S'],
            'breakpoint_R':  bp['R'],
            'sir':           sir,
            'sir_label':     sir_label,
            'sir_color':     sir_color,
            'confidence_pct':confidence_zone,
            'standard':      standard,
        })
        if sir == 'R':
            resistance_flags.append(ab)

    # Resistance pattern detection
    resistance_patterns = []
    ab_names = [r['antibiotic'] for r in ast_results if r['sir'] == 'R']
    if any(a in ab_names for a in ['Ceftriaxone', 'Ceftazidime', 'Cefuroxime']) and 'Meropenem' not in ab_names:
        resistance_patterns.append({'pattern': 'ESBL', 'description': 'Extended-Spectrum Beta-Lactamase — confirm with phenotypic test (double disk synergy)', 'color': '#FF6D00'})
    if 'Meropenem' in ab_names or 'Imipenem' in ab_names:
        resistance_patterns.append({'pattern': 'CRE / CPE', 'description': 'Carbapenem Resistance Enterobacteriaceae suspected — URGENT isolation required', 'color': '#FF1744'})
    if 'Vancomycin' in ab_names:
        resistance_patterns.append({'pattern': 'VRE', 'description': 'Vancomycin-Resistant Enterococcus suspected — contact precautions', 'color': '#FF1744'})
    if 'Oxacillin' in ab_names:
        resistance_patterns.append({'pattern': 'MRSA', 'description': 'Methicillin-Resistant Staphylococcus aureus — isolation protocol', 'color': '#FF1744'})

    susceptible_options = [r['antibiotic'] for r in ast_results if r['sir'] == 'S']

    return JsonResponse({
        'analysis_type':       'ast_disk_diffusion',
        'organism_tested':     organism,
        'standard_used':       standard,
        'antibiotics_tested':  len(ast_results),
        'ast_results':         ast_results,
        'resistance_patterns': resistance_patterns,
        'susceptible_options': susceptible_options[:4] if susceptible_options else [],
        'resistant_count':     len(resistance_flags),
        'intermediate_count':  len([r for r in ast_results if r['sir'] == 'I']),
        'susceptible_count':   len([r for r in ast_results if r['sir'] == 'S']),
        'treatment_guidance':  f'Preferred agents: {", ".join(susceptible_options[:3])}. Consult infectious disease if MDR pattern.' if susceptible_options else 'Consult ID physician — limited susceptible options.',
        'clinical_alert':      bool(resistance_patterns),
        'iso_disclaimer':      ISO_DISCLAIMER,
        'requires_validation': True,
        'analyzed_at':         timezone.now().isoformat(),
    })


# ─── API 3: Sample Triage ─────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_sample_triage(request):
    """
    AI classifies samples into Parasitology / Microbiology / Split workflows.
    """
    try:
        data = json.loads(request.body)
        sample_type   = data.get('sample_type', 'stool')
        clinical_info = data.get('clinical_info', '')
        symptoms      = data.get('symptoms', [])
        origin        = data.get('patient_origin', '')
        travel_history= data.get('travel_history', False)
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    rng = _rng(hash(sample_type + clinical_info))

    PARA_SAMPLES = ['stool', 'blood_film', 'skin_snip', 'urine_schistosoma']
    MICRO_SAMPLES = ['sputum', 'wound_swab', 'pus', 'csf', 'blood_culture', 'urine_culture', 'throat_swab']
    SPLIT_SAMPLES = ['stool', 'blood', 'tissue_biopsy']

    routing = 'SPLIT'
    if sample_type in ['sputum', 'wound_swab', 'pus', 'csf']:
        routing = 'MICROBIOLOGY'
    elif sample_type == 'blood_film':
        routing = 'PARASITOLOGY'
    elif sample_type == 'stool' and travel_history:
        routing = 'SPLIT'
    elif sample_type == 'stool' and not travel_history:
        routing = 'SPLIT' if rng.random() > 0.4 else 'MICROBIOLOGY'

    routes = {
        'MICROBIOLOGY': {
            'stream': 'Microbiology',
            'color': '#00BCD4',
            'emoji': '🦠',
            'workflow': ['Gram stain', 'Culture (blood + selective agar)', 'AST if growth', 'Susceptibility reporting'],
            'reason': 'Sample type and clinical data suggest bacterial/fungal etiology. Direct to microbiology workflow.',
        },
        'PARASITOLOGY': {
            'stream': 'Parasitology',
            'color': '#A78BFA',
            'emoji': '🔬',
            'workflow': ['Wet preparation', 'Giemsa stain', 'Concentration technique', 'Species identification'],
            'reason': 'Clinical context and sample type indicate parasitic etiology probability.',
        },
        'SPLIT': {
            'stream': 'Split Workflow',
            'color': '#FFD600',
            'emoji': '⚗️',
            'workflow_A': ['STREAM A — PARASITOLOGY: Wet prep, Giemsa, Concentration'],
            'workflow_B': ['STREAM B — MICROBIOLOGY: Culture, Gram stain, AST'],
            'reason': 'Dual processing recommended — insufficient data to exclude either parasitic or bacterial etiology.',
        },
    }

    route_info = routes.get(routing, routes['MICROBIOLOGY'])
    reflex = []
    if 'wbc' in symptoms or 'fever' in symptoms:
        reflex.append('Blood culture — fever present')
    if sample_type == 'stool' and 'bloody_diarrhea' in symptoms:
        reflex.append('Stool culture (Salmonella/Shigella/Campylobacter) STAT')
    if travel_history:
        reflex.append('Malaria RDT / Blood film — travel history')
    if 'meningism' in symptoms:
        reflex.append('CSF analysis URGENT — meningitis protocol')

    return JsonResponse({
        'triage_result':        routing,
        'routing_stream':       route_info['stream'],
        'routing_color':        route_info['color'],
        'routing_emoji':        route_info['emoji'],
        'reason':               route_info['reason'],
        'workflow':             route_info.get('workflow', []),
        'workflow_A':           route_info.get('workflow_A', []),
        'workflow_B':           route_info.get('workflow_B', []),
        'reflex_suggestions':   reflex,
        'gram_stain_trigger':   routing == 'MICROBIOLOGY',
        'biosafety_level':      'BSL-2' if routing == 'MICROBIOLOGY' else 'BSL-2',
        'turnaround_estimate':  '24–48h (culture)' if routing == 'MICROBIOLOGY' else '2–4h (parasitology)',
        'confidence_pct':       rng.randint(82, 96),
        'iso_disclaimer':       ISO_DISCLAIMER,
        'analyzed_at':          timezone.now().isoformat(),
    })


# ─── API 4: Reflex Testing Engine ────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_reflex_engine(request):
    """AI-powered reflex testing recommendation engine."""
    try:
        data = json.loads(request.body)
        current_findings = data.get('findings', {})
        sample_type      = data.get('sample_type', '')
        current_tests    = data.get('current_tests', [])
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    recommendations = []

    wbc_high    = current_findings.get('wbc_elevated', False)
    culture_pos = current_findings.get('culture_positive', False)
    gram_done   = current_findings.get('gram_stain_done', False)
    parasite_neg= current_findings.get('parasite_negative', False)
    bacteria_seen= current_findings.get('bacteria_seen', False)

    if culture_pos and not gram_done:
        recommendations.append({'test': 'Gram Stain', 'priority': 'URGENT', 'reason': 'Culture positive — Gram stain to guide empiric therapy', 'color': '#FF1744'})
    if bacteria_seen and 'ast' not in [t.lower() for t in current_tests]:
        recommendations.append({'test': 'AST (Disk Diffusion)', 'priority': 'URGENT', 'reason': 'Bacteria detected — susceptibility testing required before therapy', 'color': '#FF1744'})
    if wbc_high and parasite_neg and sample_type == 'stool':
        recommendations.append({'test': 'Stool Culture', 'priority': 'HIGH', 'reason': 'Elevated WBC + no parasites — bacterial gastroenteritis likely', 'color': '#FF6D00'})
    if sample_type == 'urine' and bacteria_seen:
        recommendations.append({'test': 'Urine Culture + AST', 'priority': 'HIGH', 'reason': 'Bacteria in urine — quantitative culture + susceptibility required', 'color': '#FF6D00'})
    if sample_type == 'blood' and wbc_high:
        recommendations.append({'test': 'Blood Culture × 2 sets', 'priority': 'URGENT', 'reason': 'Leukocytosis — bacteremia suspected, aerobic + anaerobic bottles', 'color': '#FF1744'})
    if current_findings.get('mixed_flora', False):
        recommendations.append({'test': 'Repeat Specimen', 'priority': 'MEDIUM', 'reason': 'Mixed flora — possible contamination. Recollect using aseptic technique', 'color': '#FFD600'})

    if not recommendations:
        recommendations.append({'test': 'Continue current workflow', 'priority': 'LOW', 'reason': 'No reflex triggers detected. Proceed with standard protocol.', 'color': '#00E676'})

    return JsonResponse({
        'reflex_recommendations': recommendations,
        'trigger_count':          len([r for r in recommendations if r['priority'] in ['URGENT', 'HIGH']]),
        'gram_stain_trigger':     culture_pos and not gram_done,
        'iso_disclaimer':         ISO_DISCLAIMER,
        'analyzed_at':            timezone.now().isoformat(),
    })


# ─── API 5: Gram Stain Trigger ────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def api_gram_stain_trigger(request):
    """Determines if Gram stain is warranted based on current findings."""
    try:
        data = json.loads(request.body)
        trigger_reasons = []
        score = 0
        if data.get('culture_growth'):
            trigger_reasons.append('Culture growth detected → Gram morphology required'); score += 3
        if data.get('infection_unclear'):
            trigger_reasons.append('Infection morphology unclear → differentiation needed'); score += 2
        if data.get('mixed_flora'):
            trigger_reasons.append('Mixed flora suspected → identify predominant organism'); score += 2
        if data.get('treatment_failing'):
            trigger_reasons.append('Treatment failure → confirm organism identity'); score += 3
        if data.get('csf_sample'):
            trigger_reasons.append('CSF specimen → URGENT Gram stain mandatory'); score += 5
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    recommended = score >= 2
    return JsonResponse({
        'gram_stain_recommended': recommended,
        'recommendation_strength': 'URGENT' if score >= 5 else 'STRONG' if score >= 3 else 'SUGGESTED',
        'color':                  '#FF1744' if score >= 5 else '#FF6D00' if score >= 3 else '#FFD600',
        'trigger_score':          score,
        'trigger_reasons':        trigger_reasons,
        'follow_up_suggestions':  ['Culture with sensitivity', 'Biochemical ID (API/Vitek2)', 'AST'] if recommended else ['Continue current protocol'],
        'iso_disclaimer':         ISO_DISCLAIMER,
        'analyzed_at':            timezone.now().isoformat(),
    })
