"""
API error-message localization
===============================
Centralised translation of HTTP ``detail`` strings into French and Kinyarwanda
so that error responses match the user's language — without touching the
hundreds of ``raise HTTPException(...)`` call sites.

How it works:
  - Routers keep raising English details (the canonical source).
  - A single exception handler in ``main.py`` calls :func:`translate_detail`
    with the request language resolved by :func:`lang_from_request`.
  - Unknown / dynamic details fall through unchanged (graceful — never breaks).

Language resolution priority (first hit wins):
  1. ``?lang=`` query parameter
  2. ``X-Lang`` request header
  3. ``Accept-Language`` request header (primary subtag)
  4. ``en`` (default)

DO NOT add Kiswahili to the ``rw`` column — Kinyarwanda only (plus standard
French/English technical loanwords already used in Rwandan lab practice).
"""
from __future__ import annotations

import re
from typing import Optional

SUPPORTED = ('en', 'fr', 'rw')

# ── Exact-match table: canonical English detail → {fr, rw} ─────────────────────

_EXACT: dict[str, dict[str, str]] = {
    # Auth / security / tokens
    'Invalid token':              {'fr': 'Jeton invalide', 'rw': 'Token ntiyemewe'},
    'Invalid token payload':      {'fr': 'Charge utile du jeton invalide', 'rw': 'Ibirimo bya token ntibyemewe'},
    'User not found or inactive': {'fr': 'Utilisateur introuvable ou inactif', 'rw': 'Ukoresha ntabonetse cyangwa ntakora'},
    'Invalid credentials':        {'fr': 'Identifiants invalides', 'rw': 'Amakuru yo kwinjira si yo'},
    'Account inactive':           {'fr': 'Compte inactif', 'rw': 'Konti ntikora'},
    'Current password incorrect': {'fr': 'Mot de passe actuel incorrect', 'rw': 'Ijambo banga rya none si ryo'},
    'Insufficient permissions':   {'fr': 'Permissions insuffisantes', 'rw': "Nta burenganzira buhagije"},
    'Username already exists':    {'fr': "Ce nom d'utilisateur existe déjà", 'rw': 'Iri zina rikoreshwa risanzweho'},
    'No OTP requested for this email': {'fr': 'Aucun code demandé pour cet e-mail', 'rw': 'Nta kode yasabwe kuri iyi imeyili'},
    'OTP has expired. Request a new one.': {'fr': "Le code a expiré. Demandez-en un nouveau.", 'rw': 'Kode yarangiye. Saba indi.'},
    'Invalid OTP':                {'fr': 'Code invalide', 'rw': 'Kode si yo'},
    'Invalid or unknown reset token': {'fr': 'Jeton de réinitialisation invalide ou inconnu', 'rw': 'Token yo gusubiramo ntiyemewe cyangwa itazwi'},
    'Reset token has expired. Start over.': {'fr': "Le jeton de réinitialisation a expiré. Recommencez.", 'rw': 'Token yo gusubiramo yarangiye. Ongera utangire.'},
    'Password must be at least 8 characters': {'fr': 'Le mot de passe doit comporter au moins 8 caractères', 'rw': 'Ijambo banga rigomba kugira nibura inyuguti 8'},
    'Passwords do not match':     {'fr': 'Les mots de passe ne correspondent pas', 'rw': 'Amagambo banga ntahura'},
    'User no longer exists':      {'fr': "L'utilisateur n'existe plus", 'rw': 'Ukoresha ntakiriho'},
    'User not found':             {'fr': 'Utilisateur introuvable', 'rw': 'Ukoresha ntabonetse'},
    'language must be one of en, fr, rw': {'fr': 'La langue doit être en, fr ou rw', 'rw': 'Ururimi rugomba kuba en, fr cyangwa rw'},
    'Invalid 2FA code':           {'fr': 'Code 2FA invalide', 'rw': 'Kode ya 2FA si yo'},
    'Invalid OTP. Please try again with a fresh code.': {'fr': 'Code invalide. Réessayez avec un nouveau code.', 'rw': 'Kode si yo. Ongera ugerageze na kode nshya.'},

    # Setup
    'System is already initialised. Setup can only run once.': {'fr': "Le système est déjà initialisé. L'installation ne peut s'exécuter qu'une seule fois.", 'rw': 'Sisitemu yamaze gutangizwa. Iyinjiza rikorwa rimwe gusa.'},

    # Routing / generic
    'Internal routing error':     {'fr': "Erreur d'acheminement interne", 'rw': 'Ikosa ryo kohereza imbere'},
    'Missing sample_id or mode':  {'fr': 'sample_id ou mode manquant', 'rw': 'sample_id cyangwa mode bibura'},
    'Internal server error':      {'fr': 'Erreur interne du serveur', 'rw': "Ikosa rya sisitemu imbere"},
    'Not found':                  {'fr': 'Introuvable', 'rw': 'Ntabonetse'},
    'Not Found':                  {'fr': 'Introuvable', 'rw': 'Ntabonetse'},

    # Access control
    'Admin access required':      {'fr': "Accès administrateur requis", 'rw': "Bisaba uburenganzira bw'umuyobozi"},
    'Lab manager access required':{'fr': "Accès responsable de laboratoire requis", 'rw': 'Bisaba uburenganzira bwa lab manager'},
    'Pathologist or Lab Manager authorization required': {'fr': "Autorisation du pathologiste ou du responsable de laboratoire requise", 'rw': "Bisaba uburenganzira bw'umuganga wa patolojiya cyangwa lab manager"},
    'Pathologist sign-off required': {'fr': 'Validation du pathologiste requise', 'rw': "Bisaba umukono w'umuganga wa patolojiya"},
    'Cytopathologist sign-off required': {'fr': 'Validation du cytopathologiste requise', 'rw': "Bisaba umukono w'umuganga wa cytopatolojiya"},
    'Pathologist decision required': {'fr': 'Décision du pathologiste requise', 'rw': "Bisaba icyemezo cy'umuganga wa patolojiya"},
    'Can only upload your own photo': {'fr': 'Vous ne pouvez téléverser que votre propre photo', 'rw': 'Ushobora kohereza gusa ifoto yawe'},
    'Only lab managers can approve voice enrollments': {'fr': "Seuls les responsables de laboratoire peuvent approuver les enrôlements vocaux", 'rw': "Aba lab managers gusa ni bo bemeza kwiyandikisha kw'ijwi"},
    'Only lab managers can reload language packs': {'fr': "Seuls les responsables de laboratoire peuvent recharger les packs de langues", 'rw': "Aba lab managers gusa ni bo bashobora kongera gutwara amapaki y'indimi"},
    'Role not permitted to use auto-create.': {'fr': "Rôle non autorisé à utiliser la création automatique.", 'rw': 'Inshingano ntiyemerewe gukoresha kurema byikora.'},

    # Not-found (clinical / ops)
    'Result not found':           {'fr': 'Résultat introuvable', 'rw': 'Igisubizo ntikibonetse'},
    'Worklist not found':         {'fr': 'Liste de travail introuvable', 'rw': "Urutonde rw'akazi ntirwabonetse"},
    'Worklist entry not found':   {'fr': 'Entrée de la liste de travail introuvable', 'rw': 'Inyandiko yo ku rutonde ntiyabonetse'},
    'No active worklist entries for this request': {'fr': 'Aucune entrée de liste de travail active pour cette demande', 'rw': 'Nta nyandiko ikora yo ku rutonde kuri iyi demande'},
    'Lab request not found':      {'fr': 'Demande de laboratoire introuvable', 'rw': 'Demande ya laboratwari ntiyabonetse'},
    'Culture not found':          {'fr': 'Culture introuvable', 'rw': 'Culture ntiyabonetse'},
    'Parasitology result not found': {'fr': 'Résultat de parasitologie introuvable', 'rw': "Igisubizo cy'udukoko ntikibonetse"},
    'PCR result not found':       {'fr': 'Résultat PCR introuvable', 'rw': 'Igisubizo cya PCR ntikibonetse'},
    'Viral load result not found':{'fr': 'Résultat de charge virale introuvable', 'rw': "Igisubizo cy'ingano ya virusi ntikibonetse"},
    'Donor not found':            {'fr': 'Donneur introuvable', 'rw': 'Utanga amaraso ntabonetse'},
    'Blood bag not found':        {'fr': 'Poche de sang introuvable', 'rw': "Sashe y'amaraso ntiyabonetse"},
    'Bag not found':              {'fr': 'Poche introuvable', 'rw': 'Sashe ntiyabonetse'},
    'Blood request not found':    {'fr': 'Demande de sang introuvable', 'rw': "Demande y'amaraso ntiyabonetse"},
    'Report not found':           {'fr': 'Rapport introuvable', 'rw': 'Raporo ntiyabonetse'},
    'Signal not found':           {'fr': 'Signal introuvable', 'rw': 'Ikimenyetso ntikibonetse'},
    'Staff not found':            {'fr': 'Membre du personnel introuvable', 'rw': 'Umukozi ntabonetse'},
    'Billing record not found':   {'fr': 'Enregistrement de facturation introuvable', 'rw': "Inyandiko y'ifatura ntiyabonetse"},
    'No billing record found for this lab request': {'fr': 'Aucun enregistrement de facturation pour cette demande', 'rw': "Nta nyandiko y'ifatura kuri iyi demande"},
    'NCR not found':              {'fr': 'RNC introuvable', 'rw': 'NCR ntiyabonetse'},
    'Enrollment not found':       {'fr': 'Enrôlement introuvable', 'rw': 'Kwiyandikisha ntikwabonetse'},
    'No enrollment found for this user': {'fr': 'Aucun enrôlement trouvé pour cet utilisateur', 'rw': "Nta kwiyandikisha kw'uyu mukoresha"},
    'No matching record in pilot data': {'fr': 'Aucun enregistrement correspondant dans les données pilotes', 'rw': "Nta nyandiko ihuye mu makuru y'igeragezwa"},
    'Patient not found':          {'fr': 'Patient introuvable', 'rw': 'Umurwayi ntabonetse'},
    'Sample not found':           {'fr': 'Échantillon introuvable', 'rw': 'Icyitegererezo ntikibonetse'},
    'Test not found':             {'fr': 'Test introuvable', 'rw': 'Ikizamini ntikibonetse'},
    'Record not found':           {'fr': 'Enregistrement introuvable', 'rw': 'Inyandiko ntiyabonetse'},
    'Forbidden':                  {'fr': 'Interdit', 'rw': 'Birabujijwe'},
    'Access denied':              {'fr': 'Accès refusé', 'rw': 'Kwinjira byanze'},

    # State / validation
    'Already validated':          {'fr': 'Déjà validé', 'rw': 'Byamaze kwemezwa'},
    'Must be validated before authorization': {'fr': 'Doit être validé avant autorisation', 'rw': 'Bigomba kwemezwa mbere yo gutangwa uburenganzira'},
    'Diagnosis category is required before validation': {'fr': 'La catégorie de diagnostic est requise avant validation', 'rw': "Icyiciro cy'isuzuma kirakenewe mbere yo kwemeza"},
    'Forensic/workplace positives require confirmatory GC-MS before validation': {'fr': 'Les résultats positifs médico-légaux / professionnels nécessitent une confirmation GC-MS avant validation', 'rw': "Ibyavuye bibi by'ubucamanza cyangwa akazi bisaba kwemezwa na GC-MS mbere"},

    # LIS mapping
    'No text extracted from the uploaded file.': {'fr': 'Aucun texte extrait du fichier téléversé.', 'rw': 'Nta nyandiko yakuwe muri dosiye yoherejwe.'},
    'Missing "draft" object.':    {'fr': 'Objet « draft » manquant.', 'rw': 'Igikoresho « draft » kibura.'},

    # Reception
    'visit_type must be OPD, IPD or ED': {'fr': 'visit_type doit être OPD, IPD ou ED', 'rw': 'visit_type igomba kuba OPD, IPD cyangwa ED'},

    # AI / voice
    'Audio file too small or empty': {'fr': 'Fichier audio trop court ou vide', 'rw': "Dosiye y'ijwi ni nto cyangwa irimo ubusa"},
    'Audio file too small. Please record for at least 2 seconds.': {'fr': "Fichier audio trop court. Enregistrez au moins 2 secondes.", 'rw': "Dosiye y'ijwi ni nto. Fata nibura amasegonda 2."},
    'Voice feature extraction failed. Try again.': {'fr': "Échec de l'extraction des caractéristiques vocales. Réessayez.", 'rw': 'Gukuramo ibiranga ijwi byanze. Ongera ugerageze.'},
    'Invalid enrollment session.': {'fr': "Session d'enrôlement invalide.", 'rw': 'Igihe cyo kwiyandikisha ntikiboneka.'},
    'Invalid or expired enrollment session. Please start over.': {'fr': "Session d'enrôlement invalide ou expirée. Veuillez recommencer.", 'rw': 'Igihe cyo kwiyandikisha ntikiboneka cyangwa cyarangiye. Ongera utangire.'},
    'Enrollment session expired. Please start a new enrollment.': {'fr': "La session d'enrôlement a expiré. Veuillez démarrer un nouvel enrôlement.", 'rw': 'Igihe cyo kwiyandikisha cyarangiye. Tangira ukundi.'},

    # Sync
    'Operation not found':        {'fr': 'Opération introuvable', 'rw': 'Igikorwa ntikibonetse'},
    'Operation is not in conflict state': {'fr': "L'opération n'est pas en état de conflit", 'rw': 'Igikorwa ntikiri mu makimbirane'},
    'Invalid resolution. Use keep_client or keep_server': {'fr': 'Résolution invalide. Utilisez keep_client ou keep_server', 'rw': 'Igisubizo ntikiboneka. Koresha keep_client cyangwa keep_server'},
}

