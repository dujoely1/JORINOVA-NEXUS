"""
JORINOVA NEXUS ALIS-X — PDF Report Generator
=============================================
Generates professional clinical lab reports using reportlab.
Pure Python — works on Windows, Linux, Docker (no system libs needed).

Reports produced:
  - Full patient lab result report (all validated results)
  - CBC / Haematology report (Sysmex format)
  - Single test result certificate
  - Critical value report
  - QC / IQC run report
  - Shift summary report

Design:
  - White background, cyan accent (#0891b2)
  - JORINOVA NEXUS logo in header (exactly 2.5cm)
  - Reference ranges shown beside each result
  - Flags colour-coded: Critical=red, High=orange, Low=blue, Normal=green
  - PQC signature hash in footer
  - Pathologist/scientist signature blocks
  - ISO 15189:2022 compliance statement
"""
from __future__ import annotations
import io
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger('pdf_reports')

# Colour palette (CMYK-safe for print)
CYAN       = '#0891b2'
CYAN_DARK  = '#0e7490'
WHITE      = '#ffffff'
LIGHT_CYAN = '#cffafe'
RED        = '#dc2626'
ORANGE     = '#f97316'
BLUE       = '#1d4ed8'
GREEN      = '#15803d'
GRAY_LIGHT = '#f1f5f9'
GRAY_MID   = '#64748b'
BLACK      = '#0f172a'

LOGO_PATH = str(
    Path(__file__).parent.parent.parent / 'frontend' / 'shared' / 'assets' / 'logos' / 'jorinova-logo.jpeg'
)


# ── Report localization (en / fr / rw) ────────────────────────────────────────
# Patient-facing reports are printed in the patient's / requester's language.
# Tiny flag badges (CRIT/HIGH/LOW/POS/NEG) stay as universal lab codes so they
# never overflow the badge; everything else (prose, labels, headings) localizes.

