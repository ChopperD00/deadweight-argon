/**
 * argon-client.js
 * Environment-aware API client for Argon (deadweight-argon)
 *
 * Production (Vercel): calls relative /api/* — Vercel rewrites proxy to Modal
 * Development:         calls localhost:7860/api/* (argon-server.js)
 *
 * Usage:
 *   import argon from './lib/argon-client';
 *   const track = await argon.analyzeMotion(file);
 *   const result = await argon.transferSequence({ trackId, targetImage, beatCurve });
 */

const isDev =
  typeof process !== 'undefined' &&
  process.env.NODE_ENV === 'development';

export const BASE_URL = isDev
  ? (process.env.REACT_APP_API_URL || 'http://localhost:7860')
  : '';

/**
 * Structured error from argon-client.
 * err.status = HTTP code, err.body = raw server payload.
 */
export class ArgonError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name   = 'ArgonError';
    this.status = status;
    this.body   = body;
  }
}

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch (_) { errBody = null; }
    const msg = errBody?.error || errBody?.detail || `HTTP ${res.status}: ${res.statusText}`;
    throw new ArgonError(msg, res.status, errBody);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function stripDataUrl(dataUrl) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

// ---------------------------------------------------------------------------
// SSE event stream
// ---------------------------------------------------------------------------

/**
 * Open SSE stream to /api/events.
 * @param {function(string, any): void} onEvent
 * @param {{ maxRetries?: number, retryMs?: number }} [opts]
 * @returns {{ close: function(): void }}
 */
export function openEventStream(onEvent, { maxRetries = 10, retryMs = 2000 } = {}) {
  const url = `${BASE_URL}/api/events`;
  let es;
  let retries = 0;
  let closed  = false;

  function connect() {
    es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        onEvent(event, data);
      } catch (_) { onEvent('raw', e.data); }
    };
    es.onerror = () => {
      es.close();
      if (closed || retries >= maxRetries) return;
      retries++;
      setTimeout(connect, retryMs);
    };
    es.onopen = () => { retries = 0; };
  }

  connect();
  return { close: () => { closed = true; es?.close(); } };
}

// ---------------------------------------------------------------------------
// Job polling
// ---------------------------------------------------------------------------

/**
 * Poll /api/jobs/:jobId until terminal state.
 * @param {string} jobId
 * @param {{ intervalMs?: number, timeoutMs?: number, onProgress?: function }} [opts]
 */
export function pollJob(jobId, { intervalMs = 2000, timeoutMs = 300_000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer;
    async function tick() {
      if (Date.now() > deadline) {
        reject(new ArgonError(`Job ${jobId} timed out`, 408, null));
        return;
      }
      try {
        const job = await apiFetch(`/api/jobs/${jobId}`);
        onProgress?.(job);
        if (job.status === 'done' || job.status === 'complete') { resolve(job); return; }
        if (job.status === 'error') { reject(new ArgonError(job.error || 'Job failed', 500, job)); return; }
        timer = setTimeout(tick, intervalMs);
      } catch (err) { reject(err); }
    }
    tick();
    return () => clearTimeout(timer);
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const health = () => apiFetch('/api/health');

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function analyzeMotion(source, { fps = 24, wait = false, pollOpts } = {}) {
  const sourceB64 = typeof source === 'string' ? source : stripDataUrl(await fileToBase64(source));
  const { trackId, jobId } = await apiFetch('/api/analyze/motion', {
    method: 'POST',
    body: JSON.stringify({ source: sourceB64, fps }),
  });
  if (!wait) return { trackId, jobId };
  return pollJob(jobId, pollOpts);
}

export const getMotionTrack = (trackId) => apiFetch(`/api/analyze/${trackId}`);

export async function analyzeExpression(source) {
  const b64 = typeof source === 'string' ? source : stripDataUrl(await fileToBase64(source));
  return apiFetch('/api/analyze/expression', { method: 'POST', body: JSON.stringify({ source: b64 }) });
}

export async function analyzeFace(source) {
  const b64 = typeof source === 'string' ? source : stripDataUrl(await fileToBase64(source));
  return apiFetch('/api/analyze/face', { method: 'POST', body: JSON.stringify({ source: b64 }) });
}

export async function analyzeSegment(source, region = 'full') {
  const b64 = typeof source === 'string' ? source : stripDataUrl(await fileToBase64(source));
  return apiFetch('/api/analyze/segment', { method: 'POST', body: JSON.stringify({ source: b64, region }) });
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

export async function transferExpression(characterImage, coefficients, strength = 1.0) {
  const charB64 = typeof characterImage === 'string' ? characterImage : stripDataUrl(await fileToBase64(characterImage));
  return apiFetch('/api/transfer/expression', {
    method: 'POST',
    body: JSON.stringify({ characterImage: charB64, coefficients, strength }),
  });
}

/**
 * POST /api/transfer/sequence — beat-synced animation.
 * @param {object} input  — { trackId, targetImage, stylePrompt, beatCurve, fps, outputFormat,
 *                            expressionScale, poseScale, identityLock, loraPaths }
 * @param {{ wait?: boolean, pollOpts?: object }} [opts]
 */
export async function transferSequence(input, { wait = false, pollOpts } = {}) {
  const targetB64 = typeof input.targetImage === 'string'
    ? input.targetImage
    : stripDataUrl(await fileToBase64(input.targetImage));
  const { jobId } = await apiFetch('/api/transfer/sequence', {
    method: 'POST',
    body: JSON.stringify({ ...input, targetImage: targetB64 }),
  });
  if (!wait) return { jobId };
  return pollJob(jobId, pollOpts);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateImage(params, { wait = false, pollOpts } = {}) {
  const { jobId } = await apiFetch('/api/generate/image', {
    method: 'POST', body: JSON.stringify(params),
  });
  if (!wait) return { jobId };
  return pollJob(jobId, pollOpts);
}

export async function generatePose(params, { wait = false, pollOpts } = {}) {
  const { jobId } = await apiFetch('/api/generate/pose', {
    method: 'POST', body: JSON.stringify(params),
  });
  if (!wait) return { jobId };
  return pollJob(jobId, pollOpts);
}

// ---------------------------------------------------------------------------
// LoRA management
// ---------------------------------------------------------------------------

/** Download a LoRA from CivitAI. Body: { versionId } or { civitaiUrl }. */
export const downloadLora = (params) =>
  apiFetch('/api/loras/download', { method: 'POST', body: JSON.stringify(params) });

/** List all LoRAs cached on Modal Volume. */
export const listLoras = () => apiFetch('/api/loras');

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const getJob = (jobId) => apiFetch(`/api/jobs/${jobId}`);

// ---------------------------------------------------------------------------
// Default export — convenience namespace
// ---------------------------------------------------------------------------

const argon = {
  BASE_URL, health,
  analyzeMotion, getMotionTrack, analyzeExpression, analyzeFace, analyzeSegment,
  transferExpression, transferSequence,
  generateImage, generatePose,
  downloadLora, listLoras,
  getJob, pollJob,
  openEventStream,
  fileToBase64, stripDataUrl,
  ArgonError,
};

export default argon;
