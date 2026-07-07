# JORINOVA NEXUS — AI training roadmap (all lab domains)

Malaria is done. This maps **every** requested domain to **how to train it** and a
**matched public dataset** — so you can start immediately, the same way as malaria.

## Two kinds of AI (this decides the method)
| Kind | Domains | How you "train" it |
|---|---|---|
| 🖼️ **VISION** (images) | parasites, peripheral blood smear, cancer cyto/histology, fungi, TB smear/CXR | Train a model on labelled images → **reuse `ml/malaria/` pipeline** (YOLOv8 detect or the classifier), just point it at the new dataset. |
| 🔢 **INTERPRETATION** (numbers/text) | biochemistry, hormones, serology, tumour markers, CBC, hemostasis/coagulation/platelets, toxicology, genetics | **No CNN.** Use the **Claude LLM + rules + RAG** (already in `backend/ai_services/`). "Training" = curate reference ranges / rules / a knowledge base, not images. |

> The malaria notebook (`ml/malaria/malaria_training_colab.ipynb`) already trains **any**
> YOLO detection dataset. For a new vision model: open it, in step 4 point at the new
> dataset (Roboflow export **or** a Kaggle/HF download), run. For classification datasets
> use `ml/malaria/train_classify.py` instead. **Same 3 steps every time.**

---

## A. 🖼️ VISION models — matched datasets (reuse the pipeline)

| # | Model | Task | Dataset(s) — where to find | Classes / notes |
|---|---|---|---|---|
| 1 | **Malaria** ✅ done | detect | NIH **BBBC041** (public) | ring, troph, schizont, gametocyte, RBC, WBC |
| 2 | **Stool/urine/body-fluid parasites (O&P)** | detect | **Chula-ParasiteEgg-11** (Kaggle: "parasite egg detection", ICIP2022) | 11 intestinal ova/cyst species |
| 3 | **Trypanosoma** | detect | Roboflow Universe: search *trypanosoma*; Kaggle *"trypanosomiasis"* | trypomastigotes in blood |
| 4 | **Leishmania** | detect/classify | Roboflow Universe: *leishmania*; Kaggle *"leishmaniasis parasite"* | amastigotes |
| 5 | **Microfilaria / other blood parasites** | detect | Roboflow Universe: *microfilaria*, *blood parasite* | filariae |
| 6 | **Peripheral blood smear — normal cells** | classify | **PBC (Acevedo, Barcelona)** on Mendeley Data (17,092 imgs) | neutrophil, eosinophil, basophil, lymphocyte, monocyte, immature granulocyte, erythroblast, platelet |
| 7 | **PBS abnormalities / WBC** | classify | **Raabin-WBC**; **BCCD** (Roboflow) | WBC types, RBC, platelets |
| 8 | **Leukemia / blasts (blood cancers)** | classify | **C-NMC 2019** (Kaggle "leukemia classification"); **ALL-IDB** | blast vs normal lymphoblast |
| 9 | **Anemia morphology (sickle etc.)** | detect/classify | **erythrocytesIDB** (sickle cell); Kaggle *"sickle cell"* | sickle, target, schistocyte… |
| 10 | **Cancer cytology — cervical (Pap)** | classify | **SIPaKMeD**, **Herlev** Pap-smear | normal/abnormal cervical cells |
| 11 | **Cancer histology — breast** | classify | **BreakHis** (benign/malignant + 8 subtypes); **PatchCamelyon (PCam)** | tumour subtypes / metastasis |
| 12 | **Cancer histology — lung & colon** | classify | **LC25000**; **NCT-CRC-HE-100K** (colorectal) | 5 tissue classes / CRC tissue |
| 13 | **Fungi microscopy** | classify | **DeFungi** (Kaggle/UCI "defungi") | microscopic fungal genera |
| 14 | **TB — sputum AFB smear** | detect | **ZNSM-iDB** (Ziehl-Neelsen sputum smear DB) | acid-fast bacilli |
| 15 | **TB — chest X-ray** | classify | **Shenzhen + Montgomery** CXR; **TBX11K** | TB vs normal |