_RL: dict[str, dict[str, str]] = {
    'subtitle':       {'en': 'Advanced Laboratory Information System', 'fr': 'Système avancé d’information de laboratoire', 'rw': 'Sisitemu y’amakuru ya laboratwari'},
    'title.results':  {'en': 'Laboratory Test Results Report', 'fr': 'Rapport des résultats de laboratoire', 'rw': 'Raporo y’ibisubizo bya laboratwari'},
    'title.cont':     {'en': 'Laboratory Test Results Report (cont.)', 'fr': 'Rapport des résultats de laboratoire (suite)', 'rw': 'Raporo y’ibisubizo bya laboratwari (gukomeza)'},
    'title.results_cont': {'en': 'Laboratory Test Results (cont.)', 'fr': 'Résultats de laboratoire (suite)', 'rw': 'Ibisubizo bya laboratwari (gukomeza)'},
    'title.sigs':     {'en': 'Laboratory Test Results (signatures)', 'fr': 'Résultats de laboratoire (signatures)', 'rw': 'Ibisubizo bya laboratwari (imikono)'},
    'patient':        {'en': 'Patient', 'fr': 'Patient', 'rw': 'Umurwayi'},
    'pid':            {'en': 'PID', 'fr': 'PID', 'rw': 'PID'},
    'page':           {'en': 'Page {n} of {m}', 'fr': 'Page {n} sur {m}', 'rw': 'Ipaji {n} kuri {m}'},
    'footer.conf':    {'en': 'Confidential Medical Record', 'fr': 'Dossier médical confidentiel', 'rw': 'Inyandiko y’ubuvuzi y’ibanga'},
    'pqc_signed':     {'en': 'PQC-Signed', 'fr': 'Signé PQC', 'rw': 'Umukono wa PQC'},
    'printed':        {'en': 'Printed', 'fr': 'Imprimé', 'rw': 'Byacapwe'},
    'laboratory':     {'en': 'Laboratory', 'fr': 'Laboratoire', 'rw': 'Laboratwari'},
    'f.full_name':    {'en': 'Full Name', 'fr': 'Nom complet', 'rw': 'Amazina yose'},
    'f.dob':          {'en': 'Date of Birth', 'fr': 'Date de naissance', 'rw': 'Itariki y’amavuko'},
    'f.sex':          {'en': 'Sex', 'fr': 'Sexe', 'rw': 'Igitsina'},
    'f.age':          {'en': 'Age', 'fr': 'Âge', 'rw': 'Imyaka'},
    'f.lid':          {'en': 'Lab ID (LID)', 'fr': 'ID labo (LID)', 'rw': 'ID ya labo (LID)'},
    'f.national_id':  {'en': 'National ID', 'fr': 'ID national', 'rw': 'Indangamuntu'},
    'f.insurance':    {'en': 'Insurance', 'fr': 'Assurance', 'rw': 'Ubwishingizi'},
    'sec.patient':    {'en': 'Patient Information', 'fr': 'Informations du patient', 'rw': 'Amakuru y’umurwayi'},
    'sec.sample':     {'en': 'Sample Information', 'fr': 'Informations de l’échantillon', 'rw': 'Amakuru y’urugero'},
    'sample.type':    {'en': 'Sample Type', 'fr': 'Type d’échantillon', 'rw': 'Ubwoko bw’urugero'},
    'sample.collected':{'en': 'Collected', 'fr': 'Prélevé', 'rw': 'Byatoranyijwe'},
    'sample.received':{'en': 'Received', 'fr': 'Reçu', 'rw': 'Byakiriwe'},
    'sample.doctor':  {'en': 'Requesting Doctor', 'fr': 'Médecin prescripteur', 'rw': 'Muganga wasabye'},
    'tbl.test':       {'en': 'Test Name', 'fr': 'Nom du test', 'rw': 'Izina ry’ikizamini'},
    'tbl.result':     {'en': 'Result', 'fr': 'Résultat', 'rw': 'Igisubizo'},
    'tbl.unit':       {'en': 'Unit', 'fr': 'Unité', 'rw': 'Igipimo'},
    'tbl.ref':        {'en': 'Reference Range', 'fr': 'Valeurs de référence', 'rw': 'Urugero rusanzwe'},
    'tbl.flag':       {'en': 'Flag', 'fr': 'Indicateur', 'rw': 'Ikimenyetso'},
    'flag.normal':    {'en': '✓ Normal', 'fr': '✓ Normal', 'rw': '✓ Bisanzwe'},
    'crit.title':     {'en': '⚠️ CRITICAL VALUES — Immediate Clinical Action Required', 'fr': '⚠️ VALEURS CRITIQUES — Action clinique immédiate requise', 'rw': '⚠️ IBISUBIZO BIHUTIRWA — Hakenewe igikorwa cy’ubuvuzi ako kanya'},
    'sig.tech':       {'en': 'Laboratory Scientist / Technician', 'fr': 'Scientifique / Technicien de laboratoire', 'rw': 'Umuhanga / Tekiniseni wa laboratwari'},
    'sig.validator':  {'en': 'Senior Scientist / Validator', 'fr': 'Scientifique senior / Validateur', 'rw': 'Umuhanga mukuru / Uwemeza'},
    'sig.manager':    {'en': 'Laboratory Manager / Pathologist', 'fr': 'Responsable de laboratoire / Pathologiste', 'rw': 'Umuyobozi wa labo / Umuganga wa patolojiya'},
    'sig.pathologist':{'en': 'Pathologist', 'fr': 'Pathologiste', 'rw': 'Umuganga wa patolojiya'},
    'sig.notifying':  {'en': 'Notifying Scientist', 'fr': 'Scientifique notifiant', 'rw': 'Umuhanga wamenyesheje'},
    'sig.lab_manager':{'en': 'Laboratory Manager', 'fr': 'Responsable de laboratoire', 'rw': 'Umuyobozi wa laboratwari'},
    'sig.clinician_ack':{'en': 'Clinician (Acknowledgement)', 'fr': 'Clinicien (Accusé de réception)', 'rw': 'Muganga (Kwemeza)'},

    # CBC report
    'cbc.title':      {'en': 'Complete Blood Count (CBC) Report', 'fr': 'Rapport de numération formule sanguine (NFS)', 'rw': 'Raporo y’isuzuma ryuzuye ry’amaraso (CBC)'},
    'f.name':         {'en': 'Name', 'fr': 'Nom', 'rw': 'Izina'},
    'f.date':         {'en': 'Date', 'fr': 'Date', 'rw': 'Itariki'},
    'cbc.params':     {'en': 'CBC Parameters', 'fr': 'Paramètres NFS', 'rw': 'Ibipimo bya CBC'},
    'h.parameter':    {'en': 'Parameter', 'fr': 'Paramètre', 'rw': 'Igipimo'},
    'h.refrange':     {'en': 'Ref Range', 'fr': 'Réf.', 'rw': 'Urugero'},
    'cbc.wbc_diff':   {'en': 'WBC Differential Count', 'fr': 'Formule leucocytaire', 'rw': 'Kubara ubwoko bw’uturemangingo twera'},
    'h.cell_type':    {'en': 'Cell Type', 'fr': 'Type cellulaire', 'rw': 'Ubwoko bw’uturemangingo'},
    'h.ref_pct':      {'en': 'Ref %', 'fr': 'Réf %', 'rw': 'Urugero %'},
    'h.bar':          {'en': 'Bar', 'fr': 'Barre', 'rw': 'Umurongo'},
    'cbc.disclaimer_hdr': {'en': 'Disclaimer', 'fr': 'Avertissement', 'rw': 'Itangazo'},
    'cbc.disclaimer1':{'en': 'Results must be interpreted in clinical context by the responsible clinician. This report is generated by JORINOVA NEXUS ALIS-X and validated by the laboratory.', 'fr': 'Les résultats doivent être interprétés dans le contexte clinique par le clinicien responsable. Ce rapport est généré par JORINOVA NEXUS ALIS-X et validé par le laboratoire.', 'rw': 'Ibisubizo bigomba gusobanurwa n’umuganga ushinzwe. Iyi raporo yakozwe na JORINOVA NEXUS ALIS-X kandi yemejwe na laboratwari.'},
    'cbc.disclaimer2':{'en': 'Critical values have been communicated to the requesting clinician as per ISO 15189:2022 requirements.', 'fr': 'Les valeurs critiques ont été communiquées au clinicien prescripteur conformément aux exigences ISO 15189:2022.', 'rw': 'Ibisubizo bihutirwa byamenyeshejwe umuganga wasabye nk’uko ISO 15189:2022 ibisaba.'},

    # Critical value notification report
    'crit.report_title':{'en': '🚨 CRITICAL VALUE NOTIFICATION REPORT', 'fr': '🚨 RAPPORT DE NOTIFICATION DE VALEUR CRITIQUE', 'rw': '🚨 RAPORO YO KUMENYESHA IGISUBIZO CYIHUTIRWA'},
    'crit.banner':    {'en': '⚠️  CRITICAL VALUE — IMMEDIATE CLINICAL ACTION REQUIRED  ⚠️', 'fr': '⚠️  VALEUR CRITIQUE — ACTION CLINIQUE IMMÉDIATE REQUISE  ⚠️', 'rw': '⚠️  IGISUBIZO CYIHUTIRWA — HAKENEWE IGIKORWA AKO KANYA  ⚠️'},
    'crit.archived':  {'en': 'This notification is permanently archived per ISO 15189:2022 § 5.9', 'fr': 'Cette notification est archivée de façon permanente selon ISO 15189:2022 § 5.9', 'rw': 'Iri menyesha ribikwa burundu nk’uko ISO 15189:2022 § 5.9 ibiteganya'},
    'crit.results':   {'en': 'Critical Results', 'fr': 'Résultats critiques', 'rw': 'Ibisubizo bihutirwa'},
    'crit.ref':       {'en': 'Reference', 'fr': 'Référence', 'rw': 'Urugero'},
    'crit.default_interp':{'en': 'Critical value', 'fr': 'Valeur critique', 'rw': 'Igisubizo cyihutirwa'},
    'crit.notif_record':{'en': 'Clinician Notification Record', 'fr': 'Registre de notification du clinicien', 'rw': 'Inyandiko yo kumenyesha umuganga'},
    'crit.f.notified':{'en': 'Clinician Notified', 'fr': 'Clinicien notifié', 'rw': 'Umuganga wamenyeshejwe'},
    'crit.f.method':  {'en': 'Notification Method', 'fr': 'Méthode de notification', 'rw': 'Uburyo bwo kumenyesha'},
    'crit.f.readback':{'en': 'Read-back Confirmed', 'fr': 'Relecture confirmée', 'rw': 'Gusubiramo byemejwe'},
    'crit.f.time':    {'en': 'Notification Time', 'fr': 'Heure de notification', 'rw': 'Igihe cyo kumenyesha'},
    'crit.readback_yes':{'en': '✅ YES — clinician confirmed understanding', 'fr': '✅ OUI — le clinicien a confirmé sa compréhension', 'rw': '✅ YEGO — umuganga yemeje ko yumvise'},
    'crit.readback_no':{'en': '⚠️ NO read-back recorded', 'fr': '⚠️ AUCUNE relecture enregistrée', 'rw': '⚠️ NTA gusubiramo byanditswe'},
    'crit.see_sig':   {'en': 'See signature below', 'fr': 'Voir signature ci-dessous', 'rw': 'Reba umukono hepfo'},
}


def _t(key: str, lang: str = 'en', **kw) -> str:
    entry = _RL.get(key)
    if not entry:
        return key
    s = entry.get(lang) or entry.get('en') or key
    return s.format(**kw) if kw else s


# ── Color helpers ─────────────────────────────────────────────────────────────

def _hex_to_rgb(h: str):
    """Convert #rrggbb → (r, g, b) floats 0–1."""
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))


def _set_fill(canvas, hex_color: str):
    canvas.setFillColorRGB(*_hex_to_rgb(hex_color))


def _set_stroke(canvas, hex_color: str):
    canvas.setStrokeColorRGB(*_hex_to_rgb(hex_color))


# ── Page setup ────────────────────────────────────────────────────────────────

A4_W = 595.28   # A4 width  (points)
A4_H = 841.89   # A4 height (points)
MARGIN_L = 40
MARGIN_R = A4_W - 40
MARGIN_T = A4_H - 40
MARGIN_B = 55     # Space for footer
HEADER_H = 70.9   # 2.5cm at 72dpi ≈ 70.9pt


# ── Header (2.5cm, always) ────────────────────────────────────────────────────

