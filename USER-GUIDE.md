# ARGON — User Guide
### Motion Analysis & Character Animation System
**arg0n.dev** · v0.1.0 · deadweight-argon

---

## What Is Argon?

Argon is a browser-based tool for extracting motion and expression data from reference footage and applying it to original characters. You upload a video or image, Argon reads the body pose, face landmarks, and expression values out of it, and lets you drive a character with that data — in your style, with your models, with your LoRAs.

The pipeline runs on GPU in the cloud. No local install. You open the URL, do your work, it renders.

Three things Argon does:

1. **Analyze** — pull skeleton pose, facial expression coefficients, and segmentation masks from any reference footage
2. **Transfer** — apply that motion and expression data to a character image via LivePortrait
3. **Generate** — create new character frames using pose conditioning, style prompts, and CivitAI LoRAs

---

## The Stack (Plain English)

| Layer | What It Does | Technology |
|-------|-------------|----------|
| Interface | The thing you use in the browser | React / arg0n.dev |
| API Routing | Sends requests to the right place | Vercel rewrites |
| GPU Backend | Runs the actual models | Modal.com (cloud GPU) |
| Motion Extraction | Reads body skeleton from video | DWPose via ComfyUI |
| Face Analysis | 468-point face landmarks + expression | MediaPipe |
| Expression Drive | Animates a character still | LivePortrait |
| Segmentation | Isolates face / hair / body | BiRefNet |
| Image Generation | Text-to-image with pose + LoRA | ComfyUI (SDXL/Flux) |
| LoRA Storage | Caches downloaded LoRAs permanently | Modal Volume |

---

## Expression System

When Argon reads a face, it extracts **16 expression coefficients** — continuous 0–1 values that describe what the face is doing. These are the parameters that drive character animation.

```
jaw           — mouth openness
mouthOpen     — jaw drop
mouthCornerUp — smile
browInner     — inner brow raise (concern, surprise)
browOuter     — outer brow lift
browFurrow    — furrowed brow (anger, concentration)
eyeWide       — wide eyes (surprise, fear)
eyeClose      — blink / squint
cheekRaise    — cheek lift (smile engagement)
noseFlair     — nostril flare (emotion intensity)
```

Plus an **emotion vector** (PAD model):
- `valence` — positive/negative emotional charge
- `arousal`  — energy level (calm → excited)
- `dominance` — assertive vs. submissive

And discrete emotion classification: `neutral / happy / sad / angry / surprised / fearful / disgusted / contempt`

These values are what LivePortrait uses to drive the character. They’re also what the Séance direction sliders will map to when that interface is wired in.

---

## Beat Sync

Argon supports a `BeatEmotionCurve` — a timeline of beat markers that modulate expression intensity. When you pass beat data into a sequence transfer, expressions peak on downbeats and relax between them. The character breathes with the music.

This is designed to connect directly to VideoEditor beat detection output (or any BPM tool that can export timestamp arrays).

---

## Theoretical Workflows

---

### Workflow 1 — Character Animation from Reference Video

**Goal**: A character moves and emotes like a reference performer, but in your visual style.

**Steps**:

1. Open Argon → **Analyze → Motion**
2. Upload your reference video (dancer, actor, performance clip)
3. Argon extracts: body skeleton per frame + expression coefficients per frame → returns a `MotionTrack` ID
4. Go to **Transfer → Sequence**
5. Upload your character still (a clean portrait or character sheet render)
6. Paste the MotionTrack ID
7. (Optional) Add a style prompt — describes the output look
8. (Optional) Add LoRA paths from your cached library
9. Hit run → Argon renders each frame: pose conditioning + LivePortrait expression drive → outputs frame sequence

**Output**: Frame-by-frame animation in your character's visual style, driven by the reference performer's actual motion and expression data.

**Use cases**: Character acting sequences, promo animations, reference-locked character performance

---

### Workflow 2 — Beat-Synced Music Video Loop

**Goal**: A character reacts expressively to music, with emotion peaks hitting on downbeats.

**Steps**:

1. Get your beat timestamps (BPM tool or VideoEditor export) as an array: `[{ "timeMs": 0 }, { "timeMs": 500 }, ...]`
2. **Analyze → Motion** — upload reference footage (or use a mock MotionTrack)
3. **Transfer → Sequence**
4. Pass the beat array as `beatCurve` in the request
5. Argon modulates expression intensity: expressions scale up approaching each beat, relax after

**Output**: Animation where the character’s emotional expressiveness breathes with the rhythm.

**Note**: This is expression modulation, not lipsynch. Think energy and emotion, not words.

---

### Workflow 3 — CivitAI Style Injection

**Goal**: Generate character frames in a specific aesthetic from a CivitAI LoRA.

**Steps**:

