# DEADWEIGHT ENCOM Interface

A Tron Legacy-inspired frontend for the DEADWEIGHT POC, combining the visual design of Krea/Dream Machine with a FloraFauna-style node-based workflow editor.

## Features

### 🎨 Visual Canvas (Krea/Dream Machine Style)
- Drag-and-drop image upload
- Infinite canvas with zoom/pan controls
- Real-time generation preview
- Quick prompt bar for rapid iteration
- Generation history with metadata

### 🔗 Node Editor (FloraFauna Style)
- Visual node-based workflow builder
- Connect prompts → generators → outputs
- Support for:
  - Prompt Input Nodes
  - Image Generation Nodes (FLUX, SDXL)
  - Video Generation Nodes (Luma, Runway, Kling, Veo)
  - Model Recommender Nodes
  - Output Preview Nodes
- Execute entire workflows with one click

### 🎯 ENCOM Boardroom Aesthetic
- Dark sci-fi theme with cyan/teal accents
- Gold highlights for video elements
- Pulsing glow animations
- Grid background pattern
- Scanline overlay effect
- HUD corner indicators
- Real-time status indicators

## Tech Stack

- **React 18** - UI Framework
- **ReactFlow** - Node editor
- **Framer Motion** - Animations
- **Zustand** - State management
- **Three.js** - 3D effects (optional)

## Installation

```bash
cd encom-frontend
npm install
npm start
```

## Configuration

Set the backend API URL in your environment:

```bash
REACT_APP_API_URL=http://localhost:7860
```

Or for HuggingFace Spaces:

```bash
REACT_APP_API_URL=https://your-space.hf.space
```

## API Endpoints

The frontend expects these endpoints from the backend:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Backend status check |
| `/api/generate` | POST | Image generation |
| `/api/generate-video` | POST | Video generation |

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Black | `#000000` | Background |
| Cyan | `#00EEEE` | Primary accent, image elements |
| Gold | `#FFCC00` | Video elements, highlights |
| Orange | `#FF9933` | Recommender, special features |
| White | `#FFFFFF` | Text |
| Gray | `#333333` - `#AAAAAA` | Borders, muted elements |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Toggle between Canvas/Node modes |
| `Space` | Generate (when prompt focused) |
| `Cmd/Ctrl + S` | Save workflow |
| `Cmd/Ctrl + Z` | Undo |
| `+` / `-` | Zoom in/out |
| `0` | Reset zoom |

## Node Types

### Prompt Input
Input node for text prompts. Outputs to generation nodes.

### Image Generate
Generates images using FLUX or SDXL models.
- Inputs: Prompt
- Outputs: Image
- Settings: Model, Width, Height, Steps, Guidance

### Video Generate
Generates videos using various backends.
- Inputs: Prompt, Image (optional)
- Outputs: Video
- Settings: Backend, Duration

### Model Recommender
Analyzes prompts and recommends optimal models.
- Inputs: Prompt
- Outputs: Model ID, Settings

### Output
Displays generation results.
- Inputs: Image or Video

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ENCOM FRONTEND                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Header    │  │   Content    │  │    Queue      │  │
│  │  + Status   │  │ (Canvas/Node)│  │  + History    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┤
│  │                    Sidebar                          │
│  │  • Image Generation                                 │
│  │  • Video Generation                                 │
│  │  • System Settings                                  │
│  └─────────────────────────────────────────────────────┤
├─────────────────────────────────────────────────────────┤
│                     Status Bar                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 DEADWEIGHT BACKEND                      │
│            (Gradio/HuggingFace Space)                   │
├─────────────────────────────────────────────────────────┤
│  • FLUX Schnell (HuggingFace)                          │
│  • FLUX Dev + LoRA (Replicate)                         │
│  • SDXL (HuggingFace/Replicate)                        │
│  • Luma Dream Machine                                   │
│  • Runway Gen-3 Alpha                                   │
│  • Kling AI                                            │
│  • Google Veo 2                                        │
│  • Stable Video Diffusion                              │
└─────────────────────────────────────────────────────────┘
```

## Development

### Running in Development

```bash
npm start
```

### Building for Production

```bash
npm run build
```

### Deploying to Vercel

```bash
npx vercel
```

## Credits

- ENCOM Boardroom design inspired by Tron: Legacy (Disney)
- Original boardroom implementation by [Rob Scanlon](https://github.com/arscan/encom-boardroom)
- Visual canvas inspired by [Krea AI](https://krea.ai) and [Luma Dream Machine](https://lumalabs.ai)
- Node editor inspired by [FloraFauna](https://florafauna.ai) and ComfyUI

## License

MIT License - Part of the DEADWEIGHT POC project.
