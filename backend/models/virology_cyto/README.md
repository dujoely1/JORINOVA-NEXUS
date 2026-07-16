# Viral cytopathology detector weights

Drop the trained **`virology_cyto.pt`** (YOLOv8) here → `backend/models/virology_cyto/virology_cyto.pt`.

Auto-loads for `image_type` ∈ {`viral_cytopathology`, `inclusion_bodies`, `virology_cyto`, `viral_inclusion`}
(see `_MODEL_REGISTRY` in `backend/ai_services/vision_service.py`). Detected inclusion bodies resolve
to their virus/disease via `backend/ai_services/virology_cyto_findings.json`
(CMV owl-eye → CMV, koilocyte → HPV, Negri → rabies, molluscum body → Molluscum contagiosum, ...).

Train it with [`ml/virology/virology_cyto_training_colab.ipynb`](../../../ml/virology/virology_cyto_training_colab.ipynb).
On Render, build with `INSTALL_ML=1` (≥2 GB) to run it; else Claude vision reads the slide.
