# Trained malaria weights go here

Drop `malaria.pt` (YOLOv8 detector from `ml/malaria/train_detect.py`) — or
`malaria_cls.pt` (classifier) — into this folder. The vision service loads
`malaria.pt` automatically for blood-smear / parasitology images; without it,
it falls back to Claude vision. Requires `ultralytics` in the backend runtime.
