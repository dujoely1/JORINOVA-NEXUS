# Virology RDT detector weights

Drop the trained **`virology_rdt.pt`** (YOLOv8) here → `backend/models/virology_rdt/virology_rdt.pt`.

Auto-loads for `image_type` ∈ {`rdt`, `rapid_test`, `lateral_flow`, `virology_rdt`, `serology_rdt`}
(see `_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`). The vision service **derives
POSITIVE / NEGATIVE / INVALID** from the detected control/test lines (or result classes) and maps
named tests (HIV/HBsAg/HCV/COVID/dengue/syphilis) via
`backend/ai_services/virology_rdt_findings.json`.

Train it with [`ml/virology/virology_rdt_training_colab.ipynb`](../../../ml/virology/virology_rdt_training_colab.ipynb).
On Render, build with `INSTALL_ML=1` (≥2 GB) to run it; else Claude vision reads the cassette.

> ⚠️ Screening aid — a scientist confirms and the assay's confirmatory algorithm applies.
