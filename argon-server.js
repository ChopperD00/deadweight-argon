#!/usr/bin/env node

/**
 * ARGON Analysis & Transfer Server v0.1.0
 * Zero-dep Node.js server — port 7860 (ARGON_PORT env override)
 *
 * Forked from Inferis Console Server v0.7.0 architecture.
 * Replaces the Claude/LLM call layer with a motion analysis + image transfer
 * proxy layer sitting between the Argon React frontend and Python model backends
 * (ComfyUI / Gradio / FastAPI running LivePortrait, DWPose, EMOCA, MediaPipe).
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/events                  → SSE job + status stream
 *   GET  /api/jobs/:jobId             → poll any job result
 *   GET  /api/analyze/:trackId        → retrieve completed MotionTrack
 *
 *   POST /api/analyze/motion          → DWPose skeleton + EMOCA expression extraction from video/image
 *   POST /api/analyze/expression      → expression coefficients only (faster, single-frame or clip)
 *   POST /api/analyze/face            → MediaPipe FaceMesh 468 landmarks + ARKit blendshapes
 *   POST /api/analyze/segment         → BiRefNet face/body/hair segmentation mask
 *
 *   POST /api/transfer/pose           → ControlNet DWPose → character image (SDXL/Flux)
 *   POST /api/transfer/expression     → LivePortrait expression drive onto character still
 *   POST /api/transfer/sequence       → full animated sequence from MotionTrack + beat curve
 *
 *   POST /api/generate/image          → image generation (proxy to model backend)
 *   POST /api/generate/video          → video generation (proxy to model backend)
 *   POST /api/generate/pose           → pose-conditioned character generation
 *
 * Model backend env vars:
 *   ARGON_PORT            = 7860       (this server)
 *   ARGON_MODEL_BACKEND   = http://localhost:8188  (ComfyUI default)
 *   ARGON_GRADIO_BACKEND  = http://localhost:7861  (Gradio / Python FastAPI alt)
 *   ARGON_JOB_DIR         = ~/.argon/jobs
 *   ARGON_ASSET_DIR       = ~/.argon/assets
 *
 * Falls back to mock MotionTrack data when model backend is unavailable.
 * This means the Argon frontend can develop against this server offline.
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { homedir } = require('os');
const crypto  = require('crypto');

const PORT           = parseInt(process.env.ARGON_PORT  || '7860', 10);
const MODEL_BACKEND  = process.env.ARGON_MODEL_BACKEND  || 'http://localhost:8188';
const GRADIO_BACKEND = process.env.ARGON_GRADIO_BACKEND || 'http://localhost:7861';
const JOB_DIR        = process.env.ARGON_JOB_DIR        || path.join(homedir(), '.argon', 'jobs');
const ASSET_DIR      = process.env.ARGON_ASSET_DIR      || path.join(homedir(), '.argon', 'assets');

// ── Ensure storage dirs ─────────────────────────────────────────────
[JOB_DIR, ASSET_DIR].forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
});


// ── Job Queue ───────────────────────────────────────────────────────
// In-memory Map: jobId → JobRecord
// Completed jobs are also written to JOB_DIR/<id>.json for persistence.

const jobs = new Map();

/**
 * @typedef {Object} JobRecord
 * @property {string}  id
 * @property {string}  type        — e.g. 'analyze:motion', 'transfer:expression'
 * @property {string}  status      — 'queued' | 'running' | 'complete' | 'error'
 * @property {any}     result      — populated on complete
 * @property {string|null} error   — populated on error
 * @property {boolean} mock        — true if result is synthetic (backend unavailable)
 * @property {number}  createdAt   — unix ms
 * @property {number}  [completedAt]
 */

function genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createJob(type, meta = {}) {
  const id  = genId();
  const job = { id, type, status: 'queued', result: null, error: null, mock: false, createdAt: Date.now(), ...meta };
  jobs.set(id, job);
  broadcastEvent('job', { id, type, status: 'queued' });
  console.log(`  [job] created  ${id}  (${type})`);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  if (patch.status === 'complete' || patch.status === 'error') {
    job.completedAt = Date.now();
    const ms = job.completedAt - job.createdAt;
    console.log(`  [job] ${patch.status.padEnd(8)} ${id}  (${job.type})  ${ms}ms`);
    // Persist completed jobs to disk
    try { fs.writeFileSync(path.join(JOB_DIR, `${id}.json`), JSON.stringify(job, null, 2)); } catch (_) {}
  }
  broadcastEvent('job', { id, type: job.type, status: job.status, ...patch });
}


// ── SSE Event Clients  (borrowed directly from inferis-server.js) ─────────────
const eventClients = new Set();

function broadcastEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of eventClients) {
    try { client.write(payload); } catch (_) { eventClients.delete(client); }
  }
}


// ── Backend Proxy ──────────────────────────────────────────────────
// Forward a POST to the Python model backend, parse JSON response.
// onResult(parsedJson) called on success; onFallback(err) called on any failure.

function proxyPost(backendUrl, apiPath, body, onResult, onFallback) {
  let targetUrl;
  try { targetUrl = new URL(apiPath, backendUrl); } catch (e) { return onFallback(e); }

  const transport  = targetUrl.protocol === 'https:' ? https : http;
  const bodyStr    = JSON.stringify(body);

  const req = transport.request({
    hostname: targetUrl.hostname,
    port:     parseInt(targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80'), 10),
    path:     targetUrl.pathname + targetUrl.search,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  }, (res) => {
    let buf = '';
    res.on('data', c => { buf += c; });
    res.on('end', () => {
      try   { onResult(JSON.parse(buf)); }
      catch (e) { onFallback(e); }
    });
    res.on('error', onFallback);
  });

  req.setTimeout(60_000, () => { req.destroy(); onFallback(new Error('Backend timeout')); });
  req.on('error', onFallback);
  req.write(bodyStr);
  req.end();
}


// ── Analysis Handlers ───────────────────────────────────────────────

/**
 * POST /api/analyze/motion
 * Extracts DWPose skeleton + EMOCA-style expression coefficients from a
 * reference video or image.  Returns a MotionTrack (see schema doc).
 *
 * Body: { source: string (base64 data URL or remote URL),
 *         fps?: number,
 *         extractExpression?: boolean,
 *         extractPose?: boolean,
 *         extractFace?: boolean }
 * Response: { ok, trackId, status }  — async, poll GET /api/analyze/:trackId
 */
function handleAnalyzeMotion(body, res) {
  const {
    source,
    fps             = 24,
    extractExpression = true,
    extractPose       = true,
    extractFace       = false,
  } = body;
  if (!source) return jsonError(res, 400, 'source required (base64 data URL or remote URL)');

  const job = createJob('analyze:motion', { fps, extractExpression, extractPose, extractFace });
  jsonOk(res, { trackId: job.id, status: 'queued', message: 'Motion analysis queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(
    MODEL_BACKEND,
    '/api/analyze/motion',
    { source, fps, extractExpression, extractPose, extractFace },
    (result) => {
      // Backend returns MotionTrack — persist .track.json alongside job
      try { fs.writeFileSync(path.join(JOB_DIR, `${job.id}.track.json`), JSON.stringify(result, null, 2)); } catch (_) {}
      updateJob(job.id, { status: 'complete', result });
    },
    (err) => {
      console.warn(`  [argon] Backend unavailable (${err.message}) — returning mock MotionTrack`);
      const mock = buildMockMotionTrack(job.id, fps);
      try { fs.writeFileSync(path.join(JOB_DIR, `${job.id}.track.json`), JSON.stringify(mock, null, 2)); } catch (_) {}
      updateJob(job.id, { status: 'complete', result: mock, mock: true });
    }
  );
}

/**
 * POST /api/analyze/expression
 * Expression coefficients only — faster single-frame or short-clip extract.
 * Uses EMOCA / FLAME expression space + ARKit blendshapes.
 *
 * Body: { source: string, frameRange?: [startSec, endSec] }
 * Response: { ok, jobId, status }
 */
function handleAnalyzeExpression(body, res) {
  const { source, frameRange } = body;
  if (!source) return jsonError(res, 400, 'source required');

  const job = createJob('analyze:expression', { frameRange: frameRange || null });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/analyze/expression', { source, frameRange },
    (result) => updateJob(job.id, { status: 'complete', result }),
    ()       => updateJob(job.id, { status: 'complete', result: [buildMockExpressionAtTime(0)], mock: true })
  );
}

/**
 * POST /api/analyze/face
 * MediaPipe FaceMesh — 468 landmarks + ARKit-style blendshapes.
 * Use this for micro-expression lock and face segmentation reference.
 *
 * Body: { source: string }
 * Response: { ok, jobId, status }
 */
function handleAnalyzeFace(body, res) {
  const { source } = body;
  if (!source) return jsonError(res, 400, 'source required');

  const job = createJob('analyze:face');
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/analyze/face', { source },
    (result) => updateJob(job.id, { status: 'complete', result }),
    ()       => updateJob(job.id, { status: 'complete', result: buildMockFaceLandmarks(), mock: true })
  );
}

