# PBS detector weights

Drop the trained **`pbs.pt`** (YOLOv8) here → `backend/models/pbs/pbs.pt`.

The vision service auto-loads it for `image_type` ∈ {`pbs`, `peripheral_blood_smear`}
(see `_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`). Detected cell
classes are matched to related disorders via `backend/ai_services/pbs_disorders.json`.

Train it with [`ml/pbs/pbs_training_colab.ipynb`](../../../ml/pbs/pbs_training_colab.ipynb)
(fine-tunes from pretrained weights — not from scratch). On Render the detector needs
the ML deps: build with `INSTALL_ML=1` on a ≥2 GB instance. Without weights/deps, the
smear still gets read by Claude vision.
