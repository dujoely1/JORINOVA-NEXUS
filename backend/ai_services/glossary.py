"""
Medical/lab terms, abbreviations & acronyms — EN + FR. Used by the RAG, voice and
interpretation layers. lookup(query) matches by abbreviation or term (either language).
Extend freely; keep entries short.
"""
# abbr: (term_en, definition_en, term_fr, definition_fr)
GLOSSARY = {
    'CBC':   ('Complete Blood Count', 'Full haematology panel: WBC, RBC, Hb, HCT, indices, platelets',
              'Numération Formule Sanguine (NFS)', 'Hémogramme complet: GB, GR, Hb, HCT, plaquettes'),
    'FBC':   ('Full Blood Count', 'Same as CBC', 'NFS', 'Idem NFS'),
    'WBC':   ('White Blood Cells', 'Leukocytes; infection/inflammation marker', 'Globules Blancs (GB)', 'Leucocytes'),
    'RBC':   ('Red Blood Cells', 'Erythrocytes', 'Globules Rouges (GR)', 'Érythrocytes'),
    'Hb':    ('Haemoglobin', 'Oxygen-carrying protein; low = anaemia', 'Hémoglobine', 'Basse = anémie'),
    'HCT':   ('Haematocrit', 'RBC volume fraction', 'Hématocrite', 'Fraction volumique des GR'),
    'MCV':   ('Mean Corpuscular Volume', 'RBC size; classifies anaemia', 'Volume Globulaire Moyen (VGM)', 'Taille des GR'),
    'MCH':   ('Mean Corpuscular Haemoglobin', 'Hb per RBC', 'Teneur Corpusculaire Moyenne (TCMH)', 'Hb par GR'),
    'MCHC':  ('Mean Corpuscular Hb Concentration', 'Hb concentration in RBC', 'CCMH', 'Concentration Hb des GR'),
    'PLT':   ('Platelets', 'Thrombocytes; clotting', 'Plaquettes', 'Thrombocytes; coagulation'),
    'ESR':   ('Erythrocyte Sedimentation Rate', 'Non-specific inflammation', 'Vitesse de Sédimentation (VS)', 'Inflammation'),
    'CRP':   ('C-Reactive Protein', 'Acute-phase inflammation marker', 'Protéine C-Réactive (CRP)', "Marqueur d'inflammation"),
    'PT':    ('Prothrombin Time', 'Extrinsic coagulation pathway', 'Temps de Prothrombine (TP)', 'Voie extrinsèque'),
    'INR':   ('International Normalized Ratio', 'Standardised PT; warfarin monitoring', 'INR', 'TP standardisé (AVK)'),
    'APTT':  ('Activated Partial Thromboplastin Time', 'Intrinsic pathway; heparin', 'TCA', 'Voie intrinsèque; héparine'),
    'D-dimer':('D-dimer', 'Fibrin degradation; rules out VTE', 'D-dimères', 'Exclusion de thrombose'),
    'TAT':   ('Turn-Around Time', 'Time from sample to result', "Délai de rendu", 'Prélèvement → résultat'),
    'HbA1c': ('Glycated Haemoglobin', '3-month average glucose; diabetes', 'Hémoglobine glyquée', 'Glycémie moyenne 3 mois'),
    'FBS':   ('Fasting Blood Sugar', 'Fasting glucose', 'Glycémie à jeun', 'Glucose à jeun'),
    'RBS':   ('Random Blood Sugar', 'Random glucose', 'Glycémie aléatoire', 'Glucose aléatoire'),
    'LFT':   ('Liver Function Tests', 'ALT, AST, ALP, bilirubin, albumin', 'Bilan hépatique', 'ALAT, ASAT, PAL, bilirubine'),
    'RFT':   ('Renal Function Tests', 'Urea, creatinine, electrolytes', 'Bilan rénal', 'Urée, créatinine, ionogramme'),
    'ALT':   ('Alanine Aminotransferase', 'Liver enzyme (SGPT)', 'ALAT', 'Enzyme hépatique (TGP)'),
    'AST':   ('Aspartate Aminotransferase', 'Liver/muscle enzyme (SGOT)', 'ASAT', 'Enzyme (TGO)'),
    'ALP':   ('Alkaline Phosphatase', 'Liver/bone enzyme', 'Phosphatase Alcaline (PAL)', 'Enzyme foie/os'),
    'U&E':   ('Urea & Electrolytes', 'Renal panel', 'Ionogramme + urée', 'Bilan rénal'),
    'eGFR':  ('estimated Glomerular Filtration Rate', 'Kidney function estimate', 'DFG estimé', 'Fonction rénale'),
    'TSH':   ('Thyroid-Stimulating Hormone', 'Thyroid screen', 'TSH', 'Dépistage thyroïdien'),
    'FT4':   ('Free Thyroxine', 'Thyroid hormone', 'T4 libre', 'Hormone thyroïdienne'),
    'PSA':   ('Prostate-Specific Antigen', 'Prostate marker', 'PSA', 'Marqueur prostatique'),
    'CEA':   ('Carcinoembryonic Antigen', 'GI/colorectal tumour marker', 'ACE', 'Marqueur tumoral digestif'),
    'AFP':   ('Alpha-Fetoprotein', 'Liver/germ-cell marker', 'Alpha-fœtoprotéine', 'Marqueur hépatique'),
    'CA-125':('Cancer Antigen 125', 'Ovarian marker', 'CA 125', 'Marqueur ovarien'),
    'AFB':   ('Acid-Fast Bacilli', 'TB smear (Ziehl-Neelsen)', 'BAAR', 'Bacilles acido-alcoolo-résistants (TB)'),
    'ZN':    ('Ziehl-Neelsen', 'AFB stain for TB', 'Ziehl-Neelsen', 'Coloration BAAR (TB)'),
    'TB':    ('Tuberculosis', 'M. tuberculosis infection', 'Tuberculose', 'Infection à M. tuberculosis'),
    'O&P':   ('Ova & Parasites', 'Stool parasite examination', 'Parasitologie des selles', 'Recherche œufs/parasites'),
    'PBS':   ('Peripheral Blood Smear', 'Stained blood film microscopy', 'Frottis Sanguin Périphérique', 'Frottis sanguin'),
    'C&S':   ('Culture & Sensitivity', 'Bacterial culture + antibiogram', 'Culture + Antibiogramme', 'Culture bactérienne'),
    'AST_micro':('Antimicrobial Susceptibility Testing', 'Antibiogram', 'Antibiogramme', 'Sensibilité aux antibiotiques'),
    'HBsAg': ('Hepatitis B surface Antigen', 'Active Hep B', 'Ag HBs', 'Hépatite B active'),
    'HCV':   ('Hepatitis C Virus', 'Hep C antibody/antigen', 'VHC', 'Virus hépatite C'),
    'HIV':   ('Human Immunodeficiency Virus', 'HIV Ag/Ab test', 'VIH', 'Test Ag/Ac VIH'),
    'RPR':   ('Rapid Plasma Reagin', 'Syphilis screen', 'RPR', 'Dépistage syphilis'),
    'INR_note':('', '', '', ''),
    'DIC':   ('Disseminated Intravascular Coagulation', 'Consumptive coagulopathy', 'CIVD', 'Coagulation intravasculaire disséminée'),
    'VTE':   ('Venous Thromboembolism', 'DVT/PE', 'Maladie thromboembolique veineuse', 'TVP/EP'),
    'G6PD':  ('Glucose-6-Phosphate Dehydrogenase', 'Deficiency → haemolysis', 'G6PD', 'Déficit → hémolyse'),
    'STAT':  ('Statim (urgent)', 'Immediate priority test', 'STAT (urgent)', 'Analyse urgente'),
    'QC':    ('Quality Control', 'IQC/EQA lab quality', 'Contrôle Qualité', 'CIQ/EEQ'),
    'LOINC': ('Logical Observation Identifiers', 'Universal lab test codes', 'LOINC', 'Codes universels des analyses'),
}


def lookup(query: str) -> list:
    """Match by abbreviation or by any term/definition text, EN or FR."""
    q = (query or '').strip().lower()
    if not q:
        return []
    hits = []
    for abbr, (te, de, tf, df) in GLOSSARY.items():
        if not te and not tf:
            continue
        blob = ' '.join([abbr, te, de, tf, df]).lower()
        if q == abbr.lower() or q in blob:
            hits.append({'abbr': abbr, 'term_en': te, 'def_en': de, 'term_fr': tf, 'def_fr': df,
                         'exact': q == abbr.lower()})
    hits.sort(key=lambda h: (not h['exact'], h['abbr']))
    return hits[:25]
