# Parasitology detector weights

Drop the trained **`parasitology.pt`** (YOLOv8) here → `backend/models/parasitology/parasitology.pt`.

The vision service auto-loads it for `image_type` ∈ {`parasitology`, `stool`, `ova`,
`urine_parasite`} (see `_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`).
Detected ova/cysts are matched to their disease via
`backend/ai_services/parasitology_organisms.json`.

Train it with [`ml/parasitology/parasitology_training_colab.ipynb`](../../../ml/parasitology/parasitology_training_colab.ipynb)
(fine-tunes from pretrained weights). On Render the detector needs the ML deps: build
with `INSTALL_ML=1` on a ≥2 GB instance. Without weights/deps, Claude vision still reads the field.
