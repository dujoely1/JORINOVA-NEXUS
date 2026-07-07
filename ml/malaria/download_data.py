#!/usr/bin/env python
"""
Download malaria training data — NIH (public) + Roboflow (needs YOUR API key).

Usage:
  # NIH cell-image classification set (Parasitized vs Uninfected, ~337 MB, public):
  python download_data.py --nih

  # NIH BBBC041 bounding-box detection set (rings/troph/schizont/gametocyte, public):
  python download_data.py --bbbc041

  # A Roboflow malaria detection project (YOLOv8 export) — export first in the
  # Roboflow UI, copy the workspace/project/version, then:
  export ROBOFLOW_API_KEY=xxxxxxxx        # app.roboflow.com -> Settings -> API Key
  python download_data.py --roboflow --workspace <ws> --project <proj> --version <n>

Notes
-----
* Roboflow authenticates with an **API key**, not an email/password. Get yours at
  app.roboflow.com (the account you'd use is dujoely1@gmail.com) -> Settings ->
  Roboflow API -> Private API Key, and put it in ROBOFLOW_API_KEY. This script
  never asks for a password.
* Everything downloads under ./data/ . Keep patient data OFF the training box
  (see GPU_TRAINING.md) — these are open datasets, no real PII.
"""
import argparse
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

DATA = Path(__file__).parent / 'data'
NIH_CELLS = 'https://data.lhncbc.nlm.nih.gov/public/Malaria/cell_images.zip'
BBBC041 = [
    ('https://data.broadinstitute.org/bbbc/BBBC041/malaria.zip', 'malaria.zip'),
]


def _get(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f'  exists, skipping: {dest.name}')
        return
    print(f'  downloading {url} -> {dest} ...')
    def _hook(b, bs, total):
        if total > 0:
            pct = min(100, b * bs * 100 // total)
            sys.stdout.write(f'\r    {pct}%'); sys.stdout.flush()
    urllib.request.urlretrieve(url, dest, _hook)
    print()


def _unzip(z: Path, out: Path) -> None:
    print(f'  unzipping {z.name} ...')
    with zipfile.ZipFile(z) as f:
        f.extractall(out)


def nih_cells():
    d = DATA / 'nih_cells'
    z = d / 'cell_images.zip'
    _get(NIH_CELLS, z)
    _unzip(z, d)
    print(f'  ✓ NIH cell images at {d}/cell_images (Parasitized/ + Uninfected/)')


def bbbc041():
    d = DATA / 'bbbc041'
    for url, name in BBBC041:
        z = d / name
        _get(url, z)
        _unzip(z, d)
    print(f'  ✓ BBBC041 at {d} (images/ + *.json bounding boxes) — run prepare_bbbc041.py to make YOLO labels')


def roboflow(workspace: str, project: str, version: int):
    key = os.environ.get('ROBOFLOW_API_KEY', '').strip()
    if not key:
        sys.exit('Set ROBOFLOW_API_KEY (app.roboflow.com -> Settings -> API Key).')
    try:
        from roboflow import Roboflow
    except ImportError:
        sys.exit('pip install roboflow')
    rf = Roboflow(api_key=key)
    ds = rf.workspace(workspace).project(project).version(version).download('yolov8', location=str(DATA / 'roboflow'))
    print(f'  ✓ Roboflow YOLOv8 dataset at {ds.location} (data.yaml inside)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--nih', action='store_true', help='NIH cell-image classification set')
    ap.add_argument('--bbbc041', action='store_true', help='NIH BBBC041 detection set')
    ap.add_argument('--roboflow', action='store_true')
    ap.add_argument('--workspace'); ap.add_argument('--project'); ap.add_argument('--version', type=int)
    a = ap.parse_args()
    if a.nih:      nih_cells()
    if a.bbbc041:  bbbc041()
    if a.roboflow: roboflow(a.workspace, a.project, a.version)
    if not (a.nih or a.bbbc041 or a.roboflow):
        ap.print_help()
