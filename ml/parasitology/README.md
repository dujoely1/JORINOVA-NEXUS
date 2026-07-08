# 🪱 Stool / Urine Parasitology (O&P) detector — training

Fine-tunes a **YOLOv8** detector to find and identify **parasite ova, cysts and
larvae** on stool/urine microscopy, and produces `parasitology.pt` for the app's
vision service. Each detected organism is mapped to its **disease** via
[`backend/ai_services/parasitology_organisms.json`](../../backend/ai_services/parasitology_organisms.json).

> **Fine-tuning, NOT from scratch** — starts from pretrained weights (`yolov8s.pt`,
> or your blood-domain `malaria.pt`) and adapts them.

## Datasets (annotated images — chosen for you)
| Dataset | Gives | Access |
|---|---|---|
| **Chula-ParasiteEgg-11** | 11 stool ova species, 11,000 imgs, bbox | [IEEE DataPort](https://ieee-dataport.org/competitions/parasitic-egg-detection-and-classification-microscopic-images) · [Kaggle `macharning/chula-parasite-dataset`](https://www.kaggle.com/datasets/macharning/chula-parasite-dataset) · [ICIP 2022](https://icip2022challenge.piclab.ai/dataset/) |
| **Roboflow Universe — parasite egg** | 11 egg types, YOLOv8-ready | [Roboflow Universe](https://universe.roboflow.com/search?q=parasite%20egg) (free key) |

**The 11 Chula classes:** Ascaris lumbricoides, Trichuris trichiura, Hookworm,
Enterobius vermicularis, Hymenolepis nana, Hymenolepis diminuta, Taenia spp.,
Opisthorchis viverrini, Fasciolopsis buski, Paragonimus, Capillaria philippinensis.

**Recommended:** the Roboflow route (Option A) gives a **ready YOLOv8 export** (no
format conversion). The Kaggle/IEEE Chula route (Option B) is the full 11k set but
needs a COCO→YOLO convert (the notebook includes a best-effort converter).

> Roboflow / Kaggle each need a **free** one-time key. Class names in your dataset
> should match keys in `parasitology_organisms.json`; any match → the app attaches
> the disease + significance automatically.

## How to train
1. Open [`parasitology_training_colab.ipynb`](parasitology_training_colab.ipynb) in Colab → **T4 GPU**.
2. **Step 4** — Option A (Roboflow, ready) or Option B (Kaggle Chula, converts).
3. **Step 6** fine-tunes; **step 7** saves `parasitology.pt` → `backend/models/parasitology/`.

## Put it in the app
1. Move `parasitology.pt` to **`backend/models/parasitology/parasitology.pt`**, commit, push.
2. The vision service auto-loads it for `image_type` ∈ {`parasitology`, `stool`, `ova`, `urine_parasite`}.
3. On Render, build with `INSTALL_ML=1` (≥2 GB) to run the detector; else Claude vision reads the field.

Detected organisms → diseases (e.g. hookworm → iron-deficiency anaemia; *Opisthorchis*
→ cholangiocarcinoma risk; *Capillaria* flagged as potentially fatal).
