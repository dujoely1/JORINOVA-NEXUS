#!/usr/bin/env python
"""
Train a malaria cell CLASSIFIER (Parasitized vs Uninfected) on the NIH cell
images with transfer learning (ResNet18). Good for thin-film single-cell crops
and as a fast screening head.

  pip install torch torchvision
  python download_data.py --nih
  python train_classify.py --data data/nih_cells/cell_images --epochs 12

Output: backend/models/malaria/malaria_cls.pt  (state dict + class names).
Use a GPU (Colab/T4) — ResNet18 on ~27k images trains in minutes on GPU.
"""
import argparse
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True, help='NIH cell_images dir (Parasitized/ + Uninfected/)')
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--batch', type=int, default=64)
    ap.add_argument('--out', default='backend/models/malaria/malaria_cls.pt')
    a = ap.parse_args()

    import torch
    from torch import nn
    from torch.utils.data import DataLoader, random_split
    from torchvision import datasets, transforms, models

    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'device: {dev}')

    tf_train = transforms.Compose([
        transforms.Resize((128, 128)), transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(), transforms.RandomRotation(180),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    tf_val = transforms.Compose([
        transforms.Resize((128, 128)), transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    full = datasets.ImageFolder(a.data, transform=tf_train)
    classes = full.classes  # ['Parasitized', 'Uninfected']
    n_val = int(len(full) * 0.15)
    train_ds, val_ds = random_split(full, [len(full) - n_val, n_val],
                                    generator=torch.Generator().manual_seed(42))
    val_ds.dataset = datasets.ImageFolder(a.data, transform=tf_val)  # val transforms
    tl = DataLoader(train_ds, batch_size=a.batch, shuffle=True, num_workers=2)
    vl = DataLoader(val_ds, batch_size=a.batch, num_workers=2)

    net = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    net.fc = nn.Linear(net.fc.in_features, len(classes))
    net = net.to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=1e-4)
    lossf = nn.CrossEntropyLoss()

    best = 0.0
    for ep in range(a.epochs):
        net.train()
        for x, y in tl:
            x, y = x.to(dev), y.to(dev)
            opt.zero_grad(); loss = lossf(net(x), y); loss.backward(); opt.step()
        # validate
        net.eval(); correct = total = 0
        with torch.no_grad():
            for x, y in vl:
                x, y = x.to(dev), y.to(dev)
                correct += (net(x).argmax(1) == y).sum().item(); total += y.size(0)
        acc = correct / max(total, 1)
        print(f'epoch {ep+1}/{a.epochs}  val_acc={acc:.4f}')
        if acc > best:
            best = acc
            out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
            torch.save({'state_dict': net.state_dict(), 'classes': classes,
                        'arch': 'resnet18', 'img_size': 128}, out)
    print(f'✓ best val_acc={best:.4f} saved to {a.out}')


if __name__ == '__main__':
    main()