def _draw_header(c, hospital_name: str, report_title: str,
                 patient_name: str = '', patient_pid: str = '',
                 report_date: str = '', page_num: int = 1, total_pages: int = 1,
                 lang: str = 'en'):
    """Draw the 2.5cm fixed header on every page."""
    from reportlab.pdfgen import canvas as cv
    from reportlab.lib.pagesizes import A4

    # White header background
    _set_fill(c, WHITE)
    c.rect(0, A4_H - HEADER_H, A4_W, HEADER_H, fill=1, stroke=0)

    # Cyan bottom border (3pt)
    _set_fill(c, CYAN)
    c.rect(0, A4_H - HEADER_H, A4_W, 3, fill=1, stroke=0)

    # Logo (circular region left side)
    logo_size = 50
    logo_x    = MARGIN_L
    logo_y    = A4_H - HEADER_H + 10

    if os.path.exists(LOGO_PATH):
        try:
            c.drawImage(LOGO_PATH, logo_x, logo_y, width=logo_size, height=logo_size,
                        mask='auto', preserveAspectRatio=True)
        except Exception:
            _draw_logo_placeholder(c, logo_x, logo_y, logo_size)
    else:
        _draw_logo_placeholder(c, logo_x, logo_y, logo_size)

    # Hospital name + subtitle
    _set_fill(c, CYAN_DARK)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(logo_x + logo_size + 10, A4_H - HEADER_H + 42, hospital_name)

    _set_fill(c, GRAY_MID)
    c.setFont('Helvetica', 7)
    c.drawString(logo_x + logo_size + 10, A4_H - HEADER_H + 30,
                 _t('subtitle', lang) + '  ·  ISO 15189:2022')
    c.drawString(logo_x + logo_size + 10, A4_H - HEADER_H + 20, report_title)

    # Right side: patient + date
    _set_fill(c, BLACK)
    c.setFont('Helvetica-Bold', 7.5)
    c.drawRightString(MARGIN_R, A4_H - HEADER_H + 50, report_date)

    _set_fill(c, GRAY_MID)
    c.setFont('Helvetica', 7)
    if patient_name:
        c.drawRightString(MARGIN_R, A4_H - HEADER_H + 38, f'{_t("patient", lang)}: {patient_name}')
    if patient_pid:
        c.drawRightString(MARGIN_R, A4_H - HEADER_H + 28, f'{_t("pid", lang)}: {patient_pid}')
    c.drawRightString(MARGIN_R, A4_H - HEADER_H + 18,
                      _t('page', lang, n=page_num, m=total_pages))


def _draw_logo_placeholder(c, x, y, size):
    """Draw a cyan circle with 'J' when logo file not found."""
    _set_fill(c, CYAN)
    c.circle(x + size/2, y + size/2, size/2, fill=1, stroke=0)
    _set_fill(c, WHITE)
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(x + size/2, y + size/2 - 7, 'J')


# ── Footer ────────────────────────────────────────────────────────────────────

def _draw_footer(c, pqc_hash: str = '', lab_manager: str = '', page_num: int = 1, lang: str = 'en'):
    """Draw the 1cm footer on every page."""
    # Thin cyan top rule
    _set_stroke(c, CYAN)
    c.setLineWidth(1.2)
    c.line(MARGIN_L, MARGIN_B + 2, MARGIN_R, MARGIN_B + 2)

    _set_fill(c, GRAY_MID)
    c.setFont('Helvetica', 6)
    c.drawString(MARGIN_L, MARGIN_B - 8,
                 f'JORINOVA NEXUS ALIS-X  ·  {_t("footer.conf", lang)}  ·  ISO 15189:2022')
    if pqc_hash:
        _set_fill(c, GREEN)
        c.setFont('Helvetica', 5.5)
        c.drawString(MARGIN_L, MARGIN_B - 18,
                     f'🔐 {_t("pqc_signed", lang)}: {pqc_hash[:60]}')

    _set_fill(c, GRAY_MID)
    c.setFont('Helvetica', 6)
    c.drawRightString(MARGIN_R, MARGIN_B - 8,
                      f'{_t("printed", lang)}: {datetime.now().strftime("%d %b %Y %H:%M")}')
    if lab_manager:
        c.drawRightString(MARGIN_R, MARGIN_B - 18, f'{_t("laboratory", lang)}: {lab_manager}')


# ── Section heading ───────────────────────────────────────────────────────────

def _draw_section(c, y: float, title: str) -> float:
    """Draw a section heading band. Returns new y position."""
    _set_fill(c, CYAN)
    c.rect(MARGIN_L, y - 14, MARGIN_R - MARGIN_L, 16, fill=1, stroke=0)
    _set_fill(c, WHITE)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(MARGIN_L + 8, y - 9, title.upper())
    return y - 20


# ── Patient info block ────────────────────────────────────────────────────────

def _draw_patient_block(c, y: float, patient: dict, lang: str = 'en') -> float:
    """Draw 2-column patient info block."""
    fields_l = [
        (_t('f.full_name', lang), patient.get('name', '—')),
        (_t('f.dob', lang),       patient.get('dob',  '—')),
        (_t('f.sex', lang),       patient.get('sex',  '—')),
        (_t('f.age', lang),       patient.get('age',  '—')),
    ]
    fields_r = [
        (_t('pid', lang),          patient.get('pid',      '—')),
        (_t('f.lid', lang),        patient.get('lid',      '—')),
        (_t('f.national_id', lang),patient.get('national_id','—')),
        (_t('f.insurance', lang),  patient.get('insurance', '—')),
    ]
    mid = (MARGIN_L + MARGIN_R) / 2

    _set_fill(c, GRAY_LIGHT)
    c.rect(MARGIN_L, y - (len(fields_l) * 14 + 6), MARGIN_R - MARGIN_L,
           len(fields_l) * 14 + 6, fill=1, stroke=0)

    row_y = y - 4
    for (lbl_l, val_l), (lbl_r, val_r) in zip(fields_l, fields_r):
        _set_fill(c, GRAY_MID)
        c.setFont('Helvetica-Bold', 7.5)
        c.drawString(MARGIN_L + 6, row_y, lbl_l + ':')
        c.drawString(mid + 4, row_y, lbl_r + ':')
        _set_fill(c, BLACK)
        c.setFont('Helvetica', 7.5)
        c.drawString(MARGIN_L + 80, row_y, str(val_l))
        c.drawString(mid + 72, row_y, str(val_r))
        row_y -= 14

    return row_y - 8


# ── Result row ────────────────────────────────────────────────────────────────

def _draw_result_row(c, y: float, result: dict, row_even: bool, lang: str = 'en') -> float:
    """Draw one lab result row with flag colour coding."""
    if row_even:
        _set_fill(c, '#f7fdff')
        c.rect(MARGIN_L, y - 13, MARGIN_R - MARGIN_L, 14, fill=1, stroke=0)

    flag  = result.get('flag', 'N') or 'N'
    value = str(result.get('value', '—') or '—')
    unit  = str(result.get('unit',  '')  or '')
    ref   = str(result.get('reference_range', '') or '')
    name  = str(result.get('test_name', result.get('name', '—')))

    # Colour by flag
    flag_color = {
        'HH': RED, 'LL': BLUE, 'H': ORANGE, 'L': '#2563eb',
        'N': GREEN, 'POS': RED, 'NEG': GREEN, 'A': ORANGE,
    }.get(flag, GRAY_MID)

    # Test name
    _set_fill(c, BLACK)
    c.setFont('Helvetica', 8)
    c.drawString(MARGIN_L + 4, y - 10, name[:35])

    # Value (bold, colour coded)
    _set_fill(c, flag_color if flag not in ('N', 'NEG') else BLACK)
    c.setFont('Helvetica-Bold', 8.5)
    c.drawString(MARGIN_L + 200, y - 10, value)

    # Unit
    _set_fill(c, GRAY_MID)
    c.setFont('Helvetica', 7.5)
    c.drawString(MARGIN_L + 260, y - 10, unit)

    # Reference range
    c.drawString(MARGIN_L + 315, y - 10, ref[:20])

    # Flag badge
    if flag and flag != 'N':
        _set_fill(c, flag_color)
        c.roundRect(MARGIN_R - 45, y - 12, 38, 12, 3, fill=1, stroke=0)
        _set_fill(c, WHITE)
        c.setFont('Helvetica-Bold', 7)
        flag_labels = {'HH':'⬆⬆ CRIT','LL':'⬇⬇ CRIT','H':'⬆ HIGH',
                       'L':'⬇ LOW','POS':'POSITIVE','NEG':'NEGATIVE','A':'ABNORMAL'}
        c.drawCentredString(MARGIN_R - 26, y - 8, flag_labels.get(flag, flag))
    else:
        _set_fill(c, GREEN)
        c.setFont('Helvetica', 7)
        c.drawString(MARGIN_R - 40, y - 9, _t('flag.normal', lang))

    return y - 16