> Most image sets live on **Kaggle**, **Roboflow Universe**, **Mendeley Data**, or **NIH/Broad BBBC**.
> Kaggle needs a free account + `kaggle.json` API token (Account → Create New API Token);
> Roboflow needs the API key from Settings. Both are one-time. I can't fetch them for you.

---

## B. 🔢 INTERPRETATION models — no images, use LLM + rules/RAG

These are already partly built (`backend/ai_services/rules_engine.py`, `clinical_rules.py`,
`medical_rag.py`). "Training" = fill the reference/rules tables + a knowledge base; the
Claude LLM (`vision_model`/`claude_model`) does the reasoning. **No GPU, no image dataset.**

| Domain | What to curate (the "dataset") | Method |
|---|---|---|
| **Biochemistry parameters** | analyte reference ranges (age/sex), critical values, panel logic (renal, LFT, lipid) | rules + LLM interpret |
| **Hormonal** | hormone reference ranges + axis patterns (thyroid, cortisol, reproductive) | rules + LLM |
| **Serology** | assay cut-offs, reactive/non-reactive, titre interpretation | rules + LLM |
| **Tumour markers** | marker reference ranges + follow-up logic (PSA, CEA, AFP, CA-125…) | rules + LLM |
| **CBC interpretation** | index rules (MCV/MCH → anemia type, WBC differential patterns) | rules + LLM |
| **Hemostasis / coagulation / platelets** | PT/APTT/INR/fibrinogen/D-dimer + mixing-study patterns; platelet-disorder logic | rules + LLM |
| **Toxicology / TDM** | therapeutic + toxic ranges per drug | rules + LLM |
| **Genetics** | variant knowledge (ClinVar-style) → `medgenome` module | RAG + LLM |

Reference sources (open): **LOINC** (test codes), **ClinVar** (variants), your lab SOP
reference-range tables, WHO/ISO guidance. Put them as JSON/CSV the rules engine loads.

---

## C. 🌐 Medical terms / abbreviations (EN + FR)
A **glossary knowledge base** for the RAG/voice/interpretation layers — not a trained model.
- Sources: **UMLS** (needs free UMLS licence), open medical-abbreviation lists, French
  medical terminology (CISMeF / HAS). Build `backend/ai_services/glossary_{en,fr}.json`
  ({term, abbrev, definition_en, definition_fr}); the RAG + `language_service.py` use it.

---

## ▶️ How to train ANY vision model (same 3 steps as malaria)
1. Open `ml/malaria/malaria_training_colab.ipynb` in Colab → **T4 GPU**.
2. **Step 4** — point it at the new dataset:
   - Roboflow export → uncomment **Option B**, set workspace/project/version; **or**
   - Kaggle/HF/Mendeley → `!kaggle datasets download …` (or `wget`) + a small convert to
     YOLO (copy the BBBC041 converter pattern), set `DATA_YAML`.
3. **Step 7** trains; **step 9** saves `<model>.pt`. Put it in `backend/models/<domain>/`.
   For **classification** datasets use `python ml/malaria/train_classify.py --data <folder>`.

## ✅ Recommended order to start (highest value first)
1. **Peripheral blood smear cells** (#6/#7) — biggest daily use, great datasets.
2. **Stool/urine parasites** (#2) — Chula-ParasiteEgg-11 is ready-made.
3. **Leukemia/blast** (#8) and **anemia morphology** (#9).
4. **TB** (#14/#15) and **fungi** (#13).
5. **Cancer cyto/histology** (#10–#12).
6. Trypanosoma/leishmania/microfilaria (#3–#5).
7. Interpretation domains (Section B) — I can wire the rules + reference tables into the
   existing engine (no training run needed).

> Each vision model plugs into `backend/models/<domain>/` and the vision service picks the
> right one by `image_type` — exactly like `malaria.pt`. I set up the malaria hook as the
> template; ask me to add the loader for the next model when its weights exist.
