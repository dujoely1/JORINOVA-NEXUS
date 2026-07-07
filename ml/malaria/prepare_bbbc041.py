#!/usr/bin/env python
"""
Convert the public NIH **BBBC041** malaria set (bounding boxes, no login needed)
into a YOLOv8 dataset — so you can train the detector WITHOUT a Roboflow key.

  python download_data.py --bbbc041      # downloads + unzips to ./data/bbbc041
  python prepare_bbbc041.py              # writes ./data/bbbc041_yolo/data.yaml

Then:  python train_detect.py --data data/bbbc041_yolo/data.yaml

BBBC041 categories -> our classes (see classes.yaml):
  red blood cell=0  leukocyte=1  ring=2  trophozoite=3  schizont=4  gametocyte=5  difficult=6
"""
import argparse
import json
import shutil
from pathlib import Path

CAT = {
    'red blood cell': 0, 'leukocyte': 1, 'ring': 2, 'trophozoite': 3,
    'schizont': 4, 'gametocyte': 5, 'difficult': 6,
}
NAMES = ['red_blood_cell', 'leukocyte', 'ring', 'trophozoite', 'schizont', 'gametocyte', 'difficult']


def _find(root: Path, *names):
    for n in names:
        hit = list(root.rglob(n))
        if hit:
            return hit[0]
    return None


def _convert(json_path: Path, src_root: Path, img_out: Path, lbl_out: Path) -> int:
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)
    data = json.loads(json_path.read_text())
    n = 0
    for entry in data:
        img = entry.get('image', {})
        pathname = img.get('pathname', '')
        shape = img.get('shape', {})
        H = shape.get('r') or shape.get('height')
        W = shape.get('c') or shape.get('width')
        if not (pathname and H and W):
            continue
        src_img = _find(src_root, Path(pathname).name)
        if not src_img:
            continue
        lines = []
        for obj in entry.get('objects', []):
            cid = CAT.get(str(obj.get('category', '')).lower())
            if cid is None:
                continue
            bb = obj.get('bounding_box', {})
            rmin = bb.get('minimum', {}).get('r'); cmin = bb.get('minimum', {}).get('c')
            rmax = bb.get('maximum', {}).get('r'); cmax = bb.get('maximum', {}).get('c')
            if None in (rmin, cmin, rmax, cmax):
                continue
            xc = ((cmin + cmax) / 2) / W
            yc = ((rmin + rmax) / 2) / H
            w  = abs(cmax - cmin) / W
            h  = abs(rmax - rmin) / H
            lines.append(f'{cid} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}')
        stem = src_img.stem
        shutil.copy(src_img, img_out / src_img.name)
        (lbl_out / f'{stem}.txt').write_text('\n'.join(lines))
        n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='data/bbbc041', help='extracted BBBC041 folder')
    ap.add_argument('--out', default='data/bbbc041_yolo', help='YOLO dataset output')
    a = ap.parse_args()
    src = Path(a.src); out = Path(a.out)
    train_json = _find(src, 'training.json', 'train.json')
    test_json  = _find(src, 'test.json', 'val.json', 'validation.json')
    if not train_json:
        raise SystemExit(f'training.json not found under {src} — did download_data.py --bbbc041 run?')

    nt = _convert(train_json, src, out / 'images/train', out / 'labels/train')
    nv = _convert(test_json, src, out / 'images/val', out / 'labels/val') if test_json else 0
    if not nv:  # no test split → carve 15% of train off for val
        import random
        random.seed(42)
        imgs = sorted((out / 'images/train').glob('*'))
        for p in imgs[:max(1, len(imgs) // 7)]:
            (out / 'images/val').mkdir(parents=True, exist_ok=True)
            (out / 'labels/val').mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), out / 'images/val' / p.name)
            lbl = out / 'labels/train' / f'{p.stem}.txt'
            if lbl.exists():
                shutil.move(str(lbl), out / 'labels/val' / lbl.name)
            nv += 1; nt -= 1

    (out / 'data.yaml').write_text(
        f'path: {out.resolve()}\ntrain: images/train\nval: images/val\n'
        f'nc: {len(NAMES)}\nnames: {NAMES}\n'
    )
    print(f'✓ {nt} train / {nv} val images -> {out}/data.yaml')


if __name__ == '__main__':
    main()