# ── Signature block ───────────────────────────────────────────────────────────

def _draw_signatures(c, y: float, signatories: list[str]) -> float:
    """Draw signature lines at bottom of report."""
    y -= 20
    _set_stroke(c, CYAN)
    c.setLineWidth(0.5)
    c.line(MARGIN_L, y, MARGIN_R, y)

    col_w = (MARGIN_R - MARGIN_L) / len(signatories)
    for i, name in enumerate(signatories):
        cx = MARGIN_L + i * col_w + col_w / 2
        # Signature line
        c.line(cx - col_w/2 + 10, y - 30, cx + col_w/2 - 10, y - 30)
        _set_fill(c, GRAY_MID)
        c.setFont('Helvetica', 6.5)
        c.drawCentredString(cx, y - 40, name)

    return y - 50


# ═══ PUBLIC API ═══════════════════════════════════════════════════════════════

def generate_lab_result_report(
    patient: dict,
    results: list[dict],
    hospital_name: str = 'JORINOVA NEXUS Hospital',
    lab_manager: str   = 'Laboratory Manager',
    requesting_doctor: str = '',
    sample_info: dict  = None,
    pqc_hash: str      = '',
    lang: str          = 'en',
) -> bytes:
    """
    Generate a complete lab result report PDF.

    Args:
        patient: {'name', 'pid', 'lid', 'dob', 'sex', 'age', 'national_id', 'insurance'}
        results: [{'test_name', 'value', 'unit', 'flag', 'reference_range', 'department'}]
        hospital_name: Hospital display name
        lab_manager:   Name for signature block
        sample_info:   {'collected_at', 'received_at', 'sample_type'}
        pqc_hash:      PQC signature hash for this report

    Returns:
        bytes: PDF file content
    """
    from reportlab.pdfgen import canvas as Canvas
    from reportlab.lib.pagesizes import A4

    buf = io.BytesIO()
    c = Canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f'Lab Report — {patient.get("name", "Patient")}')
    c.setAuthor('JORINOVA NEXUS ALIS-X')
    c.setSubject('Laboratory Test Results')

    now_str     = datetime.now().strftime('%A, %d %B %Y  %H:%M')
    report_date = datetime.now().strftime('%d/%m/%Y')

    # ── Table header columns ──────────────────────────────────────────────────
    def draw_table_header(y):
        _set_fill(c, CYAN_DARK)
        c.rect(MARGIN_L, y - 14, MARGIN_R - MARGIN_L, 15, fill=1, stroke=0)
        _set_fill(c, WHITE)
        c.setFont('Helvetica-Bold', 7)
        for col_x, label in [
            (MARGIN_L + 4,   _t('tbl.test', lang)),
            (MARGIN_L + 200, _t('tbl.result', lang)),
            (MARGIN_L + 260, _t('tbl.unit', lang)),
            (MARGIN_L + 315, _t('tbl.ref', lang)),
            (MARGIN_R - 45,  _t('tbl.flag', lang)),
        ]:
            c.drawString(col_x, y - 9, label)
        return y - 16

    # ── Page 1 ────────────────────────────────────────────────────────────────
    total_pages = max(1, (len(results) // 25) + 1)
    page_num    = 1

    _draw_header(c, hospital_name, _t('title.results', lang),
                 patient.get('name', ''), patient.get('pid', ''),
                 now_str, page_num, total_pages, lang=lang)

    y = A4_H - HEADER_H - 12

    # Patient block
    y = _draw_section(c, y, '📋 ' + _t('sec.patient', lang))
    y = _draw_patient_block(c, y, patient, lang=lang)
    y -= 4

    # Sample info
    if sample_info:
        y = _draw_section(c, y, '🧪 ' + _t('sec.sample', lang))
        _set_fill(c, GRAY_LIGHT)
        c.rect(MARGIN_L, y - 30, MARGIN_R - MARGIN_L, 30, fill=1, stroke=0)
        _set_fill(c, GRAY_MID)
        c.setFont('Helvetica-Bold', 7.5)
        c.drawString(MARGIN_L + 6, y - 10, _t('sample.type', lang) + ':')
        c.drawString(MARGIN_L + 200, y - 10, _t('sample.collected', lang) + ':')
        c.drawString(MARGIN_L + 370, y - 10, _t('sample.received', lang) + ':')
        _set_fill(c, BLACK)
        c.setFont('Helvetica', 7.5)
        c.drawString(MARGIN_L + 80, y - 10, sample_info.get('sample_type', '—'))
        c.drawString(MARGIN_L + 250, y - 10, sample_info.get('collected_at', '—'))
        c.drawString(MARGIN_L + 420, y - 10, sample_info.get('received_at', '—'))
        if requesting_doctor:
            _set_fill(c, GRAY_MID)
            c.setFont('Helvetica-Bold', 7.5)
            c.drawString(MARGIN_L + 6, y - 22, _t('sample.doctor', lang) + ':')
            _set_fill(c, BLACK)
            c.setFont('Helvetica', 7.5)
            c.drawString(MARGIN_L + 105, y - 22, requesting_doctor)
        y -= 38

    # Results by department
    depts = {}
    for r in results:
        dept = r.get('department', 'General')
        depts.setdefault(dept, []).append(r)

    row_even = True
    for dept_name, dept_results in depts.items():
        # Check page space
        if y < MARGIN_B + 80:
            _draw_footer(c, pqc_hash, lab_manager, page_num, lang=lang)
            c.showPage()
            page_num += 1
            _draw_header(c, hospital_name, _t('title.cont', lang),
                         patient.get('name', ''), patient.get('pid', ''),
                         now_str, page_num, total_pages, lang=lang)
            y = A4_H - HEADER_H - 12
            row_even = True

        y = _draw_section(c, y, f'🔬 {dept_name}')
        y = draw_table_header(y)

        for result in dept_results:
            if y < MARGIN_B + 30:
                _draw_footer(c, pqc_hash, lab_manager, page_num, lang=lang)
                c.showPage()
                page_num += 1
                _draw_header(c, hospital_name, _t('title.results_cont', lang),
                             patient.get('name', ''), patient.get('pid', ''),
                             now_str, page_num, total_pages, lang=lang)
                y = A4_H - HEADER_H - 12
                y = draw_table_header(y)
                row_even = True

            y = _draw_result_row(c, y, result, row_even, lang=lang)
            row_even = not row_even
        y -= 6

    # Interpretation note (if any critical)
    critical = [r for r in results if r.get('flag') in ('HH', 'LL', 'POS')]
    if critical:
        y -= 8
        _set_fill(c, '#fff0f0')
        c.rect(MARGIN_L, y - (len(critical) * 12 + 20),
               MARGIN_R - MARGIN_L, len(critical) * 12 + 20, fill=1, stroke=0)
        _set_stroke(c, RED)
        c.setLineWidth(2)
        c.rect(MARGIN_L, y - (len(critical) * 12 + 20),
               MARGIN_R - MARGIN_L, len(critical) * 12 + 20, fill=0, stroke=1)
        _set_fill(c, RED)
        c.setFont('Helvetica-Bold', 8)
        c.drawString(MARGIN_L + 6, y - 10, _t('crit.title', lang))
        row_y = y - 22
        for r in critical:
            _set_fill(c, BLACK)
            c.setFont('Helvetica', 7.5)
            c.drawString(MARGIN_L + 10, row_y,
                         f'• {r.get("test_name")}: {r.get("value")} {r.get("unit","")}'
                         f' [{r.get("flag")}] — {r.get("reference_range","")}')
            row_y -= 12
        y = row_y - 8

    # Signature block
    if y < MARGIN_B + 80:
        _draw_footer(c, pqc_hash, lab_manager, page_num, lang=lang)
        c.showPage()
        page_num += 1
        _draw_header(c, hospital_name, _t('title.sigs', lang),
                     patient.get('name', ''), patient.get('pid', ''), now_str, page_num, total_pages, lang=lang)
        y = A4_H - HEADER_H - 30

    y -= 10
    _draw_signatures(c, y, [
        _t('sig.tech', lang),
        _t('sig.validator', lang),
        _t('sig.manager', lang),
    ])

    _draw_footer(c, pqc_hash, lab_manager, page_num, lang=lang)
    c.save()
    return buf.getvalue()


def generate_cbc_report(
    patient: dict,
    cbc_data: dict,
    hospital_name: str = 'JORINOVA NEXUS Hospital',
    analyzer_name: str = 'Sysmex XN-Series',
    pqc_hash: str      = '',
    lang: str          = 'en',
) -> bytes:
    """
    Generate a Sysmex-format CBC report with all parameters + differential.
    Includes mini bar charts for WBC differential.
    """
    from reportlab.pdfgen import canvas as Canvas
    from reportlab.lib.pagesizes import A4

    buf = io.BytesIO()
    c   = Canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f'CBC Report — {patient.get("name", "Patient")}')
    now_str = datetime.now().strftime('%A, %d %B %Y  %H:%M')

    _draw_header(c, hospital_name, _t('cbc.title', lang),
                 patient.get('name', ''), patient.get('pid', ''),
                 now_str, 1, 1, lang=lang)

    y = A4_H - HEADER_H - 12

    # Patient info (compact)
    y = _draw_section(c, y, '📋 ' + _t('patient', lang) + '  ·  ' + analyzer_name)
    _set_fill(c, GRAY_LIGHT)
    c.rect(MARGIN_L, y - 26, MARGIN_R - MARGIN_L, 26, fill=1, stroke=0)
    info = [
        (_t('f.name', lang), patient.get('name','—')),  (_t('pid', lang), patient.get('pid','—')),
        (_t('f.sex', lang),  patient.get('sex','—')),   (_t('f.age', lang), patient.get('age','—')),
        (_t('f.date', lang), now_str[:16]),
    ]
    col_w = (MARGIN_R - MARGIN_L) / len(info)
    for i,(lbl,val) in enumerate(info):
        cx = MARGIN_L + i * col_w + 6
        _set_fill(c, GRAY_MID); c.setFont('Helvetica-Bold', 6.5)
        c.drawString(cx, y - 10, lbl)
        _set_fill(c, BLACK); c.setFont('Helvetica', 7.5)
        c.drawString(cx, y - 20, str(val)[:20])
    y -= 34

    # CBC parameters — two-column layout
    cbc_params = [
        # (label, key, unit, ref_lo_M, ref_hi_M, ref_lo_F, ref_hi_F, crit_lo, crit_hi)
        ('Haemoglobin',  'hgb',   'g/dL',    13.0, 17.5, 12.0, 15.5, 7.0,  None),
        ('RBC',          'rbc',   '×10¹²/L', 4.5,  5.9,  4.0,  5.2,  None, None),
        ('Haematocrit',  'hct',   '%',        40,   52,   36,   48,   None, None),
        ('MCV',          'mcv',   'fL',       80,   100,  80,   100,  None, None),
        ('MCH',          'mch',   'pg',       27,   33,   27,   33,   None, None),
        ('MCHC',         'mchc',  'g/dL',     31.5, 35.5, 31.5, 35.5, None, None),
        ('RDW-CV',       'rdw',   '%',        11.5, 14.5, 11.5, 14.5, None, None),
        ('WBC',          'wbc',   '×10³/µL',  4.0,  11.0, 4.0,  11.0, 2.0,  30.0),
        ('Platelets',    'plt',   '×10³/µL',  150,  450,  150,  450,  20,   1000),
        ('MPV',          'mpv',   'fL',       7.5,  12.5, 7.5,  12.5, None, None),
    ]
    sex = patient.get('sex','M')
    y = _draw_section(c, y, '🩸 ' + _t('cbc.params', lang))

    mid = (MARGIN_L + MARGIN_R) / 2
    # Column headers
    _hp, _hr, _hu, _hf = _t('h.parameter', lang), _t('tbl.result', lang), _t('tbl.unit', lang), _t('tbl.flag', lang)
    _hrr = _t('h.refrange', lang)
    for cx,lbl in [(MARGIN_L+4,_hp),(MARGIN_L+130,_hr),(MARGIN_L+175,_hu),
                   (MARGIN_L+220,_hrr),(MARGIN_L+300,_hf),
                   (mid+4,_hp),(mid+130,_hr),(mid+175,_hu),
                   (mid+220,_hrr),(mid+300,_hf)]:
        _set_fill(c, GRAY_MID); c.setFont('Helvetica-Bold', 6.5)
        c.drawString(cx, y, lbl)
    y -= 4

    def draw_param_row(p, x_offset, row_y):
        label, key, unit, lo_m, hi_m, lo_f, hi_f, crit_lo, crit_hi = p
        val = cbc_data.get(key)
        lo  = lo_f if sex == 'F' else lo_m
        hi  = hi_f if sex == 'F' else hi_m
        ref = f'{lo}–{hi}'
        flag = 'N'
        if val is not None:
            v = float(val)
            if crit_hi and v > crit_hi: flag = 'HH'
            elif crit_lo and v < crit_lo: flag = 'LL'
            elif v > hi: flag = 'H'
            elif v < lo: flag = 'L'
        clr = {
            'HH': RED, 'LL': BLUE, 'H': ORANGE, 'L': '#2563eb', 'N': GREEN
        }.get(flag, GRAY_MID)

        _set_fill(c, BLACK); c.setFont('Helvetica', 7.5)
        c.drawString(x_offset + 4, row_y, label)
        _set_fill(c, clr); c.setFont('Helvetica-Bold', 8)
        c.drawString(x_offset + 130, row_y, str(val) if val is not None else '—')
        _set_fill(c, GRAY_MID); c.setFont('Helvetica', 7)
        c.drawString(x_offset + 175, row_y, unit)
        c.drawString(x_offset + 220, row_y, ref)
        if flag != 'N':
            _set_fill(c, clr)
            c.roundRect(x_offset + 295, row_y - 2, 30, 11, 2, fill=1, stroke=0)
            _set_fill(c, WHITE); c.setFont('Helvetica-Bold', 6)
            c.drawCentredString(x_offset + 310, row_y + 2, flag)

    params_l = cbc_params[:5]
    params_r = cbc_params[5:]
    for i, (pl, pr) in enumerate(zip(params_l, params_r)):
        row_y = y - (i+1) * 14
        if i % 2 == 0:
            _set_fill(c, '#f7fdff')
            c.rect(MARGIN_L, row_y - 3, (MARGIN_R - MARGIN_L)/2 - 2, 13, fill=1, stroke=0)
            c.rect(mid + 2, row_y - 3, (MARGIN_R - MARGIN_L)/2 - 2, 13, fill=1, stroke=0)
        draw_param_row(pl, MARGIN_L, row_y)
        draw_param_row(pr, mid,      row_y)
    y -= len(params_l) * 14 + 10

    # WBC Differential
    diff_params = [
        ('Neutrophils', 'neut_pct', 'neut_abs', '%', '×10³/µL', 40, 75, 1.8, 7.5, '#3b82f6'),
        ('Lymphocytes', 'lymph_pct','lymph_abs','%', '×10³/µL', 20, 45, 1.0, 4.5, '#10b981'),
        ('Monocytes',   'mono_pct', 'mono_abs', '%', '×10³/µL',  2, 10, 0.2, 1.0, '#f59e0b'),
        ('Eosinophils', 'eos_pct',  'eos_abs',  '%', '×10³/µL',  1,  6, 0.0, 0.5, '#f97316'),
        ('Basophils',   'bas_pct',  'bas_abs',  '%', '×10³/µL',  0,  1, 0.0, 0.1, '#8b5cf6'),
    ]
    y = _draw_section(c, y, '🔬 ' + _t('cbc.wbc_diff', lang))

    # Header
    for hx, hl in [(MARGIN_L+4,_t('h.cell_type', lang)),(MARGIN_L+130,'%'),(MARGIN_L+180,'# ×10³/µL'),
                   (MARGIN_L+250,_t('h.ref_pct', lang)),(MARGIN_L+310,_t('h.bar', lang))]:
        _set_fill(c, GRAY_MID); c.setFont('Helvetica-Bold', 6.5)
        c.drawString(hx, y, hl)
    y -= 4

    wbc = float(cbc_data.get('wbc') or 0)
    for i, (name, pct_key, abs_key, pct_u, abs_u, lo_p, hi_p, lo_a, hi_a, color) in enumerate(diff_params):
        pct = cbc_data.get(pct_key)
        abs_v = cbc_data.get(abs_key)
        row_y = y - (i+1) * 15
        if i % 2 == 0:
            _set_fill(c, GRAY_LIGHT)
            c.rect(MARGIN_L, row_y - 4, MARGIN_R - MARGIN_L, 14, fill=1, stroke=0)

        _set_fill(c, BLACK); c.setFont('Helvetica', 7.5); c.drawString(MARGIN_L+4, row_y, name)

        flag_p = 'N'
        if pct is not None:
            if float(pct) > hi_p: flag_p = 'H'
            elif float(pct) < lo_p: flag_p = 'L'
        clr_p = {'H': ORANGE,'L': '#2563eb','N': BLACK}.get(flag_p, BLACK)
        _set_fill(c, clr_p); c.setFont('Helvetica-Bold', 8)
        c.drawString(MARGIN_L+130, row_y, f'{pct}%' if pct is not None else '—')

        _set_fill(c, GRAY_MID); c.setFont('Helvetica', 7.5)
        c.drawString(MARGIN_L+180, row_y, str(abs_v) if abs_v is not None else '—')
        c.drawString(MARGIN_L+250, row_y, f'{lo_p}–{hi_p}%')

        # Mini bar
        bar_x, bar_w = MARGIN_L + 310, 130
        bar_lo  = lo_p / 100 * bar_w
        bar_hi  = hi_p / 100 * bar_w
        bar_val = min(float(pct or 0) / 100 * bar_w, bar_w)
        _set_fill(c, '#e4e8f0')
        c.rect(bar_x, row_y - 2, bar_w, 9, fill=1, stroke=0)
        _set_fill(c, '#bae6fd')
        c.rect(bar_x + bar_lo, row_y - 2, bar_hi - bar_lo, 9, fill=1, stroke=0)
        _set_fill(c, color)
        c.rect(bar_x, row_y - 2, bar_val, 9, fill=1, stroke=0)

    y -= len(diff_params) * 15 + 12

    # Interpretation note
    y -= 5
    _draw_section(c, y, '⚠️ ' + _t('cbc.disclaimer_hdr', lang))
    y -= 14
    _set_fill(c, GRAY_MID); c.setFont('Helvetica', 6.5)
    c.drawString(MARGIN_L + 4, y, _t('cbc.disclaimer1', lang))
    y -= 10
    c.drawString(MARGIN_L + 4, y, _t('cbc.disclaimer2', lang))
    y -= 18

    _draw_signatures(c, y, [
        _t('sig.tech', lang), _t('sig.validator', lang), _t('sig.pathologist', lang),
    ])
    _draw_footer(c, pqc_hash, '', 1, lang=lang)
    c.save()
    return buf.getvalue()


def generate_critical_value_report(
    patient: dict,
    critical_results: list[dict],
    clinician_notified: str,
    notification_method: str,
    readback_confirmed: bool,
    hospital_name: str = 'JORINOVA NEXUS Hospital',
    pqc_hash: str = '',
    lang: str = 'en',
) -> bytes:
    """Generate a Critical Value Notification Report (ISO 15189 required)."""
    from reportlab.pdfgen import canvas as Canvas
    from reportlab.lib.pagesizes import A4

    buf = io.BytesIO()
    c   = Canvas.Canvas(buf, pagesize=A4)
    now_str = datetime.now().strftime('%A, %d %B %Y  %H:%M')

    _draw_header(c, hospital_name, _t('crit.report_title', lang),
                 patient.get('name',''), patient.get('pid',''), now_str, 1, 1, lang=lang)

    y = A4_H - HEADER_H - 12

    # Big red banner
    _set_fill(c, '#fee2e2')
    c.rect(MARGIN_L, y - 40, MARGIN_R - MARGIN_L, 40, fill=1, stroke=0)
    _set_stroke(c, RED); c.setLineWidth(2)
    c.rect(MARGIN_L, y - 40, MARGIN_R - MARGIN_L, 40, fill=0, stroke=1)
    _set_fill(c, RED); c.setFont('Helvetica-Bold', 12)
    c.drawCentredString((MARGIN_L+MARGIN_R)/2, y - 18, _t('crit.banner', lang))
    _set_fill(c, '#7f1d1d'); c.setFont('Helvetica', 8)
    c.drawCentredString((MARGIN_L+MARGIN_R)/2, y - 32, _t('crit.archived', lang))
    y -= 52

    y = _draw_section(c, y, '📋 ' + _t('sec.patient', lang))
    y = _draw_patient_block(c, y, patient, lang=lang)
    y -= 4

    y = _draw_section(c, y, '🚨 ' + _t('crit.results', lang))
    for r in critical_results:
        y -= 4
        _set_fill(c, '#fff0f0')
        c.rect(MARGIN_L, y - 26, MARGIN_R - MARGIN_L, 26, fill=1, stroke=0)
        _set_fill(c, RED); c.setFont('Helvetica-Bold', 9)
        c.drawString(MARGIN_L + 8, y - 10,
                     f'{r.get("test_name")}: {r.get("value")} {r.get("unit","")} [{r.get("flag")}]')
        _set_fill(c, BLACK); c.setFont('Helvetica', 7.5)
        c.drawString(MARGIN_L + 8, y - 20,
                     f'{_t("crit.ref", lang)}: {r.get("reference_range","—")}  |  {r.get("interpretation", _t("crit.default_interp", lang))[:80]}')
        y -= 30

    y -= 4
    y = _draw_section(c, y, '📞 ' + _t('crit.notif_record', lang))
    _readback_txt = _t('crit.readback_yes', lang) if readback_confirmed else _t('crit.readback_no', lang)
    fields = [
        (_t('crit.f.notified', lang), clinician_notified),
        (_t('crit.f.method', lang), notification_method),
        (_t('crit.f.readback', lang), _readback_txt),
        (_t('crit.f.time', lang), now_str),
        (_t('sig.notifying', lang), _t('crit.see_sig', lang)),
    ]
    _set_fill(c, GRAY_LIGHT)
    c.rect(MARGIN_L, y - (len(fields)*14+6), MARGIN_R - MARGIN_L, len(fields)*14+6, fill=1, stroke=0)
    row_y = y - 4
    _no_marker = _t('crit.readback_no', lang)
    for lbl, val in fields:
        _set_fill(c, GRAY_MID); c.setFont('Helvetica-Bold', 7.5)
        c.drawString(MARGIN_L + 6, row_y, lbl + ':')
        _set_fill(c, RED if str(val) == _no_marker else BLACK)
        c.setFont('Helvetica', 7.5)
        c.drawString(MARGIN_L + 140, row_y, str(val))
        row_y -= 14
    y = row_y - 10

    _draw_signatures(c, y - 20, [_t('sig.notifying', lang), _t('sig.lab_manager', lang), _t('sig.clinician_ack', lang)])
    _draw_footer(c, pqc_hash, '', 1, lang=lang)
    c.save()
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
#  THERMAL SPECIMEN LABEL  (57 mm × 32 mm — standard lab tube label)
# ══════════════════════════════════════════════════════════════════════════════

# Label dimensions in points (1 mm = 2.835 pt)
LABEL_W_MM = 57
LABEL_H_MM = 32
LABEL_W = LABEL_W_MM * 2.835
LABEL_H = LABEL_H_MM * 2.835

# Tube colour → RGB for the left stripe (CLSI/ISO standard cap colours)
_TUBE_COLORS: dict[str, tuple] = {
    # Haematology
    'lavender':    (0.78, 0.69, 0.87),  # EDTA K2/K3 — CBC, HbA1c, CD4, VL
    'purple':      (0.50, 0.20, 0.60),  # EDTA (alternate) / bone marrow / anaerobic BC
    'dark-purple': (0.38, 0.10, 0.50),  # Blood culture anaerobic bottle
    # Coagulation
    'light-blue':  (0.48, 0.83, 0.98),  # Sodium citrate 3.2% — PT, INR, APTT, D-Dimer
    'blue':        (0.20, 0.40, 0.75),  # Citrate (alternate name)
    # Biochemistry
    'gold':        (0.98, 0.75, 0.15),  # SST gold/tiger — all biochemistry, serology, hormones
    'yellow':      (0.90, 0.80, 0.10),  # SST alt / urine container / ACD
    'yellow-acd':  (0.95, 0.85, 0.05),  # ACD solution A/B — blood banking/DNA
    'amber':       (0.85, 0.60, 0.10),  # 24h urine collection
    'red':         (0.85, 0.20, 0.20),  # Plain clot activator — serology, cross-match
    'green':       (0.20, 0.65, 0.20),  # Lithium heparin — chemistry, ABG, Li levels
    'light-green': (0.55, 0.85, 0.55),  # PST (plasma separator) — some chemistry
    'grey':        (0.50, 0.50, 0.50),  # Fluoride-oxalate — glucose, lactate, alcohol
    'royal-blue':  (0.12, 0.30, 0.75),  # Trace elements / ESR Westergren
    # Microbiology
    'orange':      (0.95, 0.55, 0.10),  # Blood culture aerobic bottle
    'brown':       (0.55, 0.35, 0.20),  # Stool container
    'white':       (0.96, 0.96, 0.96),  # Sputum / swab Amies / universal sterile
    'pink':        (0.98, 0.70, 0.80),  # Viral transport / NPS swab / cervical swab
    # Body fluids / other
    'clear':       (0.88, 0.94, 0.98),  # CSF / pleural / ascitic / synovial / BAL
    'formalin':    (0.85, 0.92, 0.85),  # Formalin biopsy container
    # Fallback
    'black':       (0.15, 0.15, 0.15),  # Expired / rejected label
}


def generate_specimen_label(data: dict, copies: int = 1) -> bytes:
    """
    Generate a thermal-format specimen label PDF.
    Each label is 57 mm × 32 mm — fits standard lab tube printers
    (Zebra, Brother, Godex, etc. set to 57 × 32 mm or 2.25 × 1.25 inch).

    `data` is the dict returned by worklist_service.build_label_data().
    `copies` prints the same label N times (one PDF page per copy).
    """
    from reportlab.pdfgen import canvas as Canvas
    from reportlab.lib.pagesizes import mm
    from reportlab.graphics.barcode import code128
    from reportlab.graphics import renderPDF
    from reportlab.graphics.shapes import Drawing

    buf = io.BytesIO()
    page_size = (LABEL_W, LABEL_H)

    c = Canvas.Canvas(buf, pagesize=page_size)

    for copy_n in range(copies):
        if copy_n > 0:
            c.showPage()

        # ── Background — faint wash of the specimen/tube colour so trays sort
        #    at a glance, kept light (~12% colour) so all text stays crisp ─────
        stripe_w = 6.5
        tube_color = (data.get('tube_color') or 'clear').lower()
        rgb = _TUBE_COLORS.get(tube_color, _TUBE_COLORS['clear'])
        bg  = tuple(comp * 0.12 + 0.88 for comp in rgb)
        c.setFillColorRGB(*bg)
        c.rect(0, 0, LABEL_W, LABEL_H, fill=1, stroke=0)

        # ── Left colour stripe (full-strength tube type indicator) ────────────
        c.setFillColorRGB(*rgb)
        c.rect(0, 0, stripe_w, LABEL_H, fill=1, stroke=0)

        # ── STAT / High-risk badge ────────────────────────────────────────────
        priority   = (data.get('priority') or 'ROUTINE').upper()
        is_hr      = data.get('is_high_risk', False)
        badge_x    = stripe_w + 2
        badge_y    = LABEL_H - 9
        if priority == 'STAT':
            c.setFillColorRGB(0.85, 0.10, 0.10)
            c.roundRect(badge_x, badge_y, 22, 7, 2, fill=1, stroke=0)
            c.setFillColorRGB(1, 1, 1)
            c.setFont('Helvetica-Bold', 5.5)
            c.drawString(badge_x + 3, badge_y + 1.5, 'STAT')
            badge_x += 26
        elif priority == 'URGENT':
            c.setFillColorRGB(0.90, 0.45, 0.00)
            c.roundRect(badge_x, badge_y, 28, 7, 2, fill=1, stroke=0)
            c.setFillColorRGB(1, 1, 1)
            c.setFont('Helvetica-Bold', 5.5)
            c.drawString(badge_x + 3, badge_y + 1.5, 'URGENT')
            badge_x += 32
        if is_hr:
            c.setFillColorRGB(0.50, 0.00, 0.00)
            c.roundRect(badge_x, badge_y, 20, 7, 2, fill=1, stroke=0)
            c.setFillColorRGB(1, 1, 1)
            c.setFont('Helvetica-Bold', 4.5)
            c.drawString(badge_x + 2, badge_y + 1.5, 'BSL-HR')

        # ── SID (big, top-left) ───────────────────────────────────────────────
        sid  = data.get('sid',  'SID-??')
        cid  = data.get('cid')
        c.setFillColorRGB(0.04, 0.57, 0.70)  # NEXUS cyan
        c.setFont('Helvetica-Bold', 11)
        c.drawString(stripe_w + 2, LABEL_H - 19, sid)

        # ── CID (culture plate ID) if present ────────────────────────────────
        if cid:
            c.setFillColorRGB(0.50, 0.10, 0.70)
            c.setFont('Helvetica-Bold', 7.5)
            c.drawString(stripe_w + 2, LABEL_H - 27, f'Plate: {cid}')

        # ── Rack / position number (top-right corner) ─────────────────────────
        rack = data.get('rack_number')
        if rack is not None:
            c.setFillColorRGB(0.30, 0.30, 0.30)
            c.setFont('Helvetica-Bold', 7)
            rack_label = f'Rack #{rack}'
            c.drawRightString(LABEL_W - 3, LABEL_H - 9, rack_label)

        # ── Patient name + PID ────────────────────────────────────────────────
        patient_name = (data.get('patient_name') or '—')[:28]
        pid          = data.get('pid', '—')
        c.setFillColorRGB(0.05, 0.05, 0.05)
        c.setFont('Helvetica-Bold', 7)
        c.drawString(stripe_w + 2, LABEL_H - 37, patient_name)
        c.setFont('Helvetica', 6)
        c.drawString(stripe_w + 2, LABEL_H - 44, f'PID: {pid}')

        # ── Specimen / test ───────────────────────────────────────────────────
        specimen   = (data.get('specimen') or data.get('specimen_acronym') or '—')[:20]
        test_names = (data.get('test_names') or '—')[:42]
        c.setFont('Helvetica-Bold', 6)
        c.drawString(stripe_w + 2, LABEL_H - 52, specimen)
        c.setFont('Helvetica', 5.5)
        c.drawString(stripe_w + 2, LABEL_H - 59, test_names)

        # ── Date + shift ──────────────────────────────────────────────────────
        dt_str  = data.get('date', '')
        shift   = data.get('shift', '')
        dept    = (data.get('department') or '').upper()[:14]
        c.setFillColorRGB(0.40, 0.40, 0.40)
        c.setFont('Helvetica', 5.2)
        c.drawString(stripe_w + 2, LABEL_H - 67, f'{dt_str}  {shift}  {dept}')

        # ── Barcode (Code 128, human-readable below) ──────────────────────────
        barcode_val = data.get('barcode') or sid
        try:
            bc = code128.Code128(
                barcode_val,
                barWidth  = 1.0,
                barHeight = 18,
                humanReadable = True,
                fontSize  = 5,
                fontName  = 'Helvetica',
                quiet     = False,
            )
            # Draw barcode in the lower-right area of the label
            bc_w = bc.width
            bc_x = LABEL_W - bc_w - 3
            bc_y = 3
            bc.drawOn(c, bc_x, bc_y)
        except Exception as e:
            log.warning('Barcode render error: %s', e)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.setFont('Helvetica', 5)
            c.drawString(LABEL_W - 55, 5, barcode_val[-16:])

        # ── NEXUS watermark (very faint, bottom-left) ─────────────────────────
        c.setFillColorRGB(0.85, 0.93, 0.95)
        c.setFont('Helvetica', 4.5)
        c.drawString(stripe_w + 2, 3, 'NEXUS ALIS-X')

        # ── Border ────────────────────────────────────────────────────────────
        c.setStrokeColorRGB(0.75, 0.87, 0.93)
        c.setLineWidth(0.5)
        c.rect(0, 0, LABEL_W, LABEL_H, fill=0, stroke=1)

    c.save()
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
#  MICROSCOPY SLIDE LABEL  (25 mm × 18 mm — fits the frosted end of a glass slide)
# ══════════════════════════════════════════════════════════════════════════════

SLIDE_LABEL_W = 25 * 2.835
SLIDE_LABEL_H = 18 * 2.835


def generate_slide_label(data: dict, copies: int = 1) -> bytes:
    """
    Generate a tiny microscopy-slide label that fits the frosted end of a
    standard 75 × 25 mm glass slide. Holds the slide/accession ID, patient
    name, PID, stain, and a compact Code-128 barcode whose human-readable
    digits are the backup scan number if the barcode smudges.

    `data` keys (all optional): sid|slide_id|accession, patient_name, pid,
    stain|test_names, barcode, tube_color|color.
    """
    from reportlab.pdfgen import canvas as Canvas
    from reportlab.graphics.barcode import code128

    buf = io.BytesIO()
    W, H = SLIDE_LABEL_W, SLIDE_LABEL_H
    c = Canvas.Canvas(buf, pagesize=(W, H))

    for copy_n in range(copies):
        if copy_n > 0:
            c.showPage()

        # Faint colour wash by stain/department for at-a-glance sorting
        col = (data.get('tube_color') or data.get('color') or 'clear').lower()
        rgb = _TUBE_COLORS.get(col, _TUBE_COLORS['clear'])
        bg  = tuple(comp * 0.10 + 0.90 for comp in rgb)
        c.setFillColorRGB(*bg)
        c.rect(0, 0, W, H, fill=1, stroke=0)

        # Top cyan rule
        c.setFillColorRGB(0.04, 0.57, 0.70)
        c.rect(0, H - 2, W, 2, fill=1, stroke=0)

        # Slide / accession ID (bold cyan)
        sid = data.get('sid') or data.get('slide_id') or data.get('accession') or 'SLIDE-??'
        c.setFillColorRGB(0.04, 0.57, 0.70)
        c.setFont('Helvetica-Bold', 7)
        c.drawString(3, H - 10, str(sid)[:18])

        # Patient + PID + stain
        name = (data.get('patient_name') or '—')[:18]
        pid  = data.get('pid', '—')
        stain = (data.get('stain') or data.get('test_names') or '')[:14]
        c.setFillColorRGB(0.06, 0.06, 0.06)
        c.setFont('Helvetica-Bold', 5.5)
        c.drawString(3, H - 17, name)
        c.setFont('Helvetica', 5)
        c.drawString(3, H - 23, f'PID {pid}  {stain}'[:34])

        # Compact barcode at the bottom; human-readable digits = backup number
        bcval = str(data.get('barcode') or sid)
        try:
            bc = code128.Code128(bcval, barWidth=0.45, barHeight=9,
                                 humanReadable=True, fontSize=4,
                                 fontName='Helvetica', quiet=False)
            bc.drawOn(c, 3, 1)
        except Exception:
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.setFont('Helvetica', 4.5)
            c.drawString(3, 2, bcval[-18:])

        # Border
        c.setStrokeColorRGB(0.75, 0.87, 0.93)
        c.setLineWidth(0.4)
        c.rect(0, 0, W, H, fill=0, stroke=1)

    c.save()
    return buf.getvalue()
