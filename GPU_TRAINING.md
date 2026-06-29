# JORINOVA NEXUS — AI Training on a GPU Machine (Institutional Guide)

**Purpose / Intego:** Fine-tune the ALIS-X AI models on a **separate GPU machine** when your
own laptop isn't available — **without putting any stealable project secrets on that machine.**

> 🇷🇼 Iyi document igufasha gutoza AI ya JORINOVA NEXUS kuri mashine ya GPU,
> **utabitseho amabanga y'ikigo** (passwords, database, prod config). Mashine ya
> GPU ikenera **datasets + notebooks gusa**, atari sisitemu yose.

---

## 0. The golden rule — what the GPU machine MUST NOT contain
This is an **institutional** system. The GPU machine is only for *training*. It must **NOT** hold:

| ❌ Do NOT copy to the GPU machine | Why |
|---|---|
| `backend/.env` (local secrets) | Contains SMTP, SMS, SECRET_KEY |
| Neon `DATABASE_URL` / DB password | Live patient database access |
| `ADMIN_PASSWORD`, Cloudinary, API keys | Production credentials |
| The live app / running backend with prod env | Not needed for training |
| Any patient data / real PII | Privacy / law |

✅ The GPU machine **only needs**: `notebooks/`, `datasets/`, `golden_set/` (synthetic training data — no real patients). Nothing else.

> 🇷🇼 **Ntushyira** `.env`, password ya database (Neon), cyangwa data y'abarwayi.
> **Ushyiramo gusa**: `notebooks/`, `datasets/`, `golden_set/`.

If the GPU machine is **rented/cloud/shared**: treat it as untrusted → after training, **delete everything** and don't log into any account that matters.

---

## 1. Will the project "open/run" on that machine? — NO (and you don't need it)
- You do **NOT** run the full JORINOVA NEXUS app (web/API/database) on the GPU machine.
- The live system stays on **Render + Neon** (https://jorinova-nexus-web.onrender.com).
- On the GPU machine you only **open the training notebooks** (Jupyter / VS Code) and run them. That's it.
- The trained model is the **output**; you copy it out and load it into the inference server (Ollama), not the GPU machine.

> 🇷🇼 Project YOSE ntizafungukira kuri iyo mashine — **notebooks gusa**. Sisitemu
> nyayo igumana kuri Render. Mashine ya GPU ni iyo gutoza gusa.

---

## 2. Hardware needed
- **NVIDIA GPU, ≥ 8 GB VRAM** (Phi-3-mini 4-bit LoRA ≈ 6–8 GB). Check: `nvidia-smi`.
- **Linux** recommended (bitsandbytes 4-bit works cleanly). On **Windows → use WSL2 (Ubuntu)**.
- ~20 GB free disk (model + libs).

---

## 3. Apps / software to install (in order)
1. **NVIDIA GPU driver + CUDA 12.x** — verify with `nvidia-smi` (shows GPU + CUDA version).
2. **Python 3.10–3.12** + **Git**.
3. **Jupyter Lab** (to run notebooks) — or **VS Code** + Python/Jupyter extensions.
4. **PyTorch (CUDA build)** + the training libraries (next section).

```bash
# create an isolated environment
python -m venv venv && source venv/bin/activate     # WSL/Linux

# PyTorch with CUDA 12.1 (match your CUDA from nvidia-smi)
pip install torch --index-url https://download.pytorch.org/whl/cu121

# Training stack — pinned to match the notebooks
pip install transformers==4.45.0 peft==0.13.0 datasets==3.0.0 accelerate==1.0.0 \
            bitsandbytes==0.44.0 trl==0.11.0 sentencepiece==0.2.0 rouge-score==0.1.2 gguf

# Jupyter
pip install jupyterlab ipywidgets
```
Verify the GPU is visible to PyTorch:
```bash
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

---

## 4. Get ONLY the training assets (no secrets)
The GitHub repo has **no secrets committed** (they live in Render env). Cloning a fresh copy is safe and contains the notebooks + datasets:
```bash
git clone https://github.com/dujoely1/JORINOVA-NEXUS.git
cd JORINOVA-NEXUS
# (Optional, leaner) you only really need these folders:
#   notebooks/   datasets/   golden_set/
```
> 🇷🇼 Koresha `git clone` (nta `.env` irimo). Cyangwa ukoporore **notebooks/ + datasets/ + golden_set/** gusa.

---

## 5. Run the training
Open Jupyter (`jupyter lab`) and pick a track. **Base model:** `microsoft/Phi-3-mini-4k-instruct` (public — no token needed). **Method:** LoRA, 4-bit.

| Notebook | Trains | Dataset |
|---|---|---|
| `notebooks/intent_finetune_colab.ipynb` | Voice/command **intent** (EN/FR/RW) | `datasets/intent.jsonl` |
| `notebooks/clinical_finetune_colab.ipynb` | **Clinical** interpretation | `datasets/clinical*.jsonl` |
| `notebooks/lis_finetune_colab.ipynb` | **LIS mapping** | `datasets/lis_mapping.jsonl` |

**Run order (per notebook):** Install → load Phi-3-mini (4-bit) → load dataset → **LoRA SFT train** → eval (ROUGE vs `golden_set/`) → **export GGUF**.

> These were written for Colab — on your GPU machine, **skip the Colab cells**
> (`!git clone /content`, Google Drive mount). The code + datasets are already local.

---

## 6. Output → deploy to inference (Ollama)
Training produces a **GGUF** file (quantized model). The app serves AI via **Ollama**:
```bash
# On the machine that runs inference (e.g., the server), NOT necessarily the GPU box:
ollama create nexus-intent -f Modelfile      # Modelfile points to your .gguf
# Then set on the backend:  OLLAMA_MODEL=nexus-intent  (or OLLAMA_MODEL_<ROLE>)
```
Copy only the **.gguf** off the GPU machine (e.g., via secure transfer), then **wipe the GPU machine**.

---

## 7. After training — security cleanup
- Delete the cloned repo + datasets + any model cache from the GPU machine.
- If it was rented/cloud: terminate the instance.
- Don't leave any HuggingFace/GitHub tokens logged in (`git credential` / `huggingface-cli logout`).
- The only thing you keep is the **.gguf** model file.

> 🇷🇼 Numara gutoza: **siba byose** kuri mashine ya GPU, usigarane **.gguf** gusa.

---

## Quick fallback — Google Colab (free GPU, no local setup)
If GPU setup is hard, open `notebooks/intent_finetune_colab.ipynb` in **Google Colab**
(Runtime → GPU → Run all). Same notebooks, same datasets — also no production secrets.