# ── Pattern table: regex on English detail → {fr, rw} format templates ─────────
# `{0}`, `{1}` … map to regex capture groups (preserved verbatim across languages).

_PATTERNS: list[tuple[re.Pattern, dict[str, str]]] = [
    (re.compile(r'^Role (.+) not permitted$'),
     {'fr': 'Rôle {0} non autorisé', 'rw': 'Inshingano {0} ntiyemerewe'}),
    (re.compile(r'^Scenario "(.+)" not found$'),
     {'fr': 'Scénario « {0} » introuvable', 'rw': 'Scenario « {0} » ntiyabonetse'}),
    (re.compile(r'^Generated scenario "(.+)" expired or unknown$'),
     {'fr': 'Scénario généré « {0} » expiré ou inconnu', 'rw': 'Scenario yakozwe « {0} » yarangiye cyangwa ntizwi'}),
    (re.compile(r'^Book not found: (.+)$'),
     {'fr': 'Registre introuvable : {0}', 'rw': 'Igitabo ntikibonetse: {0}'}),
    (re.compile(r'^Bag (.+) not found$'),
     {'fr': 'Poche {0} introuvable', 'rw': 'Sashe {0} ntiyabonetse'}),
    (re.compile(r'^File too large \(max (\d+) MB\)$'),
     {'fr': 'Fichier trop volumineux (max {0} Mo)', 'rw': 'Dosiye ni nini cyane (max {0} MB)'}),
    (re.compile(r'^Rejection rule not found: (.+)$'),
     {'fr': 'Règle de rejet introuvable : {0}', 'rw': 'Itegeko ryo kwanga ntiryabonetse: {0}'}),
    (re.compile(r'^Rejection record not found: (.+)$'),
     {'fr': "Enregistrement de rejet introuvable : {0}", 'rw': 'Inyandiko yo kwanga ntiyabonetse: {0}'}),
    (re.compile(r'^Language pack not found: (.+)$'),
     {'fr': 'Pack de langue introuvable : {0}', 'rw': "Ipaki y'ururimi ntiyabonetse: {0}"}),
    (re.compile(r'^No guidance found for topic: (.+)$'),
     {'fr': 'Aucune aide trouvée pour le sujet : {0}', 'rw': 'Nta bufasha bwabonetse kuri: {0}'}),
]


