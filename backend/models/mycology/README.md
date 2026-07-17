# mycology (fungi) detector — weights NOT trained yet

⚠️ **No `mycology.pt` here.** A previously-committed `mycology.pt` was actually an
RDT-cassette model (wrong file) and was removed on 2026-07-17. With no weights present, the
vision service falls back to **Claude vision** for `image_type` ∈ {`fungi`, `koh`} — which is
correct behaviour until a real fungal model is trained.

To train it: use the **DeFungi** dataset (`ml/mycology/mycology_training_colab.ipynb`), export
`mycology.pt` here, commit. Detected genera resolve via
[`mycology_organisms.json`](../../ai_services/mycology_organisms.json).

> Note the registry maps `fungi`/`koh` → key `fungi`, but this folder + map use key
> `mycology`; when you add weights, place them at `backend/models/mycology/mycology.pt` and
> confirm the `image_type` you send resolves to `mycology` (or add a `fungi`→`mycology` alias).
