# Protozoa detector weights

Drop the trained **`protozoa.pt`** (YOLOv8-cls classifier) here → `backend/models/protozoa/protozoa.pt`.

Auto-loads for `image_type` ∈ {`protozoa`, `stool_protozoa`} (see `_MODEL_REGISTRY` in
`backend/ai_services/vision_service.py`). It is a **classification** model — the vision service
reads its top-1 / top-k class and resolves the organism → disease via
`backend/ai_services/protozoa_organisms.json`.

Train it with [`ml/protozoa/protozoa_training_colab.ipynb`](../../../ml/protozoa/protozoa_training_colab.ipynb)
(Kaggle protozoan-parasite set, `yolov8m-cls`). On Render, build with `INSTALL_ML=1` (≥2 GB) to run it;
else Claude vision reads the field.
