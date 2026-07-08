# Leukaemia detector weights

Drop the trained **`leukemia.pt`** (YOLOv8) here → `backend/models/leukemia/leukemia.pt`.

The vision service auto-loads it for `image_type` ∈ {`leukemia`, `blast`} (see
`_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`). Detected blasts are
matched to their leukaemia type via `backend/ai_services/leukemia_disorders.json` and
flagged **critical**.

Train it with [`ml/leukemia/leukemia_training_colab.ipynb`](../../../ml/leukemia/leukemia_training_colab.ipynb)
(fine-tunes from pretrained weights). On Render the detector needs the ML deps: build
with `INSTALL_ML=1` on a ≥2 GB instance. Without weights/deps, Claude vision still reads the field.
