# 🦠 Virology vision detectors — training

Virions are sub-microscopic, so you read their **proxies**. Two detectors:

| Detector | Reads | Notebook | Model key |
|---|---|---|---|
| **RDT reader** | rapid-test cassettes (HIV/HBsAg/HCV/COVID/dengue/syphilis) → C/T lines → POS/NEG/INVALID | [`virology_rdt_training_colab.ipynb`](virology_rdt_training_colab.ipynb) | `virology_rdt` |
| **Viral cytopathology** | inclusion bodies on histo/cyto/Tzanck (CMV/HSV/HPV/molluscum/Negri) | [`virology_cyto_training_colab.ipynb`](virology_cyto_training_colab.ipynb) | `virology_cyto` |

Both fine-tune **YOLOv8** from a Roboflow **detection** dataset — add a `(workspace, project)` in
step 4 (the data cell prints the real 401/404 error if a candidate fails). Disease maps:
`backend/ai_services/virology_rdt_findings.json`, `backend/ai_services/virology_cyto_findings.json`.

The RDT reader's result (**POSITIVE / NEGATIVE / INVALID**) is **derived by the vision service**
from the detected control/test lines, so the dataset can label *either* C/T lines *or* result classes.

> ⚠️ Screening aids only — a scientist/pathologist confirms; confirmatory serology / PCR / IHC applies.
> Read RDTs within the kit's time window (typically 15 min).