def normalize_lang(code: Optional[str]) -> str:
    """Coerce any locale-ish string to one of SUPPORTED (default 'en')."""
    if not code:
        return 'en'
    base = code.strip().lower().split('-')[0].split('_')[0]
    return base if base in SUPPORTED else 'en'


def lang_from_request(request) -> str:
    """Resolve the request language: ?lang → X-Lang → Accept-Language → en."""
    try:
        q = request.query_params.get('lang')
        if q:
            return normalize_lang(q)
        xl = request.headers.get('x-lang')
        if xl:
            return normalize_lang(xl)
        al = request.headers.get('accept-language')
        if al:
            # "fr-FR,fr;q=0.9,en;q=0.8" → first token's primary subtag
            first = al.split(',')[0].strip()
            return normalize_lang(first)
    except Exception:
        pass
    return 'en'


def translate_detail(detail, lang: str) -> object:
    """Translate an HTTP detail string into `lang`. Non-strings and unknown
    strings are returned unchanged (graceful fallback)."""
    if lang == 'en' or lang not in SUPPORTED:
        return detail
    if not isinstance(detail, str):
        return detail
    text = detail.strip()

    exact = _EXACT.get(text)
    if exact:
        return exact.get(lang, detail)

    for pattern, tx in _PATTERNS:
        m = pattern.match(text)
        if m:
            template = tx.get(lang)
            if template:
                try:
                    return template.format(*m.groups())
                except Exception:
                    return detail
    return detail
