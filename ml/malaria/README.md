# Malaria parasite model — training + integration

Train a malaria detector/classifier on **NIH** (public) and **Roboflow** data, then
drop the trained weights into the app and the vision service uses them automatically.

> ⚠️ **Run training on a GPU (Colab free T4, or a GPU box).** No GPU here in the app
> environment. Follow `../../GPU_TRAINING.md`: put **only** `ml/`, `datasets/`,
> `notebooks/` on the training machine — never `.env`, DB creds, or patient data.

## Two heads (pick one or both)
| Script | Task | Data | Output |
|---|---|---|---|
| `train_detect.py` | **Detect + stage** parasites (rings, trophozoites, schizonts, gametocytes) with boxes | Roboflow YOLOv8 export, or NIH **BBBC041** | `backend/models/malaria/malaria.pt` |
| `train_classify.py` | **Parasitized vs Uninfected** cell screen | NIH `cell_images` (~27k) | `backend/models/malaria/malaria_cls.pt` |

Classes/species: see `classes.yaml`.

## Step 1 — get data
```bash
pip install -r requirements-train.txt

# NIH cell classification (public, ~337 MB)
python download_data.py --nih

# NIH BBBC041 detection boxes (public)
python download_data.py --bbbc041

# A Roboflow malaria project — needs YOUR key, not an email/password:
#   app.roboflow.com  (log in as dujoely1@gmail.com)  ->  Settings  ->  Roboflow API  ->  Private API Key
export ROBOFLOW_API_KEY=xxxxxxxxxxxx
python download_data.py --roboflow --workspace <ws> --project <malaria-proj> --version <n>
```
Search **Roboflow Universe** for "malaria" (e.g. the *malaria-bounding-boxes* / *lacuna-malaria* projects), open one, **Download → YOLOv8**, and copy the workspace/project/version into the command above. I can't do this step for you — it's behind your Roboflow login.

## Step 2 — train (on the GPU machine)
```bash
# Detector (recommended — gives per-parasite stage boxes)
python train_detect.py --data data/roboflow/data.yaml --epochs 80 --model yolov8s.pt

# or the cell classifier
python train_classify.py --data data/nih_cells/cell_images --epochs 12
```
Each script **copies the best weights to `backend/models/malaria/`** at the end.

## Step 3 — use it in the app
Commit `backend/models/malaria/malaria.pt` (or `.onnx`), redeploy, and set
`ANTHROPIC_API_KEY` for the Claude-vision fallback. The vision service then:
1. runs the **local YOLO detector** on blood-smear / parasitology images → returns
   boxes, per-stage counts, species hint, and a parasitaemia estimate;
2. falls back to **Claude vision** when no local model is present.

`ultralytics` must be installed in the backend runtime for local inference
(`pip install ultralytics`); without it, only the Claude-vision path runs.

## Colab (fastest path)
1. New Colab notebook → Runtime → **T4 GPU**.
2. `!git clone <your repo>` (or upload just `ml/malaria/`).
3. `%cd ml/malaria && pip install -r requirements-train.txt`
4. Set `ROBOFLOW_API_KEY`, run the download + a train command above.
5. Download `backend/models/malaria/malaria.pt` from the Colab files pane, commit it.

## What I set up vs. what you run
- ✅ I built: the download, training, export, class map, and the app inference hook.
- ▶️ You run: the Roboflow download (your key) + the GPU training (Colab/GPU box), then commit the weights. Training here isn't possible (no GPU, no Roboflow auth).
