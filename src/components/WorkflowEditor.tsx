'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Handle, Position, type Connection, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const API = 'https://ryujin.inferis.app/api/argon';
const KREA_API = 'https://api.krea.ai';
const KREA_KEY = '66eb338a-e1a9-4a69-bc3c-63ee9de86df2:4y-UB7mcv7c1iJTfkrjxHyz-NyJrQgu-';

const COLORS: Record<string, string> = {
  prompt: '#7c6af7', generate: '#f59e0b', upload: '#22d3ee',
  qa: '#4ade80', export: '#ef4444', text: '#8b8b8b',
  audio: '#c084fc', lora: '#fb923c',
};

const MODELS = [
  { id: 'krea-kling-2.5', label: 'Kling 2.5', type: 'video', provider: 'krea', path: '/generate/video/kling/kling-2.5' },
  { id: 'krea-hailuo-2.3', label: 'Hailuo 2.3', type: 'video', provider: 'krea', path: '/generate/video/minimax/hailuo-2.3' },
  { id: 'krea-veo-3', label: 'Veo 3', type: 'video', provider: 'krea', path: '/generate/video/google/veo-3' },
  { id: 'krea-wan-2.5', label: 'Wan 2.5', type: 'video', provider: 'krea', path: '/generate/video/alibaba/wan-2.5' },
  { id: 'krea-runway-gen4', label: 'Runway Gen-4', type: 'video', provider: 'krea', path: '/generate/video/runway/gen-4' },
  { id: 'luma', label: 'Luma ray-2', type: 'video', provider: 'argon', path: '/generate/video' },
  { id: 'krea-flux', label: 'Flux Dev', type: 'image', provider: 'krea', path: '/generate/image/bfl/flux-1-dev' },
  { id: 'krea-imagen4', label: 'Imagen 4', type: 'image', provider: 'krea', path: '/generate/image/google/imagen-4' },
  { id: 'elevenlabs', label: 'ElevenLabs v2', type: 'audio', provider: 'argon', path: '/generate/audio' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}

// ── Enhanced Node Component ──
function WorkflowNode({ data: _data, id, selected }: NodeProps) {
  const data = _data as Record<string, any>;
  const color = COLORS[data.nodeType] || '#7c6af7';
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(data.result || null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [model, setModel] = useState(data.modelId || MODELS[0].id);
  const [upload, setUpload] = useState<string | null>(null);
  const [uploadThumb, setUploadThumb] = useState<string | null>(null);
  const [endUpload, setEndUpload] = useState<string | null>(null);
  const [endThumb, setEndThumb] = useState<string | null>(null);
  const [loraUrl, setLoraUrl] = useState('');
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [expanded, setExpanded] = useState(data.expanded ?? true);
  const [aspect, setAspect] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void, thumbSetter: (v: string) => void) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await fileToBase64(f);
    setter(b64);
    thumbSetter(b64);
  };

  // Poll Krea job
  const pollKreaJob = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${KREA_API}/jobs/${jobId}`, { headers: { Authorization: `Bearer ${KREA_KEY}` } });
        const d = await r.json();
        if (d.status === 'completed' && d.result?.urls?.length) {
          setResultUrl(d.result.urls[0]);
          setResult(`✓ Complete`);
          setRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (d.status === 'failed') {
          setError('Generation failed'); setRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setResult(`◌ ${d.status}...`);
        }
      } catch {}
    }, 5000);
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const execute = async () => {
    if (data.nodeType !== 'generate') return;
    setRunning(true); setError(null); setResult('◌ Starting...'); setResultUrl(null);
    const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];
    try {
      if (selectedModel.provider === 'krea') {
        const body: any = { prompt: prompt || 'cinematic generation' };
        if (selectedModel.type === 'video') {
          body.aspectRatio = aspect; body.duration = duration;
          if (upload) body.startImage = upload;
          if (endUpload) body.endImage = endUpload;
        }
        if (selectedModel.type === 'image') {
          body.width = 1024; body.height = 1024;
          if (loraUrl) body.styles = [{ id: loraUrl, strength: loraStrength }];
          if (upload) body.styleImages = [{ url: upload, strength: 0.8 }];
        }
        const r = await fetch(`${KREA_API}${selectedModel.path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KREA_KEY}` },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.job_id) { setResult(`Job: ${d.job_id}`); pollKreaJob(d.job_id); }
        else { setError(d.error || 'Unknown error'); setRunning(false); }
      } else {
        const body: any = selectedModel.type === 'audio'
          ? { text: prompt || 'test audio' }
          : { prompt: prompt || 'test generation', aspectRatio: aspect };
        if (selectedModel.type === 'video') { body.duration = duration; if (upload) body.referenceImage = upload; }
        const r = await fetch(`${API}${selectedModel.path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.status === 'failed') { setError(d.error || 'Failed'); setRunning(false); }
        else { setResult(`Job: ${d.id} (${d.status})`); setRunning(false); }
      }
    } catch (e: any) { setError(e.message); setRunning(false); }
  };

  const selectedModel = MODELS.find(m => m.id === model);
  const isVideo = selectedModel?.type === 'video';
  const isImage = selectedModel?.type === 'image';
  const isAudio = selectedModel?.type === 'audio';

  return (
    <div className={`rounded-xl border backdrop-blur-sm transition-all ${selected ? 'ring-1 ring-white/20' : ''}`}
      style={{ borderColor: `${color}44`, background: 'rgba(17,17,19,0.95)', width: data.nodeType === 'generate' ? 280 : data.nodeType === 'upload' ? 240 : data.nodeType === 'prompt' ? 260 : 200 }}>
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#0a0a0a', border: `2px solid ${color}66` }} />
      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#0a0a0a', border: `2px solid ${color}66` }} />

      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between cursor-pointer" style={{ borderColor: `${color}22` }}
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: running ? color : resultUrl ? '#4ade80' : `${color}66` }} />
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase" style={{ color }}>{data.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.nodeType === 'generate' && (
            <button onClick={(e) => { e.stopPropagation(); execute(); }} disabled={running}
              className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
              style={{ background: running ? `${color}22` : `${color}33`, color: running ? `${color}88` : color }}>
              {running ? '◌' : '▶'}
            </button>
          )}
          <span className="text-white/15 text-[10px]">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2.5 space-y-2 max-h-[400px] overflow-y-auto nowheel" style={{ scrollbarWidth: 'thin' }}>

          {/* ── PROMPT NODE ── */}
          {data.nodeType === 'prompt' && (
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the creative direction..."
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg p-2.5 text-[11px] text-white/70 resize-none outline-none placeholder:text-white/10 min-h-[80px]"
            />
          )}

          {/* ── GENERATE NODE ── */}
          {data.nodeType === 'generate' && (<>
            {/* Model selector */}
            <div>
              <label className="font-mono text-[8px] tracking-[0.15em] text-white/20 mb-1 block">MODEL</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-md px-2 py-1.5 text-[10px] text-white/60 outline-none">
                <optgroup label="Video">
                  {MODELS.filter(m => m.type === 'video').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
                <optgroup label="Image">
                  {MODELS.filter(m => m.type === 'image').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
                <optgroup label="Audio">
                  {MODELS.filter(m => m.type === 'audio').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
              </select>
            </div>

            {/* Prompt */}
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder={isAudio ? "Text to speak..." : "Describe what to generate..."}
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg p-2 text-[10px] text-white/60 resize-none outline-none placeholder:text-white/10 min-h-[60px]"
            />

            {/* Params row */}
            {!isAudio && (
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <label className="font-mono text-[8px] tracking-[0.12em] text-white/15 block mb-1">ASPECT</label>
                  <div className="flex gap-1">
                    {['16:9','9:16','1:1'].map(a => (
                      <button key={a} onClick={() => setAspect(a)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${aspect === a ? 'bg-white/10 text-white/60' : 'text-white/15'}`}>{a}</button>
                    ))}
                  </div>
                </div>
                {isVideo && (
                  <div>
                    <label className="font-mono text-[8px] tracking-[0.12em] text-white/15 block mb-1">DUR</label>
                    <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                      className="bg-surface-2 border border-white/[0.06] rounded px-1.5 py-0.5 text-[9px] text-white/50 outline-none">
                      <option value={5}>5s</option><option value={8}>8s</option><option value={10}>10s</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Upload zones */}
            {(isVideo || isImage) && (
              <div>
                <label className="font-mono text-[8px] tracking-[0.12em] text-white/15 block mb-1">
                  {isVideo ? 'KEYFRAMES' : 'STYLE REF'}
                </label>
                <div className={`grid gap-1.5 ${isVideo ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <label className="flex flex-col items-center justify-center h-16 rounded-lg border border-dashed border-white/[0.06] hover:border-white/[0.12] bg-white/[0.01] cursor-pointer transition-all overflow-hidden">
                    {uploadThumb ? (
                      <img src={uploadThumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <><div className="text-white/10 text-xs">↑</div><div className="font-mono text-[7px] text-white/10">{isVideo ? 'Start' : 'Reference'}</div></>
                    )}
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={e => handleUpload(e, setUpload, setUploadThumb)} />
                  </label>
                  {isVideo && (
                    <label className="flex flex-col items-center justify-center h-16 rounded-lg border border-dashed border-white/[0.06] hover:border-white/[0.12] bg-white/[0.01] cursor-pointer transition-all overflow-hidden">
                      {endThumb ? (
                        <img src={endThumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <><div className="text-white/10 text-xs">↑</div><div className="font-mono text-[7px] text-white/10">End</div></>
                      )}
                      <input type="file" accept="image/*,video/*" className="hidden" onChange={e => handleUpload(e, setEndUpload, setEndThumb)} />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* LoRA / Trained model */}
            {isImage && (
              <div>
                <label className="font-mono text-[8px] tracking-[0.12em] text-white/15 block mb-1">LoRA / STYLE ID</label>
                <div className="flex gap-1">
                  <input value={loraUrl} onChange={e => setLoraUrl(e.target.value)} placeholder="Paste style ID or URL..."
                    className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded px-2 py-1 text-[9px] text-white/50 outline-none placeholder:text-white/10" />
                  <input type="number" value={loraStrength} onChange={e => setLoraStrength(Number(e.target.value))}
                    min={0} max={2} step={0.1}
                    className="w-12 bg-white/[0.02] border border-white/[0.06] rounded px-1 py-1 text-[9px] text-white/40 outline-none text-center" />
                </div>
              </div>
            )}
          </>)}

          {/* ── UPLOAD NODE ── */}
          {data.nodeType === 'upload' && (
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center h-20 rounded-lg border border-dashed border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-500/[0.02] cursor-pointer transition-all overflow-hidden">
                {uploadThumb ? (
                  <img src={uploadThumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <><div className="text-cyan-400/30 text-lg">↑</div><div className="font-mono text-[8px] text-cyan-400/20">Image / Video / Asset</div></>
                )}
                <input type="file" accept="image/*,video/*,.safetensors" className="hidden" onChange={e => handleUpload(e, setUpload, setUploadThumb)} />
              </label>
              <input value={loraUrl} onChange={e => setLoraUrl(e.target.value)} placeholder="Or paste URL / LoRA ID..."
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded px-2 py-1.5 text-[9px] text-white/40 outline-none placeholder:text-white/10" />
              {upload && <div className="font-mono text-[8px] text-cyan-400/40">✓ Asset loaded</div>}
            </div>
          )}

          {/* ── QA NODE ── */}
          {data.nodeType === 'qa' && (
            <div className="space-y-2">
              <div className="text-[10px] text-white/30">{data.description}</div>
              <div className="flex gap-1.5">
                <button className="flex-1 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-mono text-[9px] text-emerald-400/60 hover:text-emerald-400">✓ Pass</button>
                <button className="flex-1 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 font-mono text-[9px] text-red-400/60 hover:text-red-400">✕ Fail</button>
              </div>
            </div>
          )}

          {/* ── EXPORT NODE ── */}
          {data.nodeType === 'export' && (
            <div className="space-y-2">
              <div className="text-[10px] text-white/30">{data.description}</div>
              <div className="flex gap-1.5">
                <button className="flex-1 px-2 py-1.5 rounded-md bg-surface-2 border border-white/[0.06] font-mono text-[9px] text-white/30 hover:text-white/50">↓ Download</button>
                <button className="flex-1 px-2 py-1.5 rounded-md bg-surface-2 border border-white/[0.06] font-mono text-[9px] text-white/30 hover:text-white/50">⧉ Copy URL</button>
              </div>
            </div>
          )}

          {/* ── TEXT NODE (brief) ── */}
          {data.nodeType === 'text' && (
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Client brief..."
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg p-2 text-[10px] text-white/50 resize-none outline-none placeholder:text-white/10 min-h-[60px]" />
          )}

          {/* ── Result display (shared) ── */}
          {resultUrl && (
            <div className="rounded-lg overflow-hidden border border-emerald-500/20">
              {resultUrl.includes('.mp4') || resultUrl.includes('video') ? (
                <video src={resultUrl} controls className="w-full" style={{ maxHeight: 140 }} />
              ) : (
                <img src={resultUrl} alt="" className="w-full" style={{ maxHeight: 140, objectFit: 'contain' }} />
              )}
              <a href={resultUrl} target="_blank" className="block px-2 py-1 font-mono text-[8px] text-emerald-400/40 hover:text-emerald-400 truncate">
                {resultUrl.split('/').pop()} ↗
              </a>
            </div>
          )}
          {result && !resultUrl && (
            <div className={`font-mono text-[9px] px-2 py-1 rounded ${error ? 'bg-red-500/[0.05] text-red-400/60' : 'bg-white/[0.02] text-white/30'}`}>
              {error || result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

// ── Default Brand Reveal Pipeline ──
const DEFAULT_NODES: any[] = [
  { id: 'brief', type: 'workflow', position: { x: 50, y: 140 },
    data: { label: 'Brief', nodeType: 'text', description: 'Client brief', prompt: 'Cinematic brand reveal for luxury streetwear. Dark aesthetic, glitch transitions, bass-heavy sound design.' } },
  { id: 'ref', type: 'workflow', position: { x: 50, y: 340 },
    data: { label: 'Assets', nodeType: 'upload', description: 'Upload reference images, video, LoRA' } },
  { id: 'prompt-v', type: 'workflow', position: { x: 340, y: 60 },
    data: { label: 'Video Prompt', nodeType: 'prompt', prompt: 'Slow drift across dark surface. Metallic chain catches volumetric light. Logo assembles from glitch fragments.' } },
  { id: 'prompt-i', type: 'workflow', position: { x: 340, y: 260 },
    data: { label: 'Image Prompt', nodeType: 'prompt', prompt: 'Luxury streetwear logo, minimal, dark background, metallic texture, centered' } },
  { id: 'gen-v', type: 'workflow', position: { x: 660, y: 40 },
    data: { label: 'Generate Video', nodeType: 'generate', description: 'Video generation', executable: true, modelId: 'krea-kling-2.5', prompt: 'Slow drift across dark surface. Metallic chain catches volumetric light.' } },
  { id: 'gen-i', type: 'workflow', position: { x: 660, y: 280 },
    data: { label: 'Generate Image', nodeType: 'generate', description: 'Image generation', executable: true, modelId: 'krea-flux', prompt: 'Luxury streetwear logo, minimal, dark background, metallic texture' } },
  { id: 'gen-a', type: 'workflow', position: { x: 660, y: 480 },
    data: { label: 'Generate Audio', nodeType: 'generate', description: 'Audio generation', executable: true, modelId: 'elevenlabs', prompt: 'Welcome to the void. Where darkness meets form.' } },
  { id: 'qa-v', type: 'workflow', position: { x: 980, y: 80 },
    data: { label: 'QA Video', nodeType: 'qa', description: 'Review composition, motion, pacing' } },
  { id: 'qa-i', type: 'workflow', position: { x: 980, y: 300 },
    data: { label: 'QA Image', nodeType: 'qa', description: 'Review style, color, typography' } },
  { id: 'deliver', type: 'workflow', position: { x: 1280, y: 200 },
    data: { label: 'Deliver', nodeType: 'export', description: 'Export to review portal or CDN' } },
];

const DEFAULT_EDGES: any[] = [
  { id: 'e1', source: 'brief', target: 'prompt-v', animated: true, style: { stroke: '#7c6af733' } },
  { id: 'e2', source: 'brief', target: 'prompt-i', animated: true, style: { stroke: '#7c6af733' } },
  { id: 'e3', source: 'ref', target: 'gen-v', style: { stroke: '#22d3ee33', strokeDasharray: '4 4' } },
  { id: 'e4', source: 'ref', target: 'gen-i', style: { stroke: '#22d3ee33', strokeDasharray: '4 4' } },
  { id: 'e5', source: 'prompt-v', target: 'gen-v', animated: true, style: { stroke: '#f59e0b33' } },
  { id: 'e6', source: 'prompt-i', target: 'gen-i', animated: true, style: { stroke: '#f59e0b33' } },
  { id: 'e7', source: 'gen-v', target: 'qa-v', animated: true, style: { stroke: '#4ade8033' } },
  { id: 'e8', source: 'gen-i', target: 'qa-i', animated: true, style: { stroke: '#4ade8033' } },
  { id: 'e9', source: 'qa-v', target: 'deliver', animated: true, style: { stroke: '#ef444433' } },
  { id: 'e10', source: 'qa-i', target: 'deliver', animated: true, style: { stroke: '#ef444433' } },
  { id: 'e11', source: 'gen-a', target: 'deliver', animated: true, style: { stroke: '#ef444433' } },
];

const NODE_PALETTE = [
  { type: 'text', label: 'Brief', icon: '▤' },
  { type: 'prompt', label: 'Prompt', icon: '✎' },
  { type: 'upload', label: 'Upload', icon: '↑' },
  { type: 'generate', label: 'Generate', icon: '◆' },
  { type: 'qa', label: 'QA Gate', icon: '✓' },
  { type: 'export', label: 'Export', icon: '↗' },
];

export default function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [showPalette, setShowPalette] = useState(false);
  const nc = useRef(DEFAULT_NODES.length);

  const onConnect = useCallback((c: Connection) => {
    setEdges(eds => addEdge({ ...c, animated: true, style: { stroke: '#7c6af733' } }, eds));
  }, [setEdges]);

  const addNode = (type: string) => {
    nc.current += 1;
    setNodes(nds => [...nds, {
      id: `n-${nc.current}`, type: 'workflow',
      position: { x: 300 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { label: NODE_PALETTE.find(n => n.type === type)?.label || type,
        nodeType: type, description: '', executable: type === 'generate',
        prompt: '', modelId: type === 'generate' ? 'krea-kling-2.5' : undefined, expanded: true },
    }]);
    setShowPalette(false);
  };

  return (
    <div className="max-w-6xl animate-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-white/90">Workflows</h2>
          <p className="text-sm text-white/25 mt-0.5">Drag nodes. Connect ports. Upload assets. Hit Run.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPalette(!showPalette)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/[0.06] font-mono text-[10px] text-white/40 hover:text-white/60 transition">
            + Node
          </button>
        </div>
      </div>

      {showPalette && (
        <div className="mb-4 bg-surface-1 border border-white/[0.06] rounded-xl p-3 animate-in flex gap-2 flex-wrap">
          {NODE_PALETTE.map(n => (
            <button key={n.type} onClick={() => addNode(n.type)}
              className="px-3 py-2 rounded-lg border border-white/[0.06] bg-surface-2 hover:border-white/[0.12] transition text-left"
              style={{ borderLeftColor: COLORS[n.type], borderLeftWidth: 3 }}>
              <span className="text-xs text-white/50">{n.icon} {n.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-surface-1 border border-white/[0.06] rounded-xl overflow-hidden" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0a0a' }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#7c6af733' } }}
        >
          <Background color="#ffffff06" gap={20} size={1} />
          <Controls showInteractive={false}
            style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }} />
          <MiniMap nodeColor={() => '#7c6af744'} maskColor="rgba(10,10,10,0.85)"
            style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }} />
        </ReactFlow>
      </div>

      <div className="mt-3 flex justify-between font-mono text-[9px] text-white/10 tracking-wider">
        <span>Drag to move · Drag ports to connect · ▶ Run on generate nodes · Upload assets directly on nodes</span>
        <span>{nodes.length} nodes · {edges.length} edges</span>
      </div>
    </div>
  );
}
