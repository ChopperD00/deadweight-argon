'use client';
import { useState, useCallback, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Handle, Position, type Connection, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const API = 'https://ryujin.inferis.app/api/argon';
const KREA_API = 'https://api.krea.ai';
const KREA_KEY = '66eb338a-e1a9-4a69-bc3c-63ee9de86df2:4y-UB7mcv7c1iJTfkrjxHyz-NyJrQgu-';

// ── Node color map ──
const COLORS: Record<string, string> = {
  prompt: '#7c6af7', generate: '#f59e0b', upload: '#22d3ee',
  qa: '#4ade80', export: '#ef4444', text: '#8b8b8b',
};

// ── Custom Node Component ──
function WorkflowNode({ data: _data, selected }: NodeProps) {
  const data = _data as Record<string, any>;
  const color = COLORS[data.nodeType as string] || '#7c6af7';
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(data.result as string || null);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    if (!data.executable) return;
    setRunning(true); setError(null);
    try {
      if (data.provider === 'krea' && data.kreaPath) {
        const body: any = { prompt: data.prompt || 'cinematic brand reveal', aspectRatio: data.aspectRatio || '16:9', duration: data.duration || 5 };
        if (data.startImage) body.startImage = data.startImage;
        const r = await fetch(`${KREA_API}${data.kreaPath}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KREA_KEY}` },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        setResult(d.job_id ? `Job: ${d.job_id} (${d.status})` : JSON.stringify(d));
      } else if (data.argonEndpoint) {
        const body: any = data.nodeType === 'generate' 
          ? { prompt: data.prompt || 'test generation', aspectRatio: data.aspectRatio || '16:9' }
          : { text: data.prompt || 'test audio' };
        const r = await fetch(`${API}${data.argonEndpoint}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        setResult(d.id ? `Job: ${d.id} (${d.status})` : JSON.stringify(d));
      }
    } catch (e: any) { setError(e.message); }
    setRunning(false);
  };

  return (
    <div className={`rounded-xl border backdrop-blur-sm transition-all ${selected ? 'ring-1 ring-white/20' : ''}`}
      style={{ borderColor: `${color}44`, background: 'rgba(17,17,19,0.95)', minWidth: 200 }}>
      <Handle type="target" position={Position.Left}
        style={{ width: 8, height: 8, background: '#0a0a0a', border: `2px solid ${color}66` }} />
      <Handle type="source" position={Position.Right}
        style={{ width: 8, height: 8, background: '#0a0a0a', border: `2px solid ${color}66` }} />

      {/* Header */}
      <div className="px-3 py-2 border-b" style={{ borderColor: `${color}22` }}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase" style={{ color }}>{data.label as string}</span>
          {!!(data.executable) && (
            <button onClick={execute} disabled={running}
              className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
              style={{ background: running ? `${color}22` : `${color}33`, color: running ? `${color}88` : color }}>
              {running ? '◌ ...' : '▶ RUN'}
            </button>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[11px] text-white/50">{data.description as string}</div>
        {data.model && <div className="font-mono text-[9px] text-white/20">Model: {data.model as string}</div>}
        {data.prompt && (
          <div className="font-mono text-[9px] text-white/15 bg-white/[0.02] rounded px-2 py-1 truncate max-w-[180px]">
            {data.prompt as string}
          </div>
        )}
        {result && <div className="font-mono text-[9px] text-emerald-400/70 bg-emerald-400/[0.05] rounded px-2 py-1 break-all">{result}</div>}
        {error && <div className="font-mono text-[9px] text-red-400/70 bg-red-400/[0.05] rounded px-2 py-1">{error}</div>}
      </div>
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

// ── Default workflow: Brand Reveal pipeline ──
const DEFAULT_NODES: any[] = [
  { id: 'brief', type: 'workflow', position: { x: 50, y: 120 },
    data: { label: 'Brief', nodeType: 'text', description: 'Client brief input', prompt: 'Cinematic brand reveal for luxury streetwear. Dark aesthetic, glitch transitions.' } },
  { id: 'prompt-video', type: 'workflow', position: { x: 300, y: 50 },
    data: { label: 'Video Prompt', nodeType: 'prompt', description: 'AI-refined video prompt',
      prompt: 'Slow drift across dark surface. Metallic chain catches volumetric light. Logo assembles from glitch fragments. Bass tone swells.' } },
  { id: 'prompt-image', type: 'workflow', position: { x: 300, y: 220 },
    data: { label: 'Image Prompt', nodeType: 'prompt', description: 'AI-refined image prompt',
      prompt: 'Luxury streetwear logo, minimal, dark background, metallic texture, centered composition' } },
  { id: 'ref-upload', type: 'workflow', position: { x: 300, y: 380 },
    data: { label: 'Reference', nodeType: 'upload', description: 'Upload start/end keyframes' } },
  { id: 'gen-video', type: 'workflow', position: { x: 580, y: 50 },
    data: { label: 'Generate Video', nodeType: 'generate', description: 'Kling 2.5 via Krea', model: 'Kling 2.5',
      executable: true, provider: 'krea', kreaPath: '/generate/video/kling/kling-2.5',
      prompt: 'Slow drift across dark surface. Metallic chain catches volumetric light.', aspectRatio: '16:9', duration: 5 } },
  { id: 'gen-image', type: 'workflow', position: { x: 580, y: 220 },
    data: { label: 'Generate Image', nodeType: 'generate', description: 'Flux via Krea', model: 'Flux Dev',
      executable: true, provider: 'krea', kreaPath: '/generate/image/bfl/flux-1-dev',
      prompt: 'Luxury streetwear logo, minimal, dark background, metallic texture' } },
  { id: 'gen-audio', type: 'workflow', position: { x: 580, y: 380 },
    data: { label: 'Generate Audio', nodeType: 'generate', description: 'ElevenLabs TTS', model: 'ElevenLabs v2',
      executable: true, argonEndpoint: '/generate/audio',
      prompt: 'Welcome to the void. Where darkness meets form.' } },
  { id: 'qa-video', type: 'workflow', position: { x: 850, y: 50 },
    data: { label: 'QA Video', nodeType: 'qa', description: 'Review composition, motion, style' } },
  { id: 'qa-image', type: 'workflow', position: { x: 850, y: 220 },
    data: { label: 'QA Image', nodeType: 'qa', description: 'Review style, color, composition' } },
  { id: 'deliver', type: 'workflow', position: { x: 1100, y: 150 },
    data: { label: 'Deliver', nodeType: 'export', description: 'Export to review portal' } },
];

const DEFAULT_EDGES: any[] = [
  { id: 'e-brief-pv', source: 'brief', target: 'prompt-video', animated: true, style: { stroke: '#7c6af744' } },
  { id: 'e-brief-pi', source: 'brief', target: 'prompt-image', animated: true, style: { stroke: '#7c6af744' } },
  { id: 'e-brief-ref', source: 'brief', target: 'ref-upload', animated: true, style: { stroke: '#22d3ee44' } },
  { id: 'e-pv-gv', source: 'prompt-video', target: 'gen-video', animated: true, style: { stroke: '#f59e0b44' } },
  { id: 'e-pi-gi', source: 'prompt-image', target: 'gen-image', animated: true, style: { stroke: '#f59e0b44' } },
  { id: 'e-ref-gv', source: 'ref-upload', target: 'gen-video', style: { stroke: '#22d3ee33', strokeDasharray: '4 4' } },
  { id: 'e-ref-ga', source: 'ref-upload', target: 'gen-audio', style: { stroke: '#22d3ee33', strokeDasharray: '4 4' } },
  { id: 'e-gv-qv', source: 'gen-video', target: 'qa-video', animated: true, style: { stroke: '#4ade8044' } },
  { id: 'e-gi-qi', source: 'gen-image', target: 'qa-image', animated: true, style: { stroke: '#4ade8044' } },
  { id: 'e-qv-d', source: 'qa-video', target: 'deliver', animated: true, style: { stroke: '#ef444444' } },
  { id: 'e-qi-d', source: 'qa-image', target: 'deliver', animated: true, style: { stroke: '#ef444444' } },
  { id: 'e-ga-d', source: 'gen-audio', target: 'deliver', animated: true, style: { stroke: '#ef444444' } },
];

// ── Node palette for adding new nodes ──
const NODE_PALETTE = [
  { type: 'prompt', label: 'Prompt', description: 'Text prompt node' },
  { type: 'generate', label: 'Generate', description: 'AI generation (video/image/audio)' },
  { type: 'upload', label: 'Upload', description: 'Reference upload node' },
  { type: 'qa', label: 'QA', description: 'Quality review gate' },
  { type: 'export', label: 'Export', description: 'Delivery / export' },
];

const MODEL_PRESETS = [
  { label: 'Kling 2.5', provider: 'krea', kreaPath: '/generate/video/kling/kling-2.5' },
  { label: 'Hailuo 2.3', provider: 'krea', kreaPath: '/generate/video/minimax/hailuo-2.3' },
  { label: 'Veo 3', provider: 'krea', kreaPath: '/generate/video/google/veo-3' },
  { label: 'Wan 2.5', provider: 'krea', kreaPath: '/generate/video/alibaba/wan-2.5' },
  { label: 'Luma ray-2', provider: 'argon', argonEndpoint: '/generate/video' },
  { label: 'Flux Dev', provider: 'krea', kreaPath: '/generate/image/bfl/flux-1-dev' },
  { label: 'Imagen 4', provider: 'krea', kreaPath: '/generate/image/google/imagen-4' },
  { label: 'ElevenLabs', provider: 'argon', argonEndpoint: '/generate/audio' },
];

// ── Main Workflow Editor ──
export default function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [showPalette, setShowPalette] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const nodeCount = useRef(DEFAULT_NODES.length);

  const onConnect = useCallback((conn: Connection) => {
    const color = COLORS['generate'];
    setEdges(eds => addEdge({ ...conn, animated: true, style: { stroke: `${color}44` } }, eds));
  }, [setEdges]);

  const addNode = (type: string) => {
    nodeCount.current += 1;
    const id = `node-${nodeCount.current}`;
    const preset = type === 'generate' ? MODEL_PRESETS[0] : {};
    const newNode = {
      id, type: 'workflow',
      position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: {
        label: NODE_PALETTE.find(n => n.type === type)?.label || type,
        nodeType: type,
        description: NODE_PALETTE.find(n => n.type === type)?.description || '',
        executable: type === 'generate',
        prompt: '',
        ...preset,
      },
    };
    setNodes(nds => [...nds, newNode]);
    setShowPalette(false);
  };

  const loadTemplate = (name: string) => {
    setSelectedTemplate(name);
    // Templates just reset to default for now — each template will have its own node config
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
  };

  const runAll = async () => {
    const executableNodes = nodes.filter(n => n.data.executable);
    for (const node of executableNodes) {
      // Trigger a data update that the node component can detect
      setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, autoRun: Date.now() } } : n));
    }
  };

  return (
    <div className="max-w-6xl animate-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-white/90">Workflows</h2>
          <p className="text-sm text-white/25 mt-0.5">Drag nodes, connect steps, hit Run.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPalette(!showPalette)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/[0.06] font-mono text-[10px] text-white/40 hover:text-white/60 transition">
            + Add Node
          </button>
          <button onClick={runAll}
            className="px-4 py-1.5 rounded-lg bg-accent/20 border border-accent/30 font-mono text-[10px] text-accent hover:bg-accent/30 transition">
            ▶ Run All
          </button>
        </div>
      </div>

      {/* Node palette dropdown */}
      {showPalette && (
        <div className="mb-4 bg-surface-1 border border-white/[0.06] rounded-xl p-4 animate-in">
          <div className="font-mono text-[10px] text-white/25 tracking-[0.15em] mb-3">ADD NODE</div>
          <div className="flex gap-2 flex-wrap">
            {NODE_PALETTE.map(n => (
              <button key={n.type} onClick={() => addNode(n.type)}
                className="px-3 py-2 rounded-lg border border-white/[0.06] bg-surface-2 hover:border-white/[0.12] transition-all text-left"
                style={{ borderLeftColor: COLORS[n.type], borderLeftWidth: 3 }}>
                <div className="text-xs text-white/60">{n.label}</div>
                <div className="font-mono text-[9px] text-white/20">{n.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template bar */}
      <div className="flex gap-2 mb-4">
        {['Brand Reveal', 'Social Batch', 'Product Hero'].map(t => (
          <button key={t} onClick={() => loadTemplate(t)}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] transition-all ${
              selectedTemplate === t
                ? 'bg-accent/15 border border-accent/30 text-accent'
                : 'bg-surface-2 border border-white/[0.04] text-white/25 hover:text-white/40'
            }`}>{t}</button>
        ))}
      </div>

      {/* Canvas */}
      <div className="bg-surface-1 border border-white/[0.06] rounded-xl overflow-hidden" style={{ height: 540 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0a0a' }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#7c6af733' } }}
        >
          <Background color="#ffffff08" gap={20} size={1} />
          <Controls
            showInteractive={false}
            style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={() => '#7c6af744'}
            maskColor="rgba(10,10,10,0.85)"
            style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}
          />
        </ReactFlow>
      </div>

      {/* Footer hint */}
      <div className="mt-3 flex justify-between font-mono text-[9px] text-white/10 tracking-wider">
        <span>Drag to move · Connect ports to wire · Click Run on generate nodes</span>
        <span>{nodes.length} nodes · {edges.length} edges</span>
      </div>
    </div>
  );
}