/**
 * POST /api/analyze/segment
 * BiRefNet — face / body / hair segmentation mask as base64 PNG.
 *
 * Body: { source: string, region: 'face'|'body'|'hair'|'background' }
 * Response: { ok, jobId, status }
 */
function handleAnalyzeSegment(body, res) {
  const { source, region = 'face' } = body;
  if (!source) return jsonError(res, 400, 'source required');

  const job = createJob('analyze:segment', { region });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/analyze/segment', { source, region },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: `Backend unavailable — no mock for segment masks (${err.message})` })
  );
}


// ── Transfer Handlers ───────────────────────────────────────────────

/**
 * POST /api/transfer/pose
 * Apply a DWPose skeleton keyframe to a character image via ControlNet.
 * The character holds the physical attitude of the reference pose
 * without changing identity / style.
 *
 * Body: { characterImage: string,
 *         poseKeyframe: PoseKeyframe,
 *         model?: 'sdxl'|'flux',
 *         style?: string,
 *         strength?: number (0-1, default 0.75) }
 * Response: { ok, jobId, status }
 */
function handleTransferPose(body, res) {
  const { characterImage, poseKeyframe, model = 'sdxl', style, strength = 0.75 } = body;
  if (!characterImage)  return jsonError(res, 400, 'characterImage required');
  if (!poseKeyframe)    return jsonError(res, 400, 'poseKeyframe required (run /api/analyze/motion first)');

  const job = createJob('transfer:pose', { model, strength });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/transfer/pose', { characterImage, poseKeyframe, model, style, strength },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}

/**
 * POST /api/transfer/expression
 * Drive a character still with LivePortrait expression coefficients.
 * This is the micro-expression engine — takes ExpressionCoefficients from
 * /api/analyze/expression and applies them to the character image.
 *
 * Body: { characterImage: string,
 *         coefficients: ExpressionCoefficients,
 *         faceLandmarks?: FaceLandmarkFrame,  ← optional, improves accuracy
 *         strength?: number (0-1, default 1.0) }
 * Response: { ok, jobId, status }
 */
function handleTransferExpression(body, res) {
  const { characterImage, coefficients, faceLandmarks, strength = 1.0 } = body;
  if (!characterImage) return jsonError(res, 400, 'characterImage required');
  if (!coefficients)   return jsonError(res, 400, 'coefficients required (run /api/analyze/expression first)');

  const job = createJob('transfer:expression', { strength });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/transfer/expression', { characterImage, coefficients, faceLandmarks, strength },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}

/**
 * POST /api/transfer/sequence
 * Full animated sequence — drives the character through a MotionTrack
 * synchronized to the VideoEditor beat curve.
 *
 * This is the primary output of the animation engine:
 *   character image + motion track + beat curve → animated video frames
 *
 * Body: { characterImage: string,
 *         trackId: string,              ← from /api/analyze/motion
 *         beatCurve: BeatEmotionCurve[], ← from VideoEditor beat detection
 *         frameRange?: [startSec, endSec],
 *         outputFps?: number (default 24),
 *         style?: string }
 * Response: { ok, jobId, status, frameCount }
 */
function handleTransferSequence(body, res) {
  const { characterImage, trackId, beatCurve, frameRange, outputFps = 24, style } = body;
  if (!characterImage) return jsonError(res, 400, 'characterImage required');
  if (!trackId)        return jsonError(res, 400, 'trackId required (run /api/analyze/motion first)');

  // Load MotionTrack — check disk then memory
  let motionTrack = null;
  const trackPath = path.join(JOB_DIR, `${trackId}.track.json`);
  if (fs.existsSync(trackPath)) {
    try { motionTrack = JSON.parse(fs.readFileSync(trackPath, 'utf-8')); } catch (_) {}
  }
  if (!motionTrack) {
    const j = jobs.get(trackId);
    if (j && j.result) motionTrack = j.result;
  }
  if (!motionTrack) {
    return jsonError(res, 404, `MotionTrack ${trackId} not found — run POST /api/analyze/motion first`);
  }

  const frameCount = motionTrack.frames ? motionTrack.frames.length : 0;
  const job = createJob('transfer:sequence', { trackId, frameRange: frameRange || null, outputFps, frameCount });
  jsonOk(res, { jobId: job.id, status: 'queued', frameCount });

  updateJob(job.id, { status: 'running' });
  proxyPost(
    MODEL_BACKEND,
    '/api/transfer/sequence',
    { characterImage, motionTrack, beatCurve: beatCurve || [], frameRange, outputFps, style },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}


// ── Generation Handlers ───────────────────────────────────────────────
// These mirror the ARGON-CREATIVE-CONTEXT.md anticipated endpoints exactly.
// Now with optional pose_conditioning and motion_coefficients fields.

function handleGenerateImage(body, res) {
  const { prompt, model = 'flux', reference_image, width = 768, height = 1024, pose_conditioning, style_lock } = body;
  if (!prompt) return jsonError(res, 400, 'prompt required');

  const job = createJob('generate:image', { model, width, height });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/generate/image',
    { prompt, model, reference_image, width, height, pose_conditioning, style_lock },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}

function handleGenerateVideo(body, res) {
  const { prompt, model = 'kling', source_image, duration = 4, motion_coefficients, pose_sequence } = body;
  if (!prompt) return jsonError(res, 400, 'prompt required');

  const job = createJob('generate:video', { model, duration });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/generate/video',
    { prompt, model, source_image, duration, motion_coefficients, pose_sequence },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}

function handleGeneratePose(body, res) {
  const { prompt, pose, reference_image, style_lock, model = 'sdxl', expression_coefficients } = body;
  if (!prompt) return jsonError(res, 400, 'prompt required');
  if (!pose)   return jsonError(res, 400, 'pose required (PoseKeyframe or "FRONT"|"SIDE"|etc.)');

  const job = createJob('generate:pose', { model });
  jsonOk(res, { jobId: job.id, status: 'queued' });

  updateJob(job.id, { status: 'running' });
  proxyPost(MODEL_BACKEND, '/api/generate/pose',
    { prompt, pose, reference_image, style_lock, model, expression_coefficients },
    (result) => updateJob(job.id, { status: 'complete', result }),
    (err)    => updateJob(job.id, { status: 'error', error: err.message })
  );
}


// ── Mock Data Builders (offline / dev mode) ────────────────────────────────

function buildMockMotionTrack(id, fps) {
  const duration   = 4;
  const frameCount = duration * fps;
  const frames     = [];

  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    frames.push({
      t,
      frameIndex: i,
      pose:           buildMockPoseKeyframe(t),
      expression:     buildMockExpressionAtTime(t),
      faceLandmarks:  null,
    });
  }

  return {
    id,
    sourceRef:        'mock',
    duration,
    fps,
    frames,
    expressionTrack:  frames.map(f => f.expression),
    poseTrack:        frames.map(f => f.pose),
    faceTrack:        [],
    segmentMask:      null,
    mock:             true,
  };
}

function buildMockPoseKeyframe(t) {
  // Gentle swaying — enough to test ControlNet conditioning wiring
  const sway = Math.sin(t * 1.2) * 0.05;
  return {
    body: {
      nose:           { x: 0.50 + sway, y: 0.14, conf: 0.98 },
      neck:           { x: 0.50 + sway * 0.5, y: 0.22, conf: 0.95 },
      leftShoulder:   { x: 0.38,  y: 0.30, conf: 0.90 },
      rightShoulder:  { x: 0.62,  y: 0.30, conf: 0.90 },
      leftElbow:      { x: 0.30,  y: 0.48, conf: 0.85 },
      rightElbow:     { x: 0.70,  y: 0.48, conf: 0.85 },
      leftWrist:      { x: 0.28,  y: 0.62, conf: 0.80 },
      rightWrist:     { x: 0.72,  y: 0.62, conf: 0.80 },
      leftHip:        { x: 0.42,  y: 0.56, conf: 0.88 },
      rightHip:       { x: 0.58,  y: 0.56, conf: 0.88 },
      leftKnee:       { x: 0.41,  y: 0.74, conf: 0.82 },
      rightKnee:      { x: 0.59,  y: 0.74, conf: 0.82 },
    },
    hands:      { left: null, right: null },
    face:       null,
    confidence: 0.92,
  };
}

function buildMockExpressionAtTime(t) {
  // Sinusoidal expression wave for dev testing
  const w = (freq, amp = 1) => (Math.sin(t * freq) * 0.5 + 0.5) * amp;
  return {
    jaw:              w(0.80, 0.30),
    browInner:        w(1.20, 0.40),
    browOuter:        w(0.70, 0.35),
    eyeWide:          w(0.50, 0.20),
    eyeClose:         w(0.30, 0.15),
    mouthOpen:        w(0.80, 0.40),
    mouthCornerUp:    w(0.60, 0.50),
    mouthCornerDown:  0,
    noseFlair:        w(1.00, 0.15),
    cheekRaise:       w(0.60, 0.30),
    emotionVector: {
      valence:    Math.sin(t * 0.4) * 0.5 + 0.3,  // −1 → 1
      arousal:    w(0.50, 0.80),                    // 0 → 1
      dominance:  0.6,
    },
    intensity:  w(0.90, 0.85),
  };
}

function buildMockFaceLandmarks() {
  return {
    landmarks: Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    leftEye:   [33, 133, 160, 159, 158, 144, 145, 153],
    rightEye:  [362, 263, 387, 386, 385, 373, 374, 380],
    mouth:     [61, 185, 40, 39, 37, 267, 269, 270, 291],
    nose:      [1, 2, 98, 327],
    jawline:   [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288],
    blendshapes: {
      browDownLeft: 0,   browDownRight: 0,  browInnerUp: 0,
      browOuterUpLeft: 0, browOuterUpRight: 0,
      cheekPuff: 0,      cheekSquintLeft: 0, cheekSquintRight: 0,
      eyeBlinkLeft: 0,   eyeBlinkRight: 0,
      eyeLookDownLeft: 0, eyeLookDownRight: 0,
      eyeLookInLeft: 0,  eyeLookInRight: 0,
      eyeLookOutLeft: 0, eyeLookOutRight: 0,
      eyeLookUpLeft: 0,  eyeLookUpRight: 0,
      eyeSquintLeft: 0,  eyeSquintRight: 0,
      eyeWideLeft: 0,    eyeWideRight: 0,
      jawForward: 0, jawLeft: 0, jawOpen: 0, jawRight: 0,
      mouthClose: 0,    mouthDimpleLeft: 0,   mouthDimpleRight: 0,
      mouthFrownLeft: 0, mouthFrownRight: 0,  mouthFunnel: 0,
      mouthLeft: 0,     mouthLowerDownLeft: 0, mouthLowerDownRight: 0,
      mouthPressLeft: 0, mouthPressRight: 0,  mouthPucker: 0,
      mouthRight: 0,    mouthRollLower: 0,    mouthRollUpper: 0,
      mouthShrugLower: 0, mouthShrugUpper: 0,
      mouthSmileLeft: 0, mouthSmileRight: 0,
      mouthStretchLeft: 0, mouthStretchRight: 0,
      mouthUpperUpLeft: 0, mouthUpperUpRight: 0,
      noseSneerLeft: 0,  noseSneerRight: 0,
      tongueOut: 0,
    },
    mock: true,
  };
}


// ── HTTP Helpers ───────────────────────────────────────────────────

function jsonOk(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, ...data }));
}

