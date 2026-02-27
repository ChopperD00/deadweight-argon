# ARGON ANALYSIS SCHEMA
**Version: 1.0.0**
**Last updated: 2026-02-27**
**Status: Active — argon-server.js v1 data contracts**

> This document is the canonical data contract for the Argon analysis + transfer pipeline.
> All types are expressed as TypeScript interfaces for readability. argon-server.js implements
> these shapes in plain JSON. Frontend consumers (CharacterPipeline, VideoEditor, etc.) should
> treat these as the ground truth for what the API returns.

---

## Table of Contents

1. [Core Primitives](#1-core-primitives)
2. [Motion Analysis Types](#2-motion-analysis-types)
3. [Face Analysis Types](#3-face-analysis-types)
4. [Transfer Types](#4-transfer-types)
5. [Generation Types](#5-generation-types)
6. [Job System Types](#6-job-system-types)
7. [API Endpoints — Full Contract](#7-api-endpoints--full-contract)
8. [Beat Emotion Curve Integration](#8-beat-emotion-curve-integration)
9. [Mock Data Shapes](#9-mock-data-shapes)
10. [Error Shapes](#10-error-shapes)
11. [Design Notes](#11-design-notes)

---

## 1. Core Primitives

### Vector2
```typescript
interface Vector2 {
  x: number;    // normalized 0.0–1.0 (fraction of frame width/height)
  y: number;
}
```

### Vector3
```typescript
interface Vector3 {
  x: number;
  y: number;
  z: number;    // depth — positive = toward camera
}
```

### Quaternion
```typescript
interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}
```

### RGB
```typescript
interface RGB {
  r: number;    // 0–255
  g: number;
  b: number;
}
```

### RGBA
```typescript
interface RGBA extends RGB {
  a: number;    // 0.0–1.0
}
```

### BoundingBox
```typescript
interface BoundingBox {
  x:      number;   // top-left, normalized
  y:      number;
  width:  number;   // normalized 0.0–1.0
  height: number;
}
```

---

## 2. Motion Analysis Types

### JointId
Named constants for the 25-joint DWPose body skeleton.

```typescript
type JointId =
  | 'nose'
  | 'neck'
  | 'right_shoulder' | 'right_elbow' | 'right_wrist'
  | 'left_shoulder'  | 'left_elbow'  | 'left_wrist'
  | 'right_hip'      | 'right_knee'  | 'right_ankle'
  | 'left_hip'       | 'left_knee'   | 'left_ankle'
  | 'right_eye'      | 'left_eye'
  | 'right_ear'      | 'left_ear'
  | 'chest_center'
  | 'spine_mid'
  | 'pelvis'
  | 'right_hand_center' | 'left_hand_center'
  | 'right_foot_center' | 'left_foot_center';
```

### Joint
```typescript
interface Joint {
  id:         JointId;
  position:   Vector3;       // normalized 3D position in frame space
  confidence: number;        // 0.0–1.0 — DWPose keypoint confidence
  velocity:   Vector3;       // delta position per frame (for motion energy)
}
```

### JointMap
Full skeleton at a single point in time.

```typescript
interface JointMap {
  joints:       Record<JointId, Joint>;
  confidence:   number;       // mean keypoint confidence across body
  poseClass:    PoseClass;
  bodyBounds:   BoundingBox;
}

type PoseClass =
  | 'standing'
  | 'sitting'
  | 'walking'
  | 'running'
  | 'gesture_reach'
  | 'gesture_point'
  | 'profile_left'
  | 'profile_right'
  | 'occluded'
  | 'multi_person'
  | 'unknown';
```

### HeadPose
Euler angle decomposition for head orientation — feeds LivePortrait yaw/pitch/roll.

```typescript
interface HeadPose {
  yaw:   number;   // degrees — left/right turn
  pitch: number;   // degrees — nod up/down
  roll:  number;   // degrees — tilt left/right
  // Euler rotation order: YXZ
}
```

### MotionFrame
Single frame of the full motion capture result.

```typescript
interface MotionFrame {
  frameIndex:  number;
  timeMs:      number;         // absolute timestamp in ms from track start
  joints:      JointMap;
  head:        HeadPose;
  expression:  ExpressionCoefficients;
  landmarks:   FaceLandmarkFrame | null;   // null if face not visible this frame
  motionEnergy: number;        // 0.0–1.0 — overall body kinetic energy (mean joint velocity magnitude)
  faceVisible:  boolean;
}
```

### MotionTrack
Full extracted motion track from a source video. This is the primary deliverable of `/api/analyze/motion`.

```typescript
interface MotionTrack {
  id:           string;        // UUID — used to reference this track in transfer calls
  source:       string;        // original filename or URL
  fps:          number;        // detected or specified frame rate
  durationMs:   number;
  frameCount:   number;
  frames:       MotionFrame[];

  // Summary statistics
  summary: {
    meanMotionEnergy:   number;
    peakMotionEnergy:   number;
    dominantPoseClass:  PoseClass;
    faceVisibleRatio:   number;   // 0.0–1.0 — % of frames where face was detected
    expressionRange:    ExpressionRange;
  };

  meta: {
    extractedAt:   string;         // ISO timestamp
    models:        string[];       // e.g. ['dwpose', 'liveportrait', 'mediapipe']
    mock:          boolean;        // true if server fell back to synthetic data
  };
}
```

### ExpressionRange
Summary of expression coefficient variance across the track — useful for conditioning transfer intensity.

```typescript
interface ExpressionRange {
  jaw:              { min: number; max: number; mean: number };
  browInner:        { min: number; max: number; mean: number };
  browOuter:        { min: number; max: number; mean: number };
  eyeWide:          { min: number; max: number; mean: number };
  eyeClose:         { min: number; max: number; mean: number };
  mouthOpen:        { min: number; max: number; mean: number };
  mouthCornerUp:    { min: number; max: number; mean: number };
  mouthCornerDown:  { min: number; max: number; mean: number };
  noseFlair:        { min: number; max: number; mean: number };
  cheekRaise:       { min: number; max: number; mean: number };
  intensityMean:    number;    // 0.0–1.0 — mean overall expressiveness
  intensityPeak:    number;
}
```

---

## 3. Face Analysis Types

### ExpressionCoefficients
Per-frame EMOCA/DECA-style expression coefficients. All values normalized 0.0–1.0
(0 = neutral / closed / flat, 1 = maximum activation) except emotionVector.

```typescript
interface ExpressionCoefficients {
  // Jaw & Mouth
  jaw:              number;    // 0=closed, 1=fully open
  mouthOpen:        number;    // wider opening (distinct from jaw angle)
  mouthCornerUp:    number;    // smile — bilateral
  mouthCornerDown:  number;    // frown / disgust pull
  lipPucker:        number;    // kiss / pout
  lipStretch:       number;    // wide grin / fear stretch

  // Brows
  browInner:        number;    // inner brow raise (concern/surprise)
  browOuter:        number;    // outer brow raise (surprise peak)
  browFurrow:       number;    // brow knit (anger/concentration)

  // Eyes
  eyeWide:          number;    // eye opening (surprise/alert)
  eyeClose:         number;    // squint/close (joy/pain)
  eyeSquint:        number;    // lateral squint (suspicion)

  // Cheeks & Nose
  cheekRaise:       number;    // cheek puff / joy
  noseFlair:        number;    // nostril flare (anger/exertion)
  noseWrinkle:      number;    // disgust

  // Derived emotion space (PAD model — Pleasure–Arousal–Dominance)
  emotionVector: {
    valence:    number;     // -1.0 (negative) to 1.0 (positive)
    arousal:    number;     // -1.0 (calm) to 1.0 (excited)
    dominance:  number;     // -1.0 (submissive) to 1.0 (dominant)
  };

  // Discrete emotion classification (softmax probabilities)
  emotionClass: {
    neutral:    number;
    happy:      number;
    sad:        number;
    angry:      number;
    surprised:  number;
    fearful:    number;
    disgusted:  number;
    contempt:   number;
  };

  // Rolled-up intensity for beat curve use
  intensity:  number;    // 0.0–1.0 — weighted mean activation across all coefficients
}
```

### FaceLandmark
Single MediaPipe FaceMesh landmark point.

```typescript
interface FaceLandmark {
  index:      number;     // 0–467 (MediaPipe FaceMesh 468 points)
  x:          number;     // normalized 0.0–1.0 within face bounding box
  y:          number;
  z:          number;     // relative depth, negative = toward camera
}
```

### ARKitBlendshapes
Full 52-blendshape ARKit face action unit set — subset used by LivePortrait as driving signal.

```typescript
interface ARKitBlendshapes {
  // Eye
  eyeBlinkLeft:       number;
  eyeBlinkRight:      number;
  eyeLookDownLeft:    number;
  eyeLookDownRight:   number;
  eyeLookInLeft:      number;
  eyeLookInRight:     number;
  eyeLookOutLeft:     number;
  eyeLookOutRight:    number;
  eyeLookUpLeft:      number;
  eyeLookUpRight:     number;
  eyeSquintLeft:      number;
  eyeSquintRight:     number;
  eyeWideLeft:        number;
  eyeWideRight:       number;

  // Jaw & Mouth
  jawForward:         number;
  jawLeft:            number;
  jawOpen:            number;
  jawRight:           number;
  mouthClose:         number;
  mouthDimpleLeft:    number;
  mouthDimpleRight:   number;
  mouthFrownLeft:     number;
  mouthFrownRight:    number;
  mouthFunnel:        number;
  mouthLeft:          number;
  mouthLowerDownLeft: number;
  mouthLowerDownRight:number;
  mouthPressLeft:     number;
  mouthPressRight:    number;
  mouthPucker:        number;
  mouthRight:         number;
  mouthRollLower:     number;
  mouthRollUpper:     number;
  mouthShrugLower:    number;
  mouthShrugUpper:    number;
  mouthSmileLeft:     number;
  mouthSmileRight:    number;
  mouthStretchLeft:   number;
  mouthStretchRight:  number;
  mouthUpperUpLeft:   number;
  mouthUpperUpRight:  number;

  // Brow
  browDownLeft:       number;
  browDownRight:      number;
  browInnerUp:        number;
  browOuterUpLeft:    number;
  browOuterUpRight:   number;

  // Cheek & Nose
  cheekPuff:          number;
  cheekSquintLeft:    number;
  cheekSquintRight:   number;
  noseSneerLeft:      number;
  noseSneerRight:     number;

  // Tongue
  tongueOut:          number;
}
```

### FaceLandmarkFrame
Full face analysis output for a single frame.

```typescript
interface FaceLandmarkFrame {
  landmarks:    FaceLandmark[];     // 468 points
  blendshapes:  ARKitBlendshapes;
  headPose:     HeadPose;
  bounds:       BoundingBox;        // face bounding box in frame
  confidence:   number;             // 0.0–1.0 — detection confidence
  identityHash: string | null;      // InsightFace embedding hash for persona lock — null if no anchor
}
```

---

## 4. Transfer Types

### PoseKeyframe
A single pose frame used as ControlNet conditioning input.

```typescript
interface PoseKeyframe {
  timeMs:   number;
  joints:   JointMap;
  head:     HeadPose;
  canvas: {
    width:    number;   // px — original detection canvas size
    height:   number;
    poseImageBase64: string | null;   // rendered DWPose skeleton PNG (base64) — null in summary mode
  };
}
```

### TransferSequenceInput
Request body for `/api/transfer/sequence` — the primary output call that drives full animated sequence generation.

```typescript
interface TransferSequenceInput {
  trackId:          string;          // MotionTrack.id from a prior analyze/motion call
  targetImage:      string;          // base64 PNG or URL — the character still to animate
  stylePrompt?:     string;          // art direction injected alongside the motion conditioning
  beatCurve?:       BeatEmotionCurve;   // from VideoEditor — maps beat times to expression intensity
  durationMs?:      number;          // override — defaults to MotionTrack.durationMs
  fps?:             number;          // output fps — defaults to track fps, max 30
  outputFormat?:    'mp4' | 'gif' | 'frames';   // defaults to 'mp4'
  expressionScale?: number;          // 0.0–2.0 — amplify/dampen expression transfer (1.0 = 1:1)
  poseScale?:       number;          // 0.0–2.0 — amplify/dampen body motion transfer
  identityLock?:    string;          // InsightFace embedding hash from CharacterSheet anchor
}
```

### TransferResult
Response from `/api/transfer/sequence` — returned when job completes.

```typescript
interface TransferResult {
  jobId:        string;
  trackId:      string;
  outputUrl:    string | null;       // URL to generated video/gif/frames
  frames:       string[] | null;     // base64 PNGs if outputFormat='frames'
  durationMs:   number;
  frameCount:   number;
  meta: {
    expressionScale: number;
    poseScale:       number;
    beatCurveBound:  boolean;        // true if beatCurve was applied
    models:          string[];
    processingMs:    number;
  };
}
```

---

## 5. Generation Types

These extend the base Argon generation types from ARGON-CREATIVE-CONTEXT.md with the
analysis + conditioning fields added by argon-server.js.

### ImageGenerationInput
```typescript
interface ImageGenerationInput {
  prompt:             string;
  model:              'flux' | 'krea' | 'sdxl' | 'midjourney' | 'dalle3';
  reference_image?:   string;         // base64 PNG or URL
  width?:             number;         // px — defaults to 1024
  height?:            number;         // defaults to 1024

  // Analysis-layer extensions
  pose_conditioning?: {
    poseImageBase64:  string;         // DWPose skeleton render
    strength:         number;         // ControlNet conditioning strength 0.0–1.0
  };
  style_lock?: {
    identityHash:   string;           // InsightFace embedding hash
    strength:       number;           // 0.0–1.0 — identity lock strength
  };
}
```

### VideoGenerationInput
```typescript
interface VideoGenerationInput {
  prompt:           string;
  model:            'dream_machine' | 'kling' | 'runway' | 'pika';
  source_image?:    string;           // base64 PNG or URL
  duration?:        number;           // seconds

  // Analysis-layer extensions
  motion_coefficients?: {
    trackId:   string;                // MotionTrack.id to drive this generation
    scale:     number;                // 0.0–2.0 motion amplification
  };
  expression_coefficients?: ExpressionCoefficients;   // single-frame expression to drive static-to-motion
}
```

### PoseGenerationInput
```typescript
interface PoseGenerationInput {
  prompt:             string;
  pose:               string;        // e.g. 'FRONT', '3/4 LEFT', 'SIDE', 'BACK', '3/4 RIGHT', 'PORTRAIT'
  reference_image?:   string;
  style_lock?:        string;        // text description of visual style

  // Analysis-layer extensions
  pose_sequence?: PoseKeyframe[];    // if driving from extracted track frames
  expression_coefficients?: ExpressionCoefficients;
}
```

### GenerationResult
Shared response shape for all `/api/generate/*` endpoints.

```typescript
interface GenerationResult {
  jobId:      string;
  outputUrl:  string | null;         // null until job completes
  width:      number;
  height:     number;
  model:      string;
  prompt:     string;
  meta: {
    seed?:          number;
    steps?:         number;
    cfg?:           number;
    processingMs?:  number;
    mock:           boolean;
  };
}
```

---

## 6. Job System Types

All async operations return a `Job` immediately, then update via SSE events and are
retrievable by `GET /api/jobs/:jobId`.

### JobStatus
```typescript
type JobStatus = 'queued' | 'running' | 'complete' | 'error';
```

### JobType
```typescript
type JobType =
  | 'analyze_motion'
  | 'analyze_expression'
  | 'analyze_face'
  | 'analyze_segment'
  | 'transfer_pose'
  | 'transfer_expression'
  | 'transfer_sequence'
  | 'generate_image'
  | 'generate_video'
  | 'generate_pose';
```

### Job
```typescript
interface Job {
  id:           string;        // UUID
  type:         JobType;
  status:       JobStatus;
  result:       MotionTrack | PoseKeyframe | ExpressionCoefficients | FaceLandmarkFrame | SegmentationResult | TransferResult | GenerationResult | null;
  error:        string | null;
  mock:         boolean;       // true if result was synthetically generated
  createdAt:    number;        // Date.now() ms
  completedAt?: number;
}
```

### SSE Event — `job`
Broadcast on every job status change.

```typescript
// event: job
interface JobEvent {
  id:       string;
  type:     JobType;
  status:   JobStatus;
  result?:  object;            // present when status = 'complete'
  error?:   string;            // present when status = 'error'
}
```

### SSE Event — `server`
Broadcast at server start and on health changes.

```typescript
// event: server
interface ServerEvent {
  status:   'online' | 'degraded' | 'offline';
  port:     number;
  backends: {
    comfyui: boolean;
    gradio:  boolean;
  };
}
```

---

## 7. API Endpoints — Full Contract

Base URL: `http://localhost:7860` (configurable via `ARGON_PORT` env var)

---

### GET /api/health

**Response:**
```json
{
  "status": "ok",
  "port": 7860,
  "backends": {
    "comfyui": false,
    "gradio": false
  },
  "jobs": {
    "total": 0,
    "queued": 0,
    "running": 0
  },
  "uptime": 12345
}
```

---

### GET /api/events

Server-Sent Events stream. Clients should subscribe at startup and keep the connection open.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event types:** `job`, `server`

---

### POST /api/analyze/motion

Extract full motion track (DWPose body skeleton + LivePortrait expression + MediaPipe face) from a source video or sequence.

**Request body:**
```typescript
{
  source:       string;         // base64 video, URL, or server asset path
  fps?:         number;         // force decode at specific fps (default: auto-detect)
  startMs?:     number;         // trim start (ms)
  endMs?:       number;         // trim end (ms)
  mockFallback?: boolean;       // default true — use synthetic data if backend unavailable
}
```

**Response (202 Accepted):**
```typescript
{
  trackId:  string;    // use with GET /api/analyze/:trackId and transfer calls
  jobId:    string;
  status:   'queued';
}
```

**Completed job result shape:** `MotionTrack`

---

### POST /api/analyze/expression

Extract per-frame expression coefficients only (faster than full motion — no body tracking).

**Request body:**
```typescript
{
  source:   string;    // base64 image or video, or URL
  fps?:     number;
}
```

**Response (202):**
```typescript
{
  jobId:  string;
  status: 'queued';
}
```

**Completed job result:**
```typescript
{
  frames: Array<{
    frameIndex: number;
    timeMs:     number;
    expression: ExpressionCoefficients;
  }>;
  durationMs: number;
  frameCount: number;
}
```

---

### POST /api/analyze/face

Full face analysis: 468 landmarks + ARKit blendshapes + head pose + bounding box.

**Request body:**
```typescript
{
  source:        string;   // base64 image or video frame
  anchorHash?:   string;   // InsightFace embedding hash to check identity match
}
```

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `FaceLandmarkFrame`

---

### POST /api/analyze/segment

Produce face/body/hair segmentation mask for compositing.

**Request body:**
```typescript
{
  source:    string;                                // base64 image
  targets:   ('face' | 'body' | 'hair' | 'bg')[];  // which masks to generate
  format?:   'png' | 'json';                        // png = base64 mask image, json = polygon points
}
```

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `SegmentationResult`

```typescript
interface SegmentationResult {
  masks: Record<'face' | 'body' | 'hair' | 'bg', string | null>;  // base64 PNGs or null if not requested
  confidence: number;
  model: 'birefnet' | 'segformer';
}
```

---

### GET /api/analyze/:trackId

Retrieve a completed MotionTrack by ID.

**Response (200):** `MotionTrack`
**Response (404):** `{ error: 'track not found' }`

---

### POST /api/transfer/pose

Single-frame pose transfer — generate one image conditioned on a pose keyframe.

**Request body:**
```typescript
{
  trackId:      string;          // MotionTrack.id
  frameIndex:   number;          // which frame to use as pose source
  targetImage:  string;          // character still (base64 PNG or URL)
  prompt?:      string;
  model?:       'sdxl' | 'flux'; // defaults to sdxl (best ControlNet support)
  strength?:    number;          // ControlNet strength 0.0–1.0 (default 0.8)
}
```

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `GenerationResult`

---

### POST /api/transfer/expression

Drive a character still with an expression coefficient frame (LivePortrait).

**Request body:**
```typescript
{
  targetImage:        string;                  // character still
  expression:         ExpressionCoefficients;  // or trackId + frameIndex
  trackId?:           string;
  frameIndex?:        number;
  expressionScale?:   number;                  // default 1.0
}
```

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `GenerationResult`

---

### POST /api/transfer/sequence

Primary animation output. Drive a character still through a full MotionTrack to produce
an animated sequence, optionally synced to a beat emotion curve.

**Request body:** `TransferSequenceInput`

**Response (202):**
```typescript
{ jobId: string; trackId: string; status: 'queued'; }
```

**Completed job result:** `TransferResult`

---

### POST /api/generate/image

**Request body:** `ImageGenerationInput`

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `GenerationResult`

---

### POST /api/generate/video

**Request body:** `VideoGenerationInput`

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `GenerationResult`

---

### POST /api/generate/pose

**Request body:** `PoseGenerationInput`

**Response (202):**
```typescript
{ jobId: string; status: 'queued'; }
```

**Completed job result:** `GenerationResult`

---

### GET /api/jobs/:jobId

Poll any job by ID.

**Response (200):** `Job`
**Response (404):** `{ error: 'job not found' }`

---

## 8. Beat Emotion Curve Integration

The VideoEditor's beat detection output feeds directly into the animation layer
through the `BeatEmotionCurve` type. This is the bridge between audio timing and
expression intensity.

### BeatMarker
```typescript
interface BeatMarker {
  timeMs:         number;      // absolute time in the audio track (ms)
  energy:         number;      // 0.0–1.0 — detected beat energy
  sceneBoundary:  boolean;     // true if this beat aligns with a scene cut
  sceneIndex:     number | null;
}
```

### BeatEmotionCurve
```typescript
interface BeatEmotionCurve {
  trackDurationMs:  number;
  beats:            BeatMarker[];

  // Optional: scene-level emotion targets
  // If present, expression intensity is interpolated toward these targets
  // between scene boundaries
  sceneCurves?: Array<{
    sceneIndex:       number;
    durationMs:       number;
    emotionTarget:    Partial<ExpressionCoefficients>;
    intensityEnvelope: number;    // 0.0–1.0 — overall expressiveness for this scene
  }>;
}
```

### How argon-server.js uses BeatEmotionCurve

When `beatCurve` is present in a `TransferSequenceInput`:

1. Beat times are normalized to `[0.0, 1.0]` range
2. For each output frame, the server computes `beatPhase` — proximity to the nearest beat
3. `expressionScale` is modulated: `effectiveScale = baseScale × (1.0 + beatPhase × beatBoost)`
4. Result: expressions peak on downbeats and relax between beats
5. `sceneCurves[].emotionTarget` blends with extracted track expression via `mix(extracted, target, blend)`

The `beatBoost` default is `0.4` (40% intensity increase on beats). This is exposed as
a future config parameter but not yet in the API surface.

---

## 9. Mock Data Shapes

When the Python model backend is unreachable, argon-server.js returns synthetic data
that conforms to the same shapes above. Mocked fields:

**MotionTrack mock:**
- `meta.mock = true`
- Joints oscillate via `sin(t × freq)` with per-joint phase offsets
- Expression coefficients use overlapping sin waves: jaw at 0.3Hz, brow at 0.7Hz
- `emotionVector.valence` drifts slowly between -0.2 and 0.8 (slightly positive bias)
- `intensity` = sum of activated coefficients / 16, thresholded at 0.1

**FaceLandmarkFrame mock:**
- 468 landmarks placed on a normalized oval grid with small Gaussian noise
- All blendshapes default to 0.0 except `mouthSmileLeft = 0.3`, `mouthSmileRight = 0.3`
- `identityHash = null` (no anchor match in mock mode)

**PoseKeyframe mock:**
- T-pose at center frame (all joints at anatomically plausible neutral positions)
- `poseClass = 'standing'`, `confidence = 0.87`
- `poseImageBase64 = null` in summary mode to reduce payload size

**GenerationResult mock:**
- `outputUrl = null` (no image generated)
- `meta.mock = true`
- All other fields populated with defaults

---

## 10. Error Shapes

All error responses use a consistent shape:

```typescript
interface ArgonError {
  error:    string;    // human-readable message
  code?:    string;    // machine-readable: 'BACKEND_UNAVAILABLE', 'JOB_NOT_FOUND', etc.
  jobId?:   string;    // present if the error occurred inside a job
  details?: unknown;   // raw upstream error if available
}
```

### Known error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `BACKEND_UNAVAILABLE` | 503 | Python model backend not reachable |
| `JOB_NOT_FOUND` | 404 | `GET /api/jobs/:id` — job ID not in memory or disk |
| `TRACK_NOT_FOUND` | 404 | `GET /api/analyze/:trackId` — track not found |
| `INVALID_BODY` | 400 | Required fields missing or malformed |
| `TRANSFER_REQUIRES_TRACK` | 400 | `trackId` provided but track not found before sequence transfer |
| `MODEL_ERROR` | 500 | Python backend returned an error payload |
| `PARSE_ERROR` | 400 | JSON body could not be parsed |

---

## 11. Design Notes

### Why EMOCA coefficients instead of raw FLAME parameters

FLAME's full expression space has 100 parameters — too many to reason about at the
application layer. EMOCA/DECA reduces this to 16 semantically meaningful action units
(jaw, brow variants, eye variants, mouth variants) that map directly to directorial
language: "more surprise," "softer jaw." This makes them bindable to Séance sliders.

### Why PAD emotion vectors alongside discrete classes

The discrete softmax (happy/sad/angry/etc.) is useful for labeling and search.
The PAD (Pleasure-Arousal-Dominance) continuous vector is useful for interpolation —
you can lerp between emotional states and the result is perceptually continuous.
Both are present because different consumers need different things.

### Beat → emotion bridge rationale

The beat detection energy signal in VideoEditor is a 1D temporal intensity curve.
The expression coefficient `intensity` field is also a 1D 0.0–1.0 scalar.
Binding beat energy to expression intensity is a direct multiplication — no complex
mapping required. Scene-level `emotionTarget` provides direction for what emotion
the intensity drives toward (beat peak → peak sadness vs. peak joy vs. peak rage
are all plausible interpretations that the director controls).

### Job persistence strategy

Jobs are held in a `Map<string, Job>` in process memory. On completion, they're also
written to disk at `~/.argon/jobs/<id>.json` for recovery after server restart.
Queued/running jobs are NOT persisted — a restart will require re-submission.
This is intentional: the frontend should re-submit on reconnect, and SSE reconnect
logic handles in-flight job polling naturally.

### Identity locking across CharacterSheet poses

InsightFace produces a 512-dim face embedding. argon-server.js hashes this to a short
string (`identityHash`) that can be stored in the Persona schema and passed back on
generation calls. The Python backend uses this hash to load the cached embedding and
apply it as an identity conditioning signal. This enables consistent character identity
across all 6 CharacterSheet poses without requiring a full reference image on every call.

---

*Schema version 1.0.0 — aligns with argon-server.js commit on 2026-02-27.*
*Next revision will add Séance slider → coefficient parameter binding table.*