1. Find your LoRA on [civitai.com](https://civitai.com) — grab the version ID from the URL (`?modelVersionId=XXXXX`)
2. **LoRAs → Download** — paste version ID → Argon downloads and caches it (one-time, ~30 seconds)
3. **Generate → Image** — write your prompt, select the LoRA from your cached library
4. Or pass `loraPaths` into **Transfer → Sequence** to style the entire animation output

**Output**: Generated or animated frames in the visual style encoded in the LoRA.

**Tip**: LoRAs persist on Modal Volume indefinitely — download once, available forever.

---

### Workflow 4 — Character Sheet Generation

**Goal**: Generate canonical character poses (front / 3⁏4 / side / back) from a reference or prompt.

**Steps**:

1. (Optional) Upload a reference image for identity locking
2. **Generate → Pose** — write a character description prompt
3. Select pose: `FRONT`, `THREE_QUARTER`, `SIDE`, `BACK`
4. Add LoRAs for style consistency
5. Repeat for each angle — pass `identityLock` hash between requests to maintain consistency

**Output**: A set of character sheet renders with consistent identity across angles.

---

### Workflow 5 — Expression Analysis for a Single Frame

**Goal**: Extract expression data from a still photo for use in a later transfer.

**Steps**:

1. **Analyze → Expression** — upload image
2. Argon returns: 16 expression coefficients + emotion vector + ARKit blendshapes (52 values)
3. Save or pipe those values into **Transfer → Expression** with a different character image

**Output**: The source face’s expression mapped onto your character.

**Use case**: Reference matching, facial performance keyframing

---

### Workflow 6 — Segmentation for Compositing

**Goal**: Pull a clean mask for a character region.

**Steps**:

1. **Analyze → Segment** — upload image, select region: `face`, `hair`, `body`, or `full`
2. Argon runs BiRefNet → returns a mask as base64 PNG
3. Use the mask in your compositing tool

**Output**: Clean alpha mask. Works on stylized / illustrated characters.

---

## API Summary

All endpoints at `/api/*` — Vercel proxies to Modal automatically.

| Endpoint | Method | What It Does |
|----------|--------|-------------|
| `/api/health` | GET | Check backend status |
| `/api/analyze/motion` | POST | Full MotionTrack from video/image |
| `/api/analyze/expression` | POST | Expression coefficients from image |
| `/api/analyze/face` | POST | 468 MediaPipe landmarks + ARKit blendshapes |
| `/api/analyze/segment` | POST | BiRefNet mask for face/hair/body |
| `/api/transfer/expression` | POST | Apply expression to character (single frame) |
| `/api/transfer/sequence` | POST | Beat-synced animated sequence |
| `/api/generate/image` | POST | Text-to-image with LoRA injection |
| `/api/generate/pose` | POST | Pose-conditioned character generation |
| `/api/loras/download` | POST | Download LoRA from CivitAI by version ID |
| `/api/loras` | GET | List cached LoRAs |
| `/api/jobs/:jobId` | GET | Poll async job status |
| `/api/events` | GET | SSE stream for real-time updates |

Async endpoints return a `jobId` immediately. Poll `/api/jobs/:jobId` until `status: "done"`.

---

## Mock Mode

When GPU models aren’t loaded, every endpoint returns **synthetic mock data** with the correct data shape. Mock motion tracks use sinusoidal curves — body sways, expressions breathe at natural frequencies.

Frontend development can run against mock data without waiting on the GPU pipeline. Data contract is identical.

---

## LoRA Management

LoRAs are cached on Modal’s persistent Volume at `/models/loras/`. They survive deploys, restarts, and team sessions.

- **Download**: POST `versionId` from CivitAI URL
- **List**: GET `/api/loras` — filename, size, cache timestamp
- **Use**: Pass path(s) from list response as `loraPaths` in any generate or transfer request

---

## Current Status

| Capability | Status |
|-----------|--------|
| MediaPipe face analysis (468 landmarks) | ✅ Wired |
| Expression coefficient extraction | ✅ Wired |
| Mock MotionTrack (sinusoidal dev data) | ✅ Wired |
| CivitAI LoRA download + cache | ✅ Wired |
| Modal Volume persistence | ✅ Wired |
| Job queue + async polling | ✅ Wired |
| SSE event stream | ✅ Wired |
| Vercel → Modal routing | ✅ Wired (pending URL update after deploy) |
| DWPose body skeleton | 🔧 Stub (ComfyUI workflow TBD) |
| LivePortrait expression drive | 🔧 Stub (ComfyUI workflow TBD) |
| BiRefNet segmentation | 🔧 Stub (ComfyUI workflow TBD) |
| ComfyUI image generation | 🔧 Stub (ComfyUI workflow TBD) |
| Beat sync modulation | ✅ Logic wired, needs real MotionTrack data |
| React UI | 🏗 In development |

Infrastructure is production-ready. ComfyUI workflow implementations are the next build phase.

---

## Glossary

**MotionTrack** — The core data object. Frame-by-frame timeline of body pose + expression coefficients. Gets a `trackId` at creation.

**ExpressionCoefficients** — 16 continuous values (0–1) describing what a face is doing at a moment in time.

**LoRA** — “Low-Rank Adaptation” — a small model file that bends an image generation model toward a specific style or character. Downloaded from CivitAI.

**BeatEmotionCurve** — Array of beat timestamps used to modulate expression intensity over time.

**Modal Volume** — Persistent cloud storage on the GPU containers. LoRAs cached here survive deploys.

**LivePortrait** — Drives expression transfer: character still + expression coefficients → animated frame.

**DWPose** — Body skeleton extraction. Reads joint positions from video via ComfyUI ControlNet.

**BiRefNet** — Segmentation model. Clean alpha masks for face, hair, body. Works on stylized imagery.

**PAD Model** — Pleasure-Arousal-Dominance — 3-axis continuous emotion representation.

---

*Argon is a Secret Menu / goodlookincorp project · arg0n.dev*