function jsonError(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: false, error: message }));
}

function parseBody(req, cb) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 50_000_000) req.destroy(); });
  req.on('end', () => {
    try   { cb(null, JSON.parse(body)); }
    catch (e) { cb(e, null); }
  });
}


// ── HTTP Server ────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/health ────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const activeJobs = [...jobs.values()].filter(j => j.status === 'queued' || j.status === 'running');
    jsonOk(res, {
      version:       '0.1.0',
      status:        'ok',
      model_backend: MODEL_BACKEND,
      job_dir:       JOB_DIR,
      jobs_active:   activeJobs.length,
      jobs_total:    jobs.size,
    });
    return;
  }

  // ── GET /api/events — SSE stream ──────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('event: connected\ndata: {"status":"ok","server":"argon"}\n\n');
    eventClients.add(res);
    req.on('close', () => eventClients.delete(res));
    return;
  }

  // ── GET /api/analyze/:trackId — retrieve completed MotionTrack ───────────
  if (req.method === 'GET' && url.pathname.startsWith('/api/analyze/') && url.pathname.length > '/api/analyze/'.length) {
    const trackId = decodeURIComponent(url.pathname.slice('/api/analyze/'.length));

    // Check in-memory first
    if (jobs.has(trackId)) {
      const j = jobs.get(trackId);
      jsonOk(res, { trackId, status: j.status, result: j.result, error: j.error, mock: j.mock });
      return;
    }

    // Fallback to disk
    const trackPath = path.join(JOB_DIR, `${trackId}.track.json`);
    if (fs.existsSync(trackPath)) {
      try {
        jsonOk(res, { trackId, status: 'complete', result: JSON.parse(fs.readFileSync(trackPath, 'utf-8')) });
      } catch (_) { jsonError(res, 500, 'Failed to read track file'); }
    } else {
      jsonError(res, 404, `MotionTrack ${trackId} not found`);
    }
    return;
  }

  // ── GET /api/jobs/:jobId — poll any job ────────────────────────────
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const jobId = decodeURIComponent(url.pathname.slice('/api/jobs/'.length));
    const job   = jobs.get(jobId);

    if (job) {
      jsonOk(res, { jobId, status: job.status, result: job.result, error: job.error, mock: job.mock });
    } else {
      // Try disk
      const diskPath = path.join(JOB_DIR, `${jobId}.json`);
      if (fs.existsSync(diskPath)) {
        try { jsonOk(res, { jobId, status: 'complete', ...JSON.parse(fs.readFileSync(diskPath, 'utf-8')) }); }
        catch (_) { jsonError(res, 500, 'Failed to read job file'); }
      } else {
        jsonError(res, 404, `Job ${jobId} not found`);
      }
    }
    return;
  }

  // ── POST routes ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) return jsonError(res, 400, 'Invalid JSON body');
      switch (url.pathname) {
        case '/api/analyze/motion':       return handleAnalyzeMotion(body, res);
        case '/api/analyze/expression':   return handleAnalyzeExpression(body, res);
        case '/api/analyze/face':         return handleAnalyzeFace(body, res);
        case '/api/analyze/segment':      return handleAnalyzeSegment(body, res);
        case '/api/transfer/pose':        return handleTransferPose(body, res);
        case '/api/transfer/expression':  return handleTransferExpression(body, res);
        case '/api/transfer/sequence':    return handleTransferSequence(body, res);
        case '/api/generate/image':       return handleGenerateImage(body, res);
        case '/api/generate/video':       return handleGenerateVideo(body, res);
        case '/api/generate/pose':        return handleGeneratePose(body, res);
        default: return jsonError(res, 404, `No route: POST ${url.pathname}`);
      }
    });
    return;
  }

  jsonError(res, 404, 'Not found');
});

