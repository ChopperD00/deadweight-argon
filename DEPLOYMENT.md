# Argon — Deployment Guide

**Stack**: Vercel (React frontend) → Modal.com (GPU backend, ComfyUI + LoRA injection)

Designers open `arg0n.dev`. That's it on their end. This doc is for Phil.

---

## Prerequisites

```bash
pip install modal
```

Accounts at:
- [modal.com](https://modal.com) — pay-per-second GPU, no idle cost
- [civitai.com](https://civitai.com) — for LoRA downloads

---

## Step 1 — Modal auth

```bash
modal setup
```

Opens browser, logs you in. One time only.

---

## Step 2 — Add CivitAI secret to Modal

```bash
modal secret create argon-secrets CIVITAI_API_KEY=your_key_here
```

Get your key at [civitai.com/user/account](https://civitai.com/user/account) → API Keys.

---

## Step 3 — Deploy the GPU backend

```bash
modal deploy modal_server.py
```

First build takes ~5 min (ComfyUI + custom nodes). Subsequent deploys are fast.

Modal prints a URL:
```
✓ Created web endpoint => https://chopperd00--deadweight-argon-argon-api.modal.run
```

Copy that URL.

---

## Step 4 — Update vercel.json

In `vercel.json`, replace `REPLACE_WITH_MODAL_URL_AFTER_DEPLOY` with your Modal URL:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://chopperd00--deadweight-argon-argon-api.modal.run/api/:path*"
    }
  ]
}
```

Push to GitHub → Vercel auto-deploys.

---

## Step 5 — Verify

Open [arg0n.dev/api/health](https://arg0n.dev/api/health):

```json
{ "status": "ok", "version": "0.1.0", "backend": "modal" }
```

First request after idle can take 30–60s (cold start). Normal.

---

## Using LoRAs from CivitAI

Download once, cached forever on Modal Volume.

```bash
# Download by CivitAI version ID
curl -X POST https://arg0n.dev/api/loras/download \
  -H 'Content-Type: application/json' \
  -d '{ "versionId": "123456" }'

# List cached LoRAs
curl https://arg0n.dev/api/loras
```

Find version IDs on CivitAI model pages: `civitai.com/models/XXXXX?modelVersionId=YYYYY` — use `YYYYY`.

LoRA paths returned from `/api/loras` can be passed as `loraPaths` to any generation or transfer endpoint.

---

## Local Dev (no GPU needed)

```bash
# Terminal 1 — mock server
node argon-server.js

# Terminal 2 — React
npm start
```

React auto-detects `NODE_ENV=development` and hits `localhost:7860`.

---

## GPU Costs (Modal)

| GPU  | $/hr approx | Use case |
|------|-------------|----------|
| T4   | ~$0.59      | Analysis, expression transfer |
| L4   | ~$0.80      | Default — good balance |
| A10G | ~$1.10      | Faster ComfyUI generation |

Containers sleep after 300s idle — no idle cost. Change GPU in `modal_server.py`:

```python
@app.cls(gpu="A10G", ...)  # upgrade for faster generation
```

---

## Troubleshooting

**`/api/health` returns 502**: Modal container is down. Run `modal deploy modal_server.py` again.

**LoRA download fails**: Check `CIVITAI_API_KEY` is set (`modal secret list`).

**Vercel 404 on `/api/*`**: Check `vercel.json` rewrite destination matches your Modal URL.

---

## File Map

```
deadweight-argon/
├── src/lib/argon-client.js     # React API client (env-aware)
├── modal_server.py              # Modal GPU backend — deploy this
├── argon-server.js              # Local mock server — dev only
├── vercel.json                  # Rewrite: /api/* → Modal
├── .env.example                 # Copy to .env.local
├── DEPLOYMENT.md                # This file
└── ARGON-ANALYSIS-SCHEMA.md    # TypeScript type contracts
```
