# Helminths detector weights

Drop the trained **`helminths.pt`** (YOLOv8) here → `backend/models/helminths/helminths.pt`.

The vision service auto-loads it for `image_type` ∈ {`helminths`, `parasitology`, `stool`,
`ova`, `urine_parasite`} (see `_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`).
Detected ova/larvae are matched to their disease via
`backend/ai_services/helminths_organisms.json`.

Train it with [`ml/helminths/helminths_training_colab.ipynb`](../../../ml/helminths/helminths_training_colab.ipynb)
(fine-tunes from pretrained weights). On Render the detector needs the ML deps: build
with `INSTALL_ML=1` on a ≥2 GB instance. Without weights/deps, Claude vision still reads the field.