server.listen(PORT, () => {
  const cyan  = s => `\x1b[36m${s}\x1b[0m`;
  const gold  = s => `\x1b[33m${s}\x1b[0m`;
  const green = s => `\x1b[32m${s}\x1b[0m`;
  const muted = s => `\x1b[2m${s}\x1b[0m`;

  console.log(cyan('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'));
  console.log(cyan('\u2551  ARGON Analysis & Transfer Server v0.1.0    \u2551'));
  console.log(cyan(`\u2551  http://localhost:${PORT}                     \u2551`));
  console.log(cyan('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d'));
  console.log(`  Model backend:  ${MODEL_BACKEND}`);
  console.log(`  Gradio alt:     ${GRADIO_BACKEND}`);
  console.log(`  Job dir:        ${JOB_DIR}`);
  console.log('');
  console.log('  ' + gold('Analysis'));
  console.log(muted('    POST /api/analyze/motion       \u2192 DWPose + EMOCA extraction (async \u2192 trackId)'));
  console.log(muted('    POST /api/analyze/expression   \u2192 expression coefficients only'));
  console.log(muted('    POST /api/analyze/face         \u2192 MediaPipe 468 landmarks + blendshapes'));
  console.log(muted('    POST /api/analyze/segment      \u2192 BiRefNet segmentation mask'));
  console.log(muted('    GET  /api/analyze/:trackId     \u2192 retrieve MotionTrack result'));
  console.log('');
  console.log('  ' + gold('Transfer'));
  console.log(muted('    POST /api/transfer/pose        \u2192 ControlNet pose conditioning'));
  console.log(muted('    POST /api/transfer/expression  \u2192 LivePortrait expression drive'));
  console.log(muted('    POST /api/transfer/sequence    \u2192 full animated sequence (the money shot)'));
  console.log('');
  console.log('  ' + gold('Generation'));
  console.log(muted('    POST /api/generate/image       \u2192 image generation'));
  console.log(muted('    POST /api/generate/video       \u2192 video generation'));
  console.log(muted('    POST /api/generate/pose        \u2192 pose-conditioned generation'));
  console.log('');
  console.log('  ' + gold('Utility'));
  console.log(muted('    GET  /api/jobs/:jobId          \u2192 poll any job'));
  console.log(muted('    GET  /api/events               \u2192 SSE job events'));
  console.log(muted('    GET  /api/health               \u2192 server status'));
  console.log('');
  console.log('  ' + green('Falls back to mock MotionTrack when model backend unavailable'));
});
