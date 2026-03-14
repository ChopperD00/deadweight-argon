# ARG0N.DEV — Cowork/Code Build Brief
## Agent Task: UI Polish + Feature Build

> **Repo:** github.com/ChopperD00/deadweight-argon (main branch)
> **Live at:** https://arg0n.dev (Vercel auto-deploy on push)
> **API Backend:** https://ryujin.inferis.app/api/argon/*
> **Stack:** Next.js 15 + Tailwind 3 + TypeScript
> **Design DNA:** Flora (florafauna.ai) × Diagram (diagram.com)

---

## WHAT'S LIVE NOW (v1.0)
- Dark canvas UI (#0a0a0a), Geist + Fragment Mono fonts
- Video/Image/Audio tabs with model selector
- 6 video providers: Luma ray-2 (direct), Kling 2.5, Hailuo 2.3, Veo 3, Wan 2.5, Runway Gen-4 (via Krea)
- 3 image providers: Replicate Flux, Krea Flux Dev, Krea Imagen 4
- 1 audio provider: ElevenLabs v2
- Job polling for both Argon API and Krea API
- Output panel with video/image/audio playback + CDN links
- Aspect ratio + duration controls

## API ENDPOINTS (all live, tested)

### Argon (ryujin.inferis.app)
```
GET  /api/argon/tools          — list tools + env status
POST /api/argon/generate/video — {prompt, provider, aspectRatio, duration}
POST /api/argon/generate/image — {prompt, width, height}
POST /api/argon/generate/audio — {text, voiceId}
GET  /api/argon/jobs           — list all jobs
GET  /api/argon/jobs/:id       — poll job status
POST /api/argon/execute        — generic {tool, params}
```

### Krea (api.krea.ai)
```
Base: https://api.krea.ai
Auth: Bearer 66eb338a-e1a9-4a69-bc3c-63ee9de86df2:4y-UB7mcv7c1iJTfkrjxHyz-NyJrQgu-
Poll: GET /jobs/{job_id}
Result: job.result.urls[0] → CDN URL

Video endpoints:
POST /generate/video/kling/kling-2.5    {prompt, aspectRatio, duration}
POST /generate/video/minimax/hailuo-2.3 {prompt, aspectRatio, duration}
POST /generate/video/google/veo-3       {prompt, aspectRatio, duration}
POST /generate/video/alibaba/wan-2.5    {prompt, aspectRatio, duration}
POST /generate/video/runway/gen-4       {prompt, aspectRatio, duration}

Image endpoints:
POST /generate/image/bfl/flux-1-dev     {prompt, width, height}
POST /generate/image/google/imagen-4    {prompt, width, height}
```

## BUILD PRIORITIES (in order)

### P0 — Polish (do first)
- [ ] Add framer-motion page transitions + stagger animations
- [ ] Loading shimmer on generate button while processing
- [ ] Toast notifications for job completion/failure
- [ ] Auto-scroll to new job in output panel
- [ ] ⌘+Enter keyboard shortcut visual feedback
- [ ] Responsive mobile layout fixes

### P1 — Output Experience
- [ ] Thumbnail grid view for completed jobs (not just list)
- [ ] Full-screen lightbox for video/image playback
- [ ] Download button for CDN assets
- [ ] Copy CDN URL to clipboard
- [ ] Job duration timer (show elapsed time while polling)

### P2 — Model Intelligence
- [ ] Provider comparison card — show cost/speed/quality matrix
- [ ] "Recommended" badge on best model per use case
- [ ] Provider health indicators (green dot = API responding)
- [ ] Reference image upload for image-to-video (Luma keyframes, Krea startImage)

### P3 — History + Persistence
- [ ] Save generation history to localStorage
- [ ] Reload previous jobs on page load
- [ ] "Regenerate" button on completed jobs
- [ ] Export job results as JSON

### P4 — Advanced
- [ ] Prompt templates / presets (brand reveal, product shot, social content)
- [ ] Batch generation (same prompt across multiple providers)
- [ ] Side-by-side comparison of outputs from different providers
- [ ] Webhook URL support (X-Webhook-URL header for Krea)

## DESIGN SYSTEM

### Colors
```
surface-0: #0a0a0a (background)
surface-1: #111113 (cards)
surface-2: #18181b (inputs, nested)
surface-3: #1e1e22 (active states)
accent:    #7c6af7 (purple, primary actions)
success:   #4ade80 (complete states)
warn:      #f59e0b (processing states)
err:       #ef4444 (failed states)
text:      rgba(255,255,255,0.9)
text-muted: rgba(255,255,255,0.3)
text-dim:  rgba(255,255,255,0.15)
border:    rgba(255,255,255,0.06)
```

### Typography
- Headers: font-mono (Fragment Mono), tracking-[0.2em], UPPERCASE, text-[10px]
- Body: font-sans (Geist), text-sm
- Values: font-mono, tabular-nums

### Components Pattern
- Cards: bg-surface-1 border border-white/[0.06] rounded-xl p-5
- Buttons active: bg-accent text-white rounded-xl
- Labels: font-mono text-[10px] tracking-[0.2em] text-white/25 uppercase
- Status badges: font-mono text-[9px] tracking-[0.12em] px-2 py-0.5 rounded

## DEPLOY
Push to main → Vercel auto-deploys → live at arg0n.dev in ~30s
No env vars needed on Vercel — API calls go directly to ryujin + krea

## CONTEXT
This is Secret Menu's creative generation engine (Inferis/Chimera).
The UI should feel like a professional creative tool, not a chatbot.
Think: Flora's canvas aesthetic + Diagram's tool-first UX.
Minimal chrome. Let the outputs breathe. Every pixel earned.

---

## P5 — PRODUCT DIFFERENTIATORS (circle back — Phil's priority)

These are the two features Phil considers the biggest gaps in the entire AI gen space. Nobody is handling these well. This is where arg0n becomes more than another generation UI.

### 5A. Upload + Reference System
- Upload image/video as start frame, end frame, or style reference
- Motion transfer: upload a video, extract motion, apply to new generation
- Inspiration board: drag in references that inform but don't dictate
- Krea supports startImage/endImage on most video models — wire that
- Luma supports keyframes (frame0/frame1) — already in argon.ts
- This is the bridge between "generate from nothing" and "generate from MY thing"

### 5B. Persistent Workspace + Asset Library
- Saved workflows: prompt + model + params + output = reusable recipe
- Generation history with thumbnails, searchable, filterable
- Asset library: every generated image/video/audio lives in a project
- Project context: new generations can reference past outputs as inputs
- Cross-project consistency: brand assets, style references, character sheets carry forward
- This is where Krea/Runway/Flora all fall short — they're session-based, not project-based
- Backend: Supabase (already configured on Ryujin) for persistence
- Storage: Supabase Storage or S3 for asset CDN

### Why This Matters
Every tool treats each generation as isolated. But creative work is cumulative.
A brand reveal informs the social content which informs the email which informs the next campaign.
The tool that connects generations into a living project graph wins the market.
