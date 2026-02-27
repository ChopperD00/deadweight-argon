# ARGON CREATIVE CONTEXT
**Last updated: 2026-02-27**
**Status: Active build — Pipeline Studio shipped, backend integration pending**

---

## Project Identity

- **Name**: Deadweight Argon (internal codename: ARGON)
- **Live URL**: [arg0n.dev](https://arg0n.dev)
- **Repo**: ChopperD00/deadweight-argon (branch: `main`)
- **Vercel project**: `deadweight-argon-pqvc`
- **Password gate**: `endofline`
- **Aesthetic**: ENCOM / Tron — cyan-on-black grid, terminal telemetry, phosphor glow, procedural geometry
- **Role in the ecosystem**: Argon is the creative production interface for the Inferis/Secret Menu pipeline — where campaigns are generated, characters are built, scripts become storyboards, and video is edited to beat

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 18 (Create React App) |
| Animation | Framer Motion 11 |
| Node editor | ReactFlow |
| State | Zustand |
| 3D / future | Three.js (installed, not yet used) |
| Canvas engine | Raw 2D Canvas API (EncomEngine.jsx) |
| Audio | Web Audio API (VideoEditor beat detection) |
| Deployment | Vercel (auto-deploy on main push) |
| Code push | GitHub MCP (git CLI auth broken in VM) |
| Backend API | localhost:7860 (Gradio/HuggingFace — not yet live) |

---

## Design Language

### Color Palette

| Token | Value | Use |
|-------|-------|-----|
| `--encom-cyan` | `#00EEEE` | Primary accent, borders, active states |
| `--encom-gold` | `#FFCC00` | Secondary accent, completed states, beat markers |
| `--encom-orange` | `#FF9933` | Tertiary / warning / energy |
| Background | `#000000` / near-black | Absolute black — no grays in base |
| `--encom-white` | `#E8F4F8` | Body text |
| `--encom-gray-light` | `#4A6B7A` | Muted labels |
| `--encom-gray-dark` | `#1A2A35` | Panel fills, card backgrounds |
| `--encom-cyan-dim` | `rgba(0,238,238,0.08)` | Ghost fills, hover states |
| `--encom-cyan-glow` | `0 0 20px rgba(0,238,238,0.4)` | Box shadows, pulse effects |

### Typography

| Token | Font | Use |
|-------|------|-----|
| `--font-display` | `'Orbitron', sans-serif` | Headers, mode labels, button text |
| `--font-mono` | `'Inconsolata', monospace` | Terminal readouts, code, metadata |
| Body | System sans | Secondary labels |

### Motion Principles
- **Perspective grid** as persistent orientation anchor
- **Particle rain** as ambient energy (88% cyan / 12% gold)
- **Pulse rings** for punctuation / event feedback
- **Glitch slices** for temporal disruption (periodic, not constant)
- **Scanlines** for CRT texture on canvas layer
- Framer Motion `AnimatePresence mode="wait"` for panel transitions
- `layoutId="modeIndicator"` animated underline for nav transitions

---

## Application Architecture

### Mode System (App.jsx)

Three modes, toggled from Header:

```
canvas    → Visual Canvas + EncomEngine background
nodes     → NodeEditor (ReactFlow) + EncomEngine background
pipeline  → PipelineStudio full-width (Sidebar + GenerationQueue hidden)
```

`isPipeline = mode === 'pipeline'` — when true, hides the left Sidebar and bottom GenerationQueue so pipeline sub-components have full canvas.

### Component Tree (as of Feb 27, 2026)

```
App.jsx
├── EncomEngine.jsx          (fixed z:0 canvas background — always rendered)
├── .encom-app (z:1)
│   ├── Header.jsx           (mode switcher: VISUAL CANVAS | NODE EDITOR | CREATION PIPELINE)
│   ├── Sidebar.jsx          (hidden in pipeline mode)
│   ├── [main content area]
│   │   ├── VisualCanvas.jsx (canvas mode — CSS/Framer Motion animations, NOT the engine)
│   │   ├── NodeEditor.jsx   (nodes mode — ReactFlow diagram)
│   │   └── PipelineStudio.jsx (pipeline mode)
│   │       ├── CharacterPipeline.jsx
│   │       ├── CharacterSheet.jsx
│   │       ├── ScriptStoryboard.jsx
│   │       └── VideoEditor.jsx
│   └── GenerationQueue.jsx  (bottom bar — hidden in pipeline mode)
```

---

## Components Reference

### EncomEngine.jsx
**Purpose**: Procedural canvas atmospheric engine, always-on background layer.
**Mount**: Fixed position, z-index 0, pointer-events none, 65% opacity default.
**Layers rendered each frame** (back to front):
1. Motion blur fill — `rgba(0,0,0,0.16)` per frame (NOT full clear)
2. Perspective grid — 22 horizontal + 28 vertical lines converging at VP `(W×0.5, H×0.08)`, horizontal lines power-curve distributed toward VP
3. Particle rain — 100 particles, 88% `#00EEEE` / 12% `#FFCC00`, varying speeds and alpha
4. Pulse rings — max 5 concurrent, spawn every ~160 frames at grid intersection points, expand and fade
5. Scanline band — rolling semi-transparent band descending the screen
6. HUD telemetry — Orbitron readouts top-right + bottom-left (frame counter, system stats flavor text)
7. Glitch slice — periodic horizontal strip of canvas self-reference via `ctx.drawImage()`, X-offset for displacement

**Key pattern**: `requestAnimationFrame` loop started in `useEffect`, cleanup cancels RAF + removes resize listener.

---

### PipelineStudio.jsx
**Purpose**: Root container for all 4 production pipeline tools.
**State**: `personas[]` array — shared across sub-components via `onSavePersona()` prop.
**Tabs**: CHARACTER PIPELINE | CHAR SHEET | SCRIPT→BOARD | VIDEO EDITOR
**Transition**: `AnimatePresence mode="wait"` between tab panels.

---

### CharacterPipeline.jsx
**Purpose**: 5-stage character creation pipeline (Reference → Ideate → Refine → Char Sheet → Output).
**Key behaviors**:
- Drag-drop + click reference image upload
- Stage progress tracked in state (`completedStages` Set)
- `runPipeline()` iterates stages 1–3, calls `onGenerate()` with stage-specific prompts
- SAVE AS PERSONA → calls `onSavePersona({ name, desc, model, ref, timestamp })`
- Ideation model selector: Flux / Krea / SDXL / Midjourney / DallE3
- Video model selector: Dream Machine / Kling 3.0 / Runway / Pika

---

### CharacterSheet.jsx
**Purpose**: Generate 6-pose consistency sheet for a character.
**Poses**: FRONT, 3/4 LEFT, SIDE, BACK, 3/4 RIGHT, PORTRAIT
**Key behaviors**:
- Anchor reference upload for visual lock
- Style lock field (text description of visual style to enforce across poses)
- Individual pose toggles (can disable specific poses)
- Output grid: 3 columns, each cell shows pose label + status (PENDING / GENERATING spinner / ✓ GENERATED)
- SAVE AS PERSONA saves `{ name, desc, style, ref, poses, timestamp }`

---

### ScriptStoryboard.jsx
**Purpose**: Parse a screenplay or scene description into a storyboard grid.
**Parsing logic**:
1. Primary: splits on `INT.` / `EXT.` scene headers (standard screenplay format)
2. Fallback: splits on double newlines (casual descriptions)
**Layout**: Left panel (script textarea + parse) | Right panel (scene card grid)
**Scene card**: 16:9 preview frame placeholder, scene number, scene header text, editable prompt textarea, GEN FRAME button
**GENERATE ALL**: sequentially calls `onGenerate()` per scene with respective prompt.

---

### VideoEditor.jsx
**Purpose**: Audio-driven video scene editor with per-scene art style assignment.
**Beat detection algorithm**:
```
detectBeats(buffer, threshold=0.15, minGap=0.28)
- Channel data: Float32Array from AudioContext.decodeAudioData
- Window: 20ms (sr × 0.02 samples)
- Energy: sum(sample²) / windowSize per window
- Beat detected when: (energy - prev_energy) > threshold AND gap > minGap seconds
- Smoothing: prev = energy × 0.55 + prev × 0.45
```
**Auto-segmentation**: `min(floor(beats.length / 4), 16)` scenes, equal-duration segments.
**Scene slot layout**: `90px (meta) | 150px (art style selector) | 1fr (prompt) | 46px (duration)`
**Art styles**: ENCOM GRID | NOIR SKETCH | ANIME CEL | OIL PAINT | GLITCH ART | WATERCOLOR | PIXEL ART | BRUTALIST
**Waveform canvas**: Draws waveform + gold beat markers + cyan scene segment overlays + cyan playhead
**Playhead**: Simulated via `setInterval` (no actual video playback yet)

---

## Backend API (Not Yet Live)

All generation calls in the frontend use a placeholder `onGenerate()` prop that logs to console. The intended backend:

```
Base: http://localhost:7860 (Gradio/HuggingFace Spaces or local ComfyUI/A1111)

Anticipated endpoints:
POST /api/generate/image   { prompt, model, reference_image?, width, height }
POST /api/generate/video   { prompt, model, source_image?, duration }
POST /api/generate/pose    { prompt, pose, reference_image, style_lock }
```

**Integration plan**: Replace `onGenerate()` mock with actual fetch calls in PipelineStudio.jsx, pass down via props. Add loading states + result display to each sub-component.

---

## Persona System

The `personas[]` array is managed at the PipelineStudio level and passed down to CharacterPipeline and CharacterSheet. Currently in-memory only (no persistence).

**Persona schema**:
```json
{
  "name": "string",
  "desc": "string",
  "style": "string (optional — CharacterSheet only)",
  "ref": "data URL or null",
  "poses": ["FRONT", "3/4 LEFT", ...],
  "model": "string (CharacterPipeline only)",
  "timestamp": "ISO string"
}
```

**Next step**: Persist to localStorage or Zustand store, expose in the Sidebar as a character library.

---

## Build History

| Commit | Date | What shipped |
|--------|------|-------------|
| `eb7f926` | 2026-02-27 | EncomEngine.jsx — canvas atmospheric background; App.jsx updated to mount it |
| `9b00e41` | 2026-02-27 | PipelineStudio + 4 sub-modules; Header CREATION PIPELINE button; App.jsx pipeline mode |

---

## What's Built vs. What Remains

### ✅ Shipped
- EncomEngine canvas background (perspective grid, particles, pulse rings, scanlines, HUD, glitch)
- PipelineStudio container with 4-tab layout
- CharacterPipeline 5-stage UI
- CharacterSheet 6-pose UI
- ScriptStoryboard parser + grid UI
- VideoEditor beat detection + waveform + scene slots + art style selector
- Header mode switcher (VISUAL CANVAS | NODE EDITOR | CREATION PIPELINE)
- Pipeline mode hides Sidebar + GenerationQueue

### 🔧 Next to Build
- **Backend API integration** — wire `onGenerate()` to real localhost:7860 endpoints
- **Image result display** — show generated images in pipeline cards, pose slots, storyboard frames
- **Persona persistence** — Zustand store + Sidebar character library panel
- **Video export** — compile scene frames + audio into exportable video (ffmpeg.wasm)
- **VisualCanvas upgrade** — either merge with EncomEngine or delete (it's CSS-only, redundant)
- **NodeEditor wiring** — ReactFlow nodes to trigger generation jobs
- **Séance integration** — hook mood/direction sliders (INTENSITY, ORGANIC, WARMTH, etc.) to generation parameters
- **Inferis backend** — swap localhost:7860 for Inferis orchestration layer when Phase 2 ships

---

## Related Projects

| Project | Relationship |
|---------|-------------|
| **Inferis** (inferis.app / ChopperD00/solus-forge-next) | The AI orchestration backend Argon will eventually call. Phase 2 (pipeline.ts) is the bridge. |
| **Good Lookin' Corpse** (goodlookincorp.se) | Separate aesthetic / proving ground. No direct code overlap with Argon. |
| **Séance** | Creative direction interface — mood sliders that will map to Argon's generation params |

---

## Session Resume Instructions

To pick up Argon in a new Cowork session:

1. Load this file + SECRET-MENU-MASTER-KEY.md from the workspace folder
2. Point Claude at repo `ChopperD00/deadweight-argon` (main branch)
3. Key context: ENCOM/Tron aesthetic, React 18 CRA, generation UI only (no real backend yet)
4. Password: `endofline` — live at arg0n.dev
5. Say what you want to build next (backend API, persona persistence, video export, etc.)
