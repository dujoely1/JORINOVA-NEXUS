# nematode (roundworm-egg) specialist — `nematode.pt`

Fast yolov8n detector for **roundworm ova/larvae** only: Ascaris, Trichuris, hookworm,
Enterobius, Capillaria (5 classes). A subset specialist of the Chula-ParasiteEgg set.

- Auto-loads for `image_type` ∈ {`nematode`, `roundworm`} — see `_MODEL_REGISTRY` in
  [`vision_service.py`](../../ai_services/vision_service.py).
- The combined **[helminths](../helminths/)** detector (yolov8s, all 11 species) is the
  default full O&P screen; this specialist serves callers who already know the worm group.
- Detected ova resolve to disease + significance via
  [`helminths_organisms.json`](../../ai_services/helminths_organisms.json) (Capillaria = **critical**).
- Runs when the backend is built with `INSTALL_ML=1`; else Claude vision reads the field.

Decision support only; a microscopist validates.
