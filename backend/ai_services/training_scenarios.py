"""
Training Scenarios Catalog
==========================
Static catalog of guided demos / training scenarios. Each scenario is a sequence
of steps that the frontend training runner executes (move virtual cursor, narrate,
perform a UI action, dwell).

Steps are intentionally UI-agnostic: they reference logical scene IDs and CSS
selectors that the corresponding scene component on the frontend exposes.
This file is the single source of truth — the frontend fetches it via
GET /api/v1/training/scenarios.
"""
from __future__ import annotations

from typing import Any


# Step shape:
#   id              str          — unique within the scenario
#   scene           str          — frontend scene component identifier
#   target          str | None   — CSS selector inside the scene; null = no movement
#   voice           str          — TTS narration
#   action          str | None   — click | type | highlight | flash | navigate | dwell
#   payload         dict | None  — action-specific data (text to type, css class …)
#   dwell_ms        int          — pause AFTER the action before the next step

SCENARIOS: list[dict[str, Any]] = [
    {
        'id':         'specimen_intake_stat',
        'title':      'Receive a STAT sample',
        'description': 'Walk through scanning a STAT-priority barcode, looking up the patient, and printing aliquot labels.',
        'duration_minutes': 2,
        'roles':      ['receptionist', 'lab_technician', 'lab_manager'],
        'modules':    ['reception', 'worklist'],
        'scenes':     ['specimen_intake'],
        'data_source': {
            'entity':     'lab_request',
            'feature_id': 'specimen_intake_stat',
            'filter':     {'priority': 'stat'},
        },
        'steps': [
            {
                'id':     'intro',
                'scene':  'specimen_intake',
                'target': None,
                'voice':  'Welcome. We will walk through receiving a STAT priority specimen.',
                'action': 'dwell',
                'dwell_ms': 700,
            },
            {
                'id':     'focus_scanner',
                'scene':  'specimen_intake',
                'target': '[data-train="scanner"]',
                'voice':  'First, place the cursor in the barcode scanner field.',
                'action': 'click',
                'dwell_ms': 400,
            },
            {
                'id':     'type_barcode',
                'scene':  'specimen_intake',
                'target': '[data-train="scanner"]',
                'voice':  'Now we simulate scanning the tube. Barcode S-I-D dash zero-one-zero-one.',
                'action': 'type',
                'payload': {'text': 'SID-0101', 'into': '[data-train="scanner"]'},
                'dwell_ms': 600,
            },
            {
                'id':     'highlight_patient',
                'scene':  'specimen_intake',
                'target': '[data-train="patient-card"]',
                'voice':  'The patient is now identified: Mary Uwineza, female, twenty-eight years old.',
                'action': 'highlight',
                'payload': {'cls': 'trainPulseBlue'},
                'dwell_ms': 800,
            },
            {
                'id':     'flag_priority',
                'scene':  'specimen_intake',
                'target': '[data-train="priority-chip"]',
                'voice':  'Priority is STAT. The system will route this specimen to the front of the worklist.',
                'action': 'flash',
                'payload': {'cls': 'trainPulseRed'},
                'dwell_ms': 1000,
            },
            {
                'id':     'print_labels',
                'scene':  'specimen_intake',
                'target': '[data-train="print-btn"]',
                'voice':  'Click Print to generate the aliquot labels.',
                'action': 'click',
                'payload': {'cls': 'trainPrinted'},
                'dwell_ms': 700,
            },
            {
                'id':     'done',
                'scene':  'specimen_intake',
                'target': '[data-train="status"]',
                'voice':  'Labels printed. The specimen is now in the worklist with STAT priority.',
                'action': 'highlight',
                'payload': {'cls': 'trainPulseGreen'},
                'dwell_ms': 600,
            },
        ],
    },
    {
        'id':         'critical_value_validation',
        'title':      'Validate a critical CBC',
        'description': 'A CBC came back with elevated WBC. Review the data, acknowledge the flag, and authorize the result.',
        'duration_minutes': 2,
        'roles':      ['lab_technician', 'pathologist', 'lab_manager'],
        'modules':    ['hematology', 'laboratory'],
        'scenes':     ['critical_cbc'],
        'data_source': {
            'entity':     'lab_request',
            'feature_id': 'critical_cbc',
            'filter':     {'has_critical_result': True},
        },
        'steps': [
            {
                'id':     'intro',
                'scene':  'critical_cbc',
                'target': None,
                'voice':  'Welcome. This scenario reviews a CBC with a critical White Blood Cell count.',
                'action': 'dwell',
                'dwell_ms': 700,
            },
            {
                'id':     'search_patient',
                'scene':  'critical_cbc',
                'target': '[data-train="search"]',
                'voice':  'Accessing patient records for ID One-Zero-One.',
                'action': 'type',
                'payload': {'text': 'One-Zero-One', 'into': '[data-train="search"]'},
                'dwell_ms': 500,
            },
            {
                'id':     'show_results',
                'scene':  'critical_cbc',
                'target': '[data-train="lab-panel"]',
                'voice':  'Analyzing laboratory data. Hemoglobin is normal, but White Blood Cell count is elevated at 15,000 cells per microliter. Flagging mild leukocytosis.',
                'action': 'flash',
                'payload': {'cls': 'trainPulseRed', 'target': '[data-train="wbc-row"]'},
                'dwell_ms': 1100,
            },
            {
                'id':     'approve',
                'scene':  'critical_cbc',
                'target': '[data-train="approve"]',
                'voice':  'No critical panic values exceed the threshold. Approving and signing the result under Jorinova Nexus protocols.',
                'action': 'click',
                'payload': {'cls': 'trainApproved'},
                'dwell_ms': 700,
            },
            {
                'id':     'done',
                'scene':  'critical_cbc',
                'target': '[data-train="approve"]',
                'voice':  'Authorized. Result has been digitally signed and transmitted.',
                'action': 'dwell',
                'dwell_ms': 500,
            },
        ],
    },
    {
        'id':         'lis_mapping_walkthrough',
        'title':      'Upload a lab request form (OCR)',
        'description': 'Drop a scanned request form and watch the system extract patient and tests, then confirm the worklist.',
        'duration_minutes': 2,
        'roles':      ['receptionist', 'lab_technician', 'lab_manager', 'super_admin'],
        'modules':    ['lis_mapping'],
        'scenes':     ['lis_mapping_demo'],
        'data_source': {
            'entity':     'lab_request',
            'feature_id': 'lis_mapping_walkthrough',
            'filter':     {},
        },
        'steps': [
            {
                'id':     'intro',
                'scene':  'lis_mapping_demo',
                'target': None,
                'voice':  'Welcome. We will demonstrate the LIS auto-mapping feature.',
                'action': 'dwell',
                'dwell_ms': 700,
            },
            {
                'id':     'highlight_drop',
                'scene':  'lis_mapping_demo',
                'target': '[data-train="dropzone"]',
                'voice':  'A scanned lab request is dropped into the upload area.',
                'action': 'highlight',
                'payload': {'cls': 'trainPulseBlue'},
                'dwell_ms': 700,
            },
            {
                'id':     'extract',
                'scene':  'lis_mapping_demo',
                'target': '[data-train="extract-btn"]',
                'voice':  'The Extract draft button starts the OCR and matching pipeline.',
                'action': 'click',
                'dwell_ms': 600,
            },
            {
                'id':     'reveal_draft',
                'scene':  'lis_mapping_demo',
                'target': '[data-train="draft"]',
                'voice':  'In a moment the patient, the tests, and the priority appear with confidence chips. CBC is expanded into nine individual tests.',
                'action': 'highlight',
                'payload': {'cls': 'trainRevealCard'},
                'dwell_ms': 1100,
            },
            {
                'id':     'confirm',
                'scene':  'lis_mapping_demo',
                'target': '[data-train="confirm-btn"]',
                'voice':  'After review, the user clicks Create LabRequest. The worklist is now populated.',
                'action': 'click',
                'payload': {'cls': 'trainApproved'},
                'dwell_ms': 800,
            },
            {
                'id':     'done',
                'scene':  'lis_mapping_demo',
                'target': '[data-train="result"]',
                'voice':  'LabRequest created. The end-to-end mapping is now complete.',
                'action': 'highlight',
                'payload': {'cls': 'trainPulseGreen'},
                'dwell_ms': 600,
            },
        ],
    },

    {
        'id':         'blood_bank_crossmatch_demo',
        'title':      'Blood bank: chamber/slot crossmatch',
        'description': 'Pick a bag from the slot grid, run an Indirect Antiglobulin crossmatch, and issue the unit under haemovigilance watch.',
        'duration_minutes': 3,
        'roles':      ['lab_technician', 'lab_manager', 'super_admin'],
        'modules':    ['blood_bank'],
        'scenes':     ['blood_bank_crossmatch'],
        'data_source': {
            'entity':     'blood_bag',
            'feature_id': 'blood_bank_crossmatch',
            'filter':     {},
        },
        'steps': [
            {'id': 'intro',          'scene': 'blood_bank_crossmatch', 'target': None,
             'voice': 'Welcome. We will demonstrate a blood-bank crossmatch with chamber and slot tracking.',
             'action': 'dwell', 'payload': None, 'dwell_ms': 700},
            {'id': 'show_bag',       'scene': 'blood_bank_crossmatch', 'target': '[data-train="bag-card"]',
             'voice': 'Here is the selected bag. The system shows blood group, component, volume, and expiry.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 900},
            {'id': 'show_slots',     'scene': 'blood_bank_crossmatch', 'target': '[data-train="slot-grid"]',
             'voice': 'The bag is tracked at the fridge, chamber, and numbered slot level. FIFO and FEFO rules picked this exact unit.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 1000},
            {'id': 'do_crossmatch',  'scene': 'blood_bank_crossmatch', 'target': '[data-train="crossmatch-btn"]',
             'voice': 'The technician triggers the Indirect Antiglobulin crossmatch.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
            {'id': 'issue_unit',     'scene': 'blood_bank_crossmatch', 'target': '[data-train="issue-btn"]',
             'voice': 'Compatible result. The unit is issued and the haemovigilance watch is armed.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
            {'id': 'done',           'scene': 'blood_bank_crossmatch', 'target': '[data-train="status"]',
             'voice': 'Transfusion clock started. Any reaction will auto-link to this bag.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseGreen'}, 'dwell_ms': 600},
        ],
    },

    {
        'id':         'momo_billing_demo',
        'title':      'MoMo payment at reception',
        'description': 'Confirm a lab bill, accept Mobile Money payment, capture the reference, and release the worklist.',
        'duration_minutes': 2,
        'roles':      ['receptionist', 'lab_manager', 'super_admin'],
        'modules':    ['billing'],
        'scenes':     ['momo_billing'],
        'data_source': {
            'entity':     'billing_record',
            'feature_id': 'momo_billing',
            'filter':     {},
        },
        'steps': [
            {'id': 'intro',         'scene': 'momo_billing', 'target': None,
             'voice': 'Welcome. We will accept a Mobile Money payment for a confirmed lab bill.',
             'action': 'dwell', 'payload': None, 'dwell_ms': 700},
            {'id': 'show_invoice',  'scene': 'momo_billing', 'target': '[data-train="invoice"]',
             'voice': 'The invoice was auto-generated from the requested tests using the test catalogue prices.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 900},
            {'id': 'type_ref',      'scene': 'momo_billing', 'target': '[data-train="momo-input"]',
             'voice': 'The receptionist enters the MoMo reference returned by the patient.',
             'action': 'type', 'payload': {'text': 'MTN-7842-3091', 'into': '[data-train="momo-input"]'}, 'dwell_ms': 600},
            {'id': 'confirm',       'scene': 'momo_billing', 'target': '[data-train="confirm-btn"]',
             'voice': 'Confirming the payment registers the receipt and matches it to the bill.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
            {'id': 'show_receipt',  'scene': 'momo_billing', 'target': '[data-train="receipt"]',
             'voice': 'The receipt now shows the MoMo reference, the method, and the paid amount.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseGreen'}, 'dwell_ms': 800},
            {'id': 'done',          'scene': 'momo_billing', 'target': '[data-train="status"]',
             'voice': 'The bill is settled. The worklist is now released to the analyzer floor.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseGreen'}, 'dwell_ms': 600},
        ],
    },

    {
        'id':         'medgenome_pcr_demo',
        'title':      'MedGenome: TB GeneXpert interpretation',
        'description': 'Review a GeneXpert MTB/RIF Ultra run, read the Ct value, check the rifampicin resistance call, then route the signal.',
        'duration_minutes': 3,
        'roles':      ['pathologist', 'lab_technician', 'lab_manager', 'super_admin'],
        'modules':    ['molecular'],
        'scenes':     ['medgenome_pcr'],
        'data_source': {
            'entity':     'pcr_result',
            'feature_id': 'medgenome_pcr',
            'filter':     {'category': 'TB'},
        },
        'steps': [
            {'id': 'intro',          'scene': 'medgenome_pcr', 'target': None,
             'voice': 'Welcome. We will interpret a GeneXpert MTB and Rif Ultra result.',
             'action': 'dwell', 'payload': None, 'dwell_ms': 700},
            {'id': 'show_pcr',       'scene': 'medgenome_pcr', 'target': '[data-train="pcr-card"]',
             'voice': 'Here is the PCR run, with the test name, instrument, cartridge, and result.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 900},
            {'id': 'show_ct',        'scene': 'medgenome_pcr', 'target': '[data-train="ct-value"]',
             'voice': 'The Cycle threshold value places this case in a medium bacillary load band.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 900},
            {'id': 'show_rif',       'scene': 'medgenome_pcr', 'target': '[data-train="resistance"]',
             'voice': 'Rifampicin resistance is checked. Detected resistance escalates to multi-drug-resistance protocol.',
             'action': 'flash', 'payload': {'cls': 'trainPulseRed'}, 'dwell_ms': 1000},
            {'id': 'interpret',      'scene': 'medgenome_pcr', 'target': '[data-train="interpret-btn"]',
             'voice': 'AI interpretation synthesises the Ct, semi-quant band, and resistance markers into a clinical summary.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
            {'id': 'route',          'scene': 'medgenome_pcr', 'target': '[data-train="route-btn"]',
             'voice': 'The case is routed into the molecular epidemiology surveillance signal pipeline.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
        ],
    },

    {
        'id':         'iot_analyzer_intake_demo',
        'title':      'IoT: any analyzer, one contract',
        'description': 'Demonstrate vendor-neutral analyzer ingestion. Pick an adapter, accept the payload, and watch the result normalise.',
        'duration_minutes': 2,
        'roles':      ['lab_technician', 'lab_manager', 'super_admin'],
        'modules':    ['interoperability', 'laboratory'],
        'scenes':     ['iot_analyzer_intake'],
        'data_source': None,
        'steps': [
            {'id': 'intro',         'scene': 'iot_analyzer_intake', 'target': None,
             'voice': 'Good day. Thank you for taking time today. This demo shows how any laboratory analyzer connects to the system.',
             'action': 'dwell', 'payload': None, 'dwell_ms': 800},
            {'id': 'show_list',     'scene': 'iot_analyzer_intake', 'target': '[data-train="adapter-list"]',
             'voice': 'Here is the live list of analyzer adapters. We are not locked to one brand. Sysmex, Roche, Mindray, BioRad, Beckman, any vendor can plug in.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 1100},
            {'id': 'show_selected', 'scene': 'iot_analyzer_intake', 'target': '[data-train="selected-adapter"]',
             'voice': 'When the technician selects an adapter, the system knows the wire format and the vendor.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 900},
            {'id': 'show_payload',  'scene': 'iot_analyzer_intake', 'target': '[data-train="payload-preview"]',
             'voice': 'This is what the analyzer sends. Some send HL7, some send ASTM, some send JSON or CSV. The adapter understands them all.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseBlue'}, 'dwell_ms': 1000},
            {'id': 'do_ingest',     'scene': 'iot_analyzer_intake', 'target': '[data-train="ingest-btn"]',
             'voice': 'Ingest into the laboratory information system.',
             'action': 'click', 'payload': {'cls': 'trainApproved'}, 'dwell_ms': 700},
            {'id': 'done',          'scene': 'iot_analyzer_intake', 'target': '[data-train="result-feed"]',
             'voice': 'All payloads end up in the same shape. Sample identifier, test code, value, flag. You are welcome. Have a nice day.',
             'action': 'highlight', 'payload': {'cls': 'trainPulseGreen'}, 'dwell_ms': 800},
        ],
    },
]


# ── Translations (fr / rw) ────────────────────────────────────────────────────
# English lives inline in SCENARIOS above (the source of truth). Here we hold the
# French and Kinyarwanda renderings keyed by scenario id. For each scenario:
#   title, description  → localized list/detail labels
#   steps[step_id]      → localized voice narration (only translatable steps)
# Anything missing falls back to the English value, so a partial pack never breaks.

_I18N: dict[str, dict[str, dict[str, Any]]] = {
    'fr': {
        'specimen_intake_stat': {
            'title':       'Réceptionner un échantillon STAT',
            'description': "Parcourez la lecture d'un code-barres prioritaire STAT, la recherche du patient et l'impression des étiquettes d'aliquotes.",
            'steps': {
                'intro':            "Bienvenue. Nous allons parcourir la réception d'un échantillon prioritaire STAT.",
                'focus_scanner':    "D'abord, placez le curseur dans le champ du lecteur de code-barres.",
                'type_barcode':     "Maintenant, nous simulons la lecture du tube. Code-barres S-I-D tiret zéro-un-zéro-un.",
                'highlight_patient':"Le patient est maintenant identifié : Mary Uwineza, femme, vingt-huit ans.",
                'flag_priority':    "La priorité est STAT. Le système placera cet échantillon en tête de la liste de travail.",
                'print_labels':     "Cliquez sur Imprimer pour générer les étiquettes d'aliquotes.",
                'done':             "Étiquettes imprimées. L'échantillon est maintenant dans la liste de travail avec la priorité STAT.",
            },
        },
        'critical_value_validation': {
            'title':       'Valider une NFS critique',
            'description': "Une NFS revient avec des globules blancs élevés. Examinez les données, confirmez l'alerte et autorisez le résultat.",
            'steps': {
                'intro':         "Bienvenue. Ce scénario examine une NFS avec un taux critique de globules blancs.",
                'search_patient':"Accès au dossier du patient ID un-zéro-un.",
                'show_results':  "Analyse des données. L'hémoglobine est normale, mais le taux de globules blancs est élevé à 15 000 cellules par microlitre. Signalement d'une leucocytose légère.",
                'approve':       "Aucune valeur critique ne dépasse le seuil. Approbation et signature du résultat selon les protocoles Jorinova Nexus.",
                'done':          "Autorisé. Le résultat a été signé numériquement et transmis.",
            },
        },
        'lis_mapping_walkthrough': {
            'title':       'Téléverser un formulaire de demande (OCR)',
            'description': "Déposez un formulaire numérisé et observez le système extraire le patient et les tests, puis confirmez la liste de travail.",
            'steps': {
                'intro':         "Bienvenue. Nous allons démontrer la fonction de mappage automatique LIS.",
                'highlight_drop':"Une demande de laboratoire numérisée est déposée dans la zone de téléversement.",
                'extract':       "Le bouton Extraire le brouillon lance le pipeline OCR et de correspondance.",
                'reveal_draft':  "Dans un instant, le patient, les tests et la priorité apparaissent avec des indices de confiance. La NFS est décomposée en neuf tests individuels.",
                'confirm':       "Après vérification, l'utilisateur clique sur Créer la demande. La liste de travail est maintenant remplie.",
                'done':          "Demande créée. Le mappage de bout en bout est maintenant terminé.",
            },
        },
        'blood_bank_crossmatch_demo': {
            'title':       'Banque de sang : compatibilité chambre/emplacement',
            'description': "Choisissez une poche dans la grille d'emplacements, effectuez une épreuve de compatibilité par antiglobuline indirecte et délivrez l'unité sous surveillance d'hémovigilance.",
            'steps': {
                'intro':        "Bienvenue. Nous allons démontrer une compatibilité de banque de sang avec suivi par chambre et emplacement.",
                'show_bag':     "Voici la poche sélectionnée. Le système affiche le groupe sanguin, le composant, le volume et la date d'expiration.",
                'show_slots':   "La poche est suivie au niveau du réfrigérateur, de la chambre et de l'emplacement numéroté. Les règles FIFO et FEFO ont sélectionné cette unité précise.",
                'do_crossmatch':"Le technicien lance la compatibilité par antiglobuline indirecte.",
                'issue_unit':   "Résultat compatible. L'unité est délivrée et la surveillance d'hémovigilance est activée.",
                'done':         "Le compte à rebours de la transfusion a démarré. Toute réaction sera automatiquement liée à cette poche.",
            },
        },
        'momo_billing_demo': {
            'title':       'Paiement MoMo à la réception',
            'description': "Confirmez une facture de laboratoire, acceptez le paiement Mobile Money, saisissez la référence et libérez la liste de travail.",
            'steps': {
                'intro':       "Bienvenue. Nous allons accepter un paiement Mobile Money pour une facture de laboratoire confirmée.",
                'show_invoice':"La facture a été générée automatiquement à partir des tests demandés selon les prix du catalogue.",
                'type_ref':    "Le réceptionniste saisit la référence MoMo communiquée par le patient.",
                'confirm':     "La confirmation du paiement enregistre le reçu et le rapproche de la facture.",
                'show_receipt':"Le reçu affiche maintenant la référence MoMo, le mode de paiement et le montant payé.",
                'done':        "La facture est réglée. La liste de travail est maintenant transmise au plateau technique.",
            },
        },
        'medgenome_pcr_demo': {
            'title':       'MedGenome : interprétation GeneXpert TB',
            'description': "Examinez un test GeneXpert MTB/RIF Ultra, lisez la valeur Ct, vérifiez la détection de résistance à la rifampicine, puis acheminez le signal.",
            'steps': {
                'intro':     "Bienvenue. Nous allons interpréter un résultat GeneXpert MTB et Rif Ultra.",
                'show_pcr':  "Voici le test PCR, avec le nom du test, l'instrument, la cartouche et le résultat.",
                'show_ct':   "La valeur du seuil de cycle place ce cas dans une bande de charge bacillaire moyenne.",
                'show_rif':  "La résistance à la rifampicine est vérifiée. Une résistance détectée déclenche le protocole de multirésistance.",
                'interpret': "L'interprétation IA synthétise le Ct, la bande semi-quantitative et les marqueurs de résistance en un résumé clinique.",
                'route':     "Le cas est acheminé dans le pipeline de signaux de surveillance épidémiologique moléculaire.",
            },
        },
        'iot_analyzer_intake_demo': {
            'title':       "IoT : n'importe quel analyseur, un seul contrat",
            'description': "Démontrez l'intégration d'analyseurs indépendante du fabricant. Choisissez un adaptateur, acceptez la charge utile et observez la normalisation du résultat.",
            'steps': {
                'intro':        "Bonjour. Merci de prendre le temps aujourd'hui. Cette démonstration montre comment n'importe quel analyseur de laboratoire se connecte au système.",
                'show_list':    "Voici la liste en direct des adaptateurs d'analyseurs. Nous ne sommes pas limités à une seule marque. Sysmex, Roche, Mindray, BioRad, Beckman, n'importe quel fournisseur peut se connecter.",
                'show_selected':"Lorsque le technicien sélectionne un adaptateur, le système connaît le format de transmission et le fournisseur.",
                'show_payload': "Voici ce que l'analyseur envoie. Certains envoient du HL7, d'autres de l'ASTM, d'autres du JSON ou du CSV. L'adaptateur les comprend tous.",
                'do_ingest':    "Intégrer dans le système d'information du laboratoire.",
                'done':         "Toutes les charges utiles aboutissent au même format. Identifiant d'échantillon, code de test, valeur, indicateur. Je vous en prie. Bonne journée.",
            },
        },
    },
    'rw': {
        'specimen_intake_stat': {
            'title':       'Kwakira icyitegererezo STAT',
            'description': "Reba uko basikana barcode ifite ibanga rya STAT, bashakisha umurwayi, kandi bacapa ibimenyetso by'uduce tw'icyitegererezo.",
            'steps': {
                'intro':            "Murakaza neza. Tugiye kureba uko twakira icyitegererezo gifite ibanga rya STAT.",
                'focus_scanner':    "Mbere, shyira indanga aho barcode isikanwa.",
                'type_barcode':     "Noneho twigana gusikana icupa. Barcode S-I-D agakwego zeru-rimwe-zeru-rimwe.",
                'highlight_patient':"Umurwayi yamenyekanye: Mary Uwineza, gore, imyaka makumyabiri n'umunani.",
                'flag_priority':    "Ibanga ni STAT. Sisitemu izashyira iki cyitegererezo imbere ku rutonde rw'akazi.",
                'print_labels':     "Kanda Capa kugira ngo ukore ibimenyetso by'uduce.",
                'done':             "Ibimenyetso byacapwe. Icyitegererezo kiri ku rutonde rw'akazi gifite ibanga rya STAT.",
            },
        },
        'critical_value_validation': {
            'title':       'Kwemeza CBC ihutirwa',
            'description': "CBC yagarutse ifite uturemangingo twera twinshi. Suzuma amakuru, wemere ikimenyetso, hanyuma wemeze igisubizo.",
            'steps': {
                'intro':         "Murakaza neza. Iki kigeragezo gisuzuma CBC ifite umubare uhutirwa w'uturemangingo twera.",
                'search_patient':"Gusoma idosiye y'umurwayi ID rimwe-zeru-rimwe.",
                'show_results':  "Gusesengura amakuru. Hemoglobine iri mu rugero, ariko uturemangingo twera turi hejuru kuri 15.000 ku microlitre. Kwerekana leukocytose yoroheje.",
                'approve':       "Nta gaciro gihutirwa karenze urugero. Kwemeza no gushyiraho umukono igisubizo hakurikijwe amabwiriza ya Jorinova Nexus.",
                'done':          "Byemejwe. Igisubizo cyashyizweho umukono wa digitale kandi cyoherejwe.",
            },
        },
        'lis_mapping_walkthrough': {
            'title':       'Kohereza ifishi ya demande (OCR)',
            'description': "Reka ifishi yasikanwe maze urebe sisitemu ikuramo umurwayi n'ibizamini, hanyuma wemeze urutonde rw'akazi.",
            'steps': {
                'intro':         "Murakaza neza. Tugiye kwerekana uburyo bwa LIS bwo guhuza byikora.",
                'highlight_drop':"Demande ya laboratwari yasikanwe ishyirwa mu kibanza cyo kohereza.",
                'extract':       "Buto yo Kuramo itangiza OCR no guhuza.",
                'reveal_draft':  "Mu kanya umurwayi, ibizamini, n'ibanga bigaragara hamwe n'ibimenyetso by'icyizere. CBC isaranganywamo ibizamini icyenda.",
                'confirm':       "Nyuma yo gusuzuma, ukoresha akanda Rema LabRequest. Urutonde rw'akazi rwuzuyemo.",
                'done':          "LabRequest yaremwe. Guhuza kuva ku ntangiriro kugeza ku iherezo byarangiye.",
            },
        },
        'blood_bank_crossmatch_demo': {
            'title':       "Banki y'amaraso: guhuza ku cyumba n'umwanya",
            'description': "Hitamo sashe mu mwanya, ukore guhuza kwa antiglobuline itaziguye, maze utange igice hari ubugenzuzi bw'amaraso.",
            'steps': {
                'intro':        "Murakaza neza. Tugiye kwerekana guhuza kw'amaraso hamwe no gukurikirana icyumba n'umwanya.",
                'show_bag':     "Dore sashe yatoranyijwe. Sisitemu yerekana itsinda ry'amaraso, igice, ingano, n'itariki yo kurangira.",
                'show_slots':   "Sashe ikurikiranwa ku rwego rwa frigo, icyumba, n'umwanya ufite nomero. Amategeko ya FIFO na FEFO yatoranyije iki gice.",
                'do_crossmatch':"Tekiniseni atangiza guhuza kwa antiglobuline itaziguye.",
                'issue_unit':   "Igisubizo gihuye. Igice gitanzwe kandi ubugenzuzi bw'amaraso bwatangijwe.",
                'done':         "Isaha yo gutera amaraso yatangiye. Igisubizo cyose kizahita gihuzwa n'iyi sashe.",
            },
        },
        'momo_billing_demo': {
            'title':       'Kwishyura MoMo ku iyakira',
            'description': "Emeza ifatura ya laboratwari, wakire kwishyura kwa Mobile Money, wandike référence, maze urekure urutonde rw'akazi.",
            'steps': {
                'intro':       "Murakaza neza. Tugiye kwakira kwishyura kwa Mobile Money ku ifatura ya laboratwari yemejwe.",
                'show_invoice':"Ifatura yakozwe byikora ishingiye ku bizamini byasabwe hakoreshejwe ibiciro byo mu rutonde.",
                'type_ref':    "Uwakira yandika référence ya MoMo yatanzwe n'umurwayi.",
                'confirm':     "Kwemeza kwishyura bwandika inyemezabwishyu kandi bibihuza n'ifatura.",
                'show_receipt':"Inyemezabwishyu noneho yerekana référence ya MoMo, uburyo, n'amafaranga yishyuwe.",
                'done':        "Ifatura yishyuwe. Urutonde rw'akazi noneho rwoherejwe aho bapima.",
            },
        },
        'medgenome_pcr_demo': {
            'title':       'MedGenome: gusobanura GeneXpert ya TB',
            'description': "Suzuma GeneXpert MTB/RIF Ultra, soma agaciro ka Ct, ugenzure kurwanya rifampicine, hanyuma woherereze ikimenyetso.",
            'steps': {
                'intro':     "Murakaza neza. Tugiye gusobanura igisubizo cya GeneXpert MTB na Rif Ultra.",
                'show_pcr':  "Dore igeragezwa rya PCR, hamwe n'izina ry'ikizamini, igikoresho, cartouche, n'igisubizo.",
                'show_ct':   "Agaciro ka Ct gashyira iki kibazo mu cyiciro cy'umutwaro wa bagiteri uringaniye.",
                'show_rif':  "Kurwanya rifampicine biragenzurwa. Iyo bigaragaye, bizamuka ku gahunda yo kurwanya imiti myinshi.",
                'interpret': "Isobanura rya AI rihuza Ct, icyiciro, n'ibimenyetso byo kurwanya mu ncamake y'ubuvuzi.",
                'route':     "Ikibazo cyoherezwa mu nzira yo gukurikiranira hafi icyorezo ku rwego rwa molekuler.",
            },
        },
        'iot_analyzer_intake_demo': {
            'title':       "IoT: igikoresho icyo ari cyo cyose, amasezerano amwe",
            'description': "Erekana uko ibikoresho byo mu bwoko bwose byinjizwa. Hitamo adaptateri, wakire payload, maze urebe igisubizo kihindurwamo imiterere imwe.",
            'steps': {
                'intro':        "Mwaramutse. Murakoze gufata umwanya uyu munsi. Iyi demo yerekana uko igikoresho cyose cya laboratwari gihuzwa na sisitemu.",
                'show_list':    "Dore urutonde nyacyo rw'adaptateri z'ibikoresho. Ntiturasibwa ku bwoko bumwe. Sysmex, Roche, Mindray, BioRad, Beckman, uwacuruza wese ashobora kwinjira.",
                'show_selected':"Iyo tekiniseni atoranyije adaptateri, sisitemu izi imiterere y'amakuru n'uwayikoze.",
                'show_payload': "Iki ni icyo igikoresho cyohereza. Bimwe byohereza HL7, ibindi ASTM, ibindi JSON cyangwa CSV. Adaptateri irabyumva byose.",
                'do_ingest':    "Injiza muri sisitemu y'amakuru ya laboratwari.",
                'done':         "Payload zose zigera ku miterere imwe. Indangacyitegererezo, kode y'ikizamini, agaciro, ikimenyetso. Murakoze. Mugire umunsi mwiza.",
            },
        },
    },
}


def _localize(scenario: dict[str, Any], lang: str) -> dict[str, Any]:
    """Return a shallow copy of `scenario` with title/description/step voice swapped
    to `lang`. Falls back to English for any missing key. Always stamps `language`
    so the frontend TTS picks the right voice."""
    lang = (lang or 'en').lower().split('-')[0]
    if lang == 'en' or lang not in _I18N:
        return {**scenario, 'language': 'en'}
    pack = _I18N[lang].get(scenario['id'], {})
    step_tx = pack.get('steps', {})
    steps = [
        {**step, 'voice': step_tx.get(step.get('id'), step['voice'])}
        for step in scenario.get('steps', [])
    ]
    return {
        **scenario,
        'title':       pack.get('title', scenario['title']),
        'description': pack.get('description', scenario['description']),
        'steps':       steps,
        'language':    lang,
    }


def list_scenarios(lang: str = 'en') -> list[dict[str, Any]]:
    """Return summary view for the picker (no step bodies), localized to `lang`."""
    out = []
    for s in SCENARIOS:
        loc = _localize(s, lang)
        out.append({
            'id':                loc['id'],
            'title':             loc['title'],
            'description':       loc['description'],
            'duration_minutes':  loc['duration_minutes'],
            'roles':             loc['roles'],
            'modules':           loc['modules'],
            'scenes':            loc['scenes'],
            'step_count':        len(s['steps']),
            'language':          loc['language'],
        })
    return out


def get_scenario(scenario_id: str, lang: str = 'en') -> dict[str, Any] | None:
    """Return the full scenario including steps, localized to `lang`."""
    for s in SCENARIOS:
        if s['id'] == scenario_id:
            return _localize(s, lang)
    return None
    return None
