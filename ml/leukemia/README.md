# 🩸 Leukaemia / blast-cell detector — training

Fine-tunes a **YOLOv8** detector to find **blast cells** on a blood/marrow smear and
produces `leukemia.pt` for the app's vision service. Every blast is mapped to its
**leukaemia type** via [`backend/ai_services/leukemia_disorders.json`](../../backend/ai_services/leukemia_disorders.json)
and flagged **critical** (acute leukaemia is a haematological emergency).

> **Fine-tuning, NOT from scratch** — starts from pretrained weights (`yolov8s.pt`,
> or your `malaria.pt`) and adapts them.

## Datasets (annotated images — chosen for you)
| Dataset | Gives | Access | Format |
|---|---|---|---|
| **C-NMC 2019** | ALL (lymphoblast) vs normal, 10,661 cells | [TCIA](https://www.cancerimagingarchive.net/collection/c-nmc-2019/) · Kaggle | classification (450×450 single cells) |
| **ALL-IDB1 / ALL-IDB2** | blasts, full-field + cropped | [ALL-IDB (unimi)](https://scotti.di.unimi.it/all/) (request access) | IDB1 multi-cell, IDB2 cropped |
| **Roboflow Universe — leukemia/blast** | blast detection, YOLOv8-ready | [Roboflow Universe](https://universe.roboflow.com/search?q=leukemia%20blast) (free key) | YOLOv8 boxes |

**Recommended:** the Roboflow route (Option A) gives a **ready YOLOv8** detection export.
Published work merges **ALL-IDB1 (multi-cell) + ALL-IDB2 + C-NMC** into one unified set —
you can do the same via the PBS notebook's Option C merge pattern.

> Most sets are **binary** (blast vs normal). That already powers the key alert:
> *blasts present → possible acute leukaemia → urgent referral*. Add an AML set later
> for myeloblast/monoblast/APL subtyping (class names auto-resolve to disease).

## How to train
1. Open [`leukemia_training_colab.ipynb`](leukemia_training_colab.ipynb) in Colab → **T4 GPU**.
2. **Step 4** — Option A (Roboflow, ready) or Option B (Kaggle C-NMC, classification note).
3. **Step 6** fine-tunes; **step 7** saves `leukemia.pt` → `backend/models/leukemia/`.

## Put it in the app
1. Move `leukemia.pt` → **`backend/models/leukemia/leukemia.pt`**, commit, push.
2. Auto-loads for `image_type` ∈ {`leukemia`, `blast`}.
3. On Render, build with `INSTALL_ML=1` (≥2 GB) to run the detector; else Claude vision reads the field.

Detected blasts → leukaemia type + **critical** flag (blast → acute leukaemia;
abnormal promyelocyte → APL emergency; Auer rod → AML).
