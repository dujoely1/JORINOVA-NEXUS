# Urine sediment detector weights

Drop the trained **`urine_sediment.pt`** (YOLOv8) here → `backend/models/urine_sediment/urine_sediment.pt`.

Auto-loads for `image_type` ∈ {`urine_sediment`, `urine_microscopy`, `urine`} (see `_MODEL_REGISTRY`
in `backend/ai_services/vision_service.py`). Detected casts / cells / crystals / organisms resolve
to their finding via `backend/ai_services/urine_sediment_findings.json`.

Train it with [`ml/urine_sediment/urine_sediment_training_colab.ipynb`](../../../ml/urine_sediment/urine_sediment_training_colab.ipynb).
On Render, build with `INSTALL_ML=1` (≥2 GB) to run it; else Claude vision reads the field.
