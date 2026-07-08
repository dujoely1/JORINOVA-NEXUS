# 🩸 Peripheral Blood Smear (PBS) detector — training

Trains a **YOLOv8 detector** that finds and classifies cells on a peripheral blood
smear — **normal cells + morphological abnormalities** — and produces `pbs.pt` for
the app's vision service. The app then maps each abnormality to its **related
disorders** (via [`backend/ai_services/pbs_disorders.json`](../../backend/ai_services/pbs_disorders.json)).

> **Fine-tuning, not from scratch.** Training starts from **pre-trained weights**
> (COCO `yolov8s.pt`, or your own blood-domain `malaria.pt`) and adapts them — it
> never random-initialises. This needs far less data and trains much faster.

## Which model & why detection (not classification)
The app's vision service runs a **detector** (`model.predict()` → boxes) so it can
count and locate many cells in one smear field. Pure single-cell classifiers
(PBC/Raabin) only work on pre-cropped cells, so we train a **detection** model on
bounding-box datasets. The class names match `pbs_disorders.json` keys, so every
detected cell auto-resolves to its disorders in the report.

## Datasets (annotated images — chosen for you)
| Dataset | Gives | Access | Format |
|---|---|---|---|
| **BCCD** | RBC, WBC, platelets (normal baseline) | [Roboflow](https://public.roboflow.com/object-detection/bccd) · [GitHub](https://github.com/Shenggan/BCCD_Dataset) — **public domain, no key** | YOLOv8 boxes |
| **Blood Detection (Banerjee)** | 6 RBC abnormalities: echinocyte, spherocyte, teardrop, sickle, elliptocyte, stomatocyte | [Roboflow Universe](https://universe.roboflow.com/mayukh-banerjee/blood-detection-puabf) — free API key | YOLOv8 boxes |
| **Sickle Cells AI Detection** | sickle cells (extra data) | [Roboflow Universe](https://universe.roboflow.com/general-pathology-ai/sickle-cells-ai-detection) — free API key | YOLOv8 boxes |
| **Raabin-WBC** | ~40k WBC with boxes + types | [raabindata.com](https://raabindata.com/raabin-health-database/) — free, CC-BY 4.0 | JSON boxes |
| **PBC (Barcelona, Acevedo)** | 8 WBC/normal classes, 17,092 imgs | [Mendeley](https://data.mendeley.com/datasets/snkd93bnjr/1) — free | classification (folders) |

**Recommended combo:** BCCD (normal) **+** Blood Detection/Banerjee (RBC
abnormalities). Both are YOLOv8-ready; the notebook merges them into one class map.
Add more Roboflow projects (blasts, schistocytes) the same way to widen coverage.

> Roboflow needs a **free** API key (app.roboflow.com → Settings). Kaggle needs a
> free `kaggle.json`. Both one-time. BCCD alone needs neither.

## How to train (same 3 steps as malaria)
1. Open [`pbs_training_colab.ipynb`](pbs_training_colab.ipynb) in Google Colab → Runtime → **T4 GPU**.
2. **Step 4** — pick a dataset path (BCCD no-key, or Roboflow with your key). The
   notebook can **merge** BCCD + an abnormality set into one `data.yaml`.
3. **Step 6** trains (fine-tunes from `yolov8s.pt` **or** `malaria.pt`); **step 8**
   saves `pbs.pt` → `backend/models/pbs/pbs.pt`, backs up to Drive, downloads it.

## Put it in the app
1. Move the downloaded `pbs.pt` to **`backend/models/pbs/pbs.pt`**, commit, push.
2. The vision service auto-loads it for `image_type` ∈ {`pbs`, `peripheral_blood_smear`}.
3. On Render the local detector needs the ML deps — build with `INSTALL_ML=1` on a
   ≥2 GB instance (see `render.yaml`). Without it, Claude vision still reads smears.

## Related disorders
Class names in your dataset should match keys in
[`pbs_disorders.json`](../../backend/ai_services/pbs_disorders.json). Any match →
the app attaches related disorders + a **critical** flag (e.g. schistocytes → MAHA,
blasts → acute leukaemia). Edit that JSON to extend the knowledge — no retrain needed.
