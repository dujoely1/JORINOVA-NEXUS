# Trained vision models — drop-in folder

The vision service auto-loads any YOLOv8 weights placed here as
**`backend/models/<key>/<key>.pt`**. Train with the pipeline in `ml/` (see
`ml/TRAINING_ROADMAP.md`), export `best.pt`, rename to `<key>.pt`, drop it in — the
right model then runs automatically based on the uploaded image's `image_type`.
**No code change needed.** Requires `ultralytics` in the backend runtime; otherwise
the service falls back to Claude vision.

## Keys → image types (from `_MODEL_REGISTRY` in ai_services/vision_service.py)
| key (`models/<key>/<key>.pt`) | image_type(s) that use it |
|---|---|
| `malaria` | blood_smear, smear, malaria |
| `helminths` | helminths, parasitology, stool, ova, urine_parasite |
| `protozoa` | protozoa, stool_protozoa |
| `pbs` | pbs, peripheral_blood_smear |
| `leukemia` | leukemia, blast |
| `anemia` | anemia, rbc_morphology |
| `trypanosoma` / `leishmania` / `microfilaria` | (same-named image_type) |
| `gram` | gram_stain |
| `tb_afb` | afb, tb_smear |
| `fungi` | fungi, koh |
| `cytology` / `histology` / `cancer` | (same-named image_type) |
| `urine` | urine_microscopy |

Add a new key by editing `_MODEL_REGISTRY` (one line) or by naming the folder to match
the `image_type` directly (unmapped types fall through to `models/<image_type>/<image_type>.pt`).
`GET /health` (vision `health_status`) lists which models are present.

> `.pt` weight files are git-ignored by size elsewhere; commit them explicitly with
> `git add -f backend/models/<key>/<key>.pt` when you want them in the deploy.
