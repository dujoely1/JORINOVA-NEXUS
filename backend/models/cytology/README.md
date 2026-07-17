# cytology classifier — `cytology.pt`

yolov8-cls model for cervical (Pap) cytology — **SIPaKMeD** 5 classes: `superficial_intermediate`,
`parabasal`, `metaplastic`, `koilocyte`, `dyskeratotic`.

- Auto-loads for `image_type == "cytology"` — classification path in
  [`vision_service.py`](../../ai_services/vision_service.py) (`task=='classify'` → top-1/top-k).
- Each class resolves to Bethesda significance via
  [`cytology_findings.json`](../../ai_services/cytology_findings.json).
- Runs when the backend is built with `INSTALL_ML=1`; else Claude vision reads the slide.

Screening aid — a cytopathologist reviews. Decision support only.
