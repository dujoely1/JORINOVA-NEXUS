# histology classifier — `histology.pt`

yolov8-cls model for tissue histopathology — **LC25000**-derived classes: `Colon cancer`,
`cancer`, `cellcancer`, `cervical cancer`, `esophageal`.

- Auto-loads for `image_type == "histology"` — classification path in
  [`vision_service.py`](../../ai_services/vision_service.py) (`task=='classify'` → top-1/top-k).
- The trained class names resolve via **aka-aliases** in
  [`histology_findings.json`](../../ai_services/histology_findings.json) (colon_cancer/cancer/
  cellcancer/cervical/esophageal → carcinoma entries).
- Runs when the backend is built with `INSTALL_ML=1`; else Claude vision reads the slide.

Screening aid — a pathologist reviews. Decision support only.
