#!/usr/bin/env python
"""
Train a malaria parasite DETECTOR (localise + classify life-cycle stages) with
YOLOv8. Works on a Roboflow YOLOv8 export or BBBC041 converted to YOLO labels.

  pip install ultralytics
  # point --data at the data.yaml produced by download_data.py --roboflow
  python train_detect.py --data data/roboflow/data.yaml --epochs 80 --model yolov8s.pt

Output: runs/detect/malaria*/weights/best.pt  -> copy to
        backend/models/malaria/malaria.pt  and the vision service will use it.

Run on a GPU (Colab/T4 or a GPU box). CPU works but is very slow. See
GPU_TRAINING.md — keep only datasets/notebooks on the training machine.
"""
import argparse
import shutil
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True, help='YOLO data.yaml (from Roboflow/BBBC041)')
    ap.add_argument('--model', default='yolov8s.pt', help='yolov8n/s/m .pt base')
    ap.add_argument('--epochs', type=int, default=80)
    ap.add_argument('--imgsz', type=int, default=640)
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--name', default='malaria')
    ap.add_argument('--export', default='backend/models/malaria/malaria.pt',
                    help='where to copy best.pt for the app to use')
    a = ap.parse_args()

    from ultralytics import YOLO
    model = YOLO(a.model)
    results = model.train(
        data=a.data, epochs=a.epochs, imgsz=a.imgsz, batch=a.batch,
        name=a.name, patience=20, plots=True,
        # augmentation tuned for stained microscopy fields
        hsv_h=0.015, hsv_s=0.6, hsv_v=0.4, degrees=180, fliplr=0.5, flipud=0.5,
        mosaic=1.0, translate=0.1, scale=0.5,
    )
    best = Path(results.save_dir) / 'weights' / 'best.pt'
    print(f'\nBest weights: {best}')

    # Quick validation summary (mAP)
    metrics = model.val()
    print(f"mAP50: {metrics.box.map50:.3f}  mAP50-95: {metrics.box.map:.3f}")

    if best.exists():
        out = Path(a.export)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(best, out)
        print(f'✓ Copied to {out} — the vision service will pick it up automatically.')
        # ONNX export too (portable / no torch needed at inference if you prefer)
        try:
            model.export(format='onnx', opset=12)
            onnx = best.with_suffix('.onnx')
            if onnx.exists():
                shutil.copy(onnx, out.with_suffix('.onnx'))
                print(f'✓ ONNX at {out.with_suffix(".onnx")}')
        except Exception as e:
            print(f'(onnx export skipped: {e})')


if __name__ == '__main__':
    main()
