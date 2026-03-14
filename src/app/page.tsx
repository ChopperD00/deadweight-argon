'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const API = 'https://BUILT BY RENZO · ryujin.inferis.app/api/argon';
const KREA_API = 'https://api.krea.ai';
const KREA_KEY = '66eb338a-e1a9-4a69-bc3c-63ee9de86df2:4y-UB7mcv7c1iJTfkrjxHyz-NyJrQgu-';

type Tab = 'video' | 'image' | 'audio';
type Job = {
  id: string; tool: string; status: string; input: any;
  output?: any; error?: string; createdAt: string; completedAt?: string;
  // krea jobs
  job_id?: string; result?: { urls?: string[] };
};

const PROVIDERS = {
  video: [
    { id: 'luma', label: 'Luma ray-2', sub: 'Cinematic · ~60s', endpoint: 'argon' },
    { id: 'krea-kling-2.5', label: 'Kling 2.5', sub: 'via Krea · ~94s', endpoint: 'krea', path: '/generate/video/kling/kling-2.5' },
    { id: 'krea-hailuo-2.3', label: 'Hailuo 2.3', sub: 'via Krea · ~211s', endpoint: 'krea', path: '/generate/video/minimax/hailuo-2.3' },
    { id: 'krea-veo-3', label: 'Veo 3', sub: 'via Krea · ~65s', endpoint: 'krea', path: '/generate/video/google/veo-3' },
    { id: 'krea-wan-2.5', label: 'Wan 2.5', sub: 'via Krea · ~132s', endpoint: 'krea', path: '/generate/video/alibaba/wan-2.5' },
    { id: 'krea-runway-gen4', label: 'Runway Gen-4', sub: 'via Krea · ~47s', endpoint: 'krea', path: '/generate/video/runway/gen-4' },
  ],
  image: [
    { id: 'replicate', label: 'Flux 1.1 Pro', sub: 'via Replicate', endpoint: 'argon' },
    { id: 'krea-flux', label: 'Flux Dev', sub: 'via Krea · ~5s', endpoint: 'krea', path: '/generate/image/bfl/flux-1-dev' },
    { id: 'krea-imagen4', label: 'Imagen 4', sub: 'via Krea · ~32s', endpoint: 'krea', path: '/generate/image/google/imagen-4' },
  ],
  audio: [
    { id: 'elevenlabs', label: 'ElevenLabs v2', sub: 'Multilingual TTS', endpoint: 'argon' },
  ],
};

const ASPECTS = ['16:9', '9:16', '1:1'] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}

function UploadZone({ label, value, onUpload, onClear }: {
  label: string; value: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void;
}) {
  return (
    <div className="relative group">
      <label className="block font-mono text-[10px] tracking-[0.2em] text-white/25 mb-2">{label}</label>
      {value ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-accent/30 bg-black">
          <img src={`data:image/jpeg;base64,${value}`} alt="" className="w-full h-full object-contain" />
          <button onClick={onClear}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 border border-white/10 text-white/40 hover:text-white text-xs flex items-center justify-center">✕</button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-24 rounded-lg border border-dashed border-white/[0.08] hover:border-white/[0.15] bg-surface-2 cursor-pointer transition-all group-hover:bg-surface-3">
          <div className="text-white/10 text-xl mb-1">↑</div>
          <div className="font-mono text-[9px] text-white/15">Drop image or click</div>
          <input type="file" accept="image/*,video/*" className="hidden" onChange={onUpload} />
        </label>
      )}
    </div>
  );
}

export default function ArgonPage() {
  const [tab, setTab] = useState<Tab>('video');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState(PROVIDERS.video[0]);
  const [aspect, setAspect] = useState<string>('16:9');
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tools, setTools] = useState<any>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [styleRef, setStyleRef] = useState<string | null>(null);

  // Load persisted jobs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('argon-jobs');
      if (saved) setJobs(JSON.parse(saved));
    } catch {}
  }, []);

  // Persist jobs to localStorage
  useEffect(() => {
    if (jobs.length) {
      try { localStorage.setItem('argon-jobs', JSON.stringify(jobs.slice(0, 50))); } catch {}
    }
  }, [jobs]);

  // Load tools on mount
  useEffect(() => {
    fetch(`${API}/tools`).then(r => r.json()).then(setTools).catch(() => {});
    fetch(`${API}/jobs`).then(r => r.json()).then(d => {
      if (d.jobs?.length) {
        setJobs(prev => {
          const ids = new Set(prev.map(j => j.id || j.job_id));
          const newOnes = d.jobs.filter((j: Job) => !ids.has(j.id || j.job_id));
          return [...newOnes, ...prev];
        });
      }
    }).catch(() => {});
  }, []);

  // Update provider when tab changes
  useEffect(() => {
    setProvider(PROVIDERS[tab][0]);
  }, [tab]);

  // Poll active jobs
  useEffect(() => {
    const poll = async () => {
      const updated = await Promise.all(
        jobs.filter(j => j.status !== 'failed' && !j.completedAt && !j.result?.urls?.length).map(async (j) => {
          try {
            if (j.job_id) { // krea job
              const r = await fetch(`${KREA_API}/jobs/${j.job_id}`, { headers: { Authorization: `Bearer ${KREA_KEY}` } });
              const d = await r.json();
              return { ...j, status: d.status, result: d.result, completedAt: d.completed_at };
            } else { // argon job
              const r = await fetch(`${API}/jobs/${j.id}`);
              return await r.json();
            }
          } catch { return j; }
        })
      );
      if (updated.length) {
        setJobs(prev => prev.map(j => {
          const u = updated.find(u => (u.job_id || u.id) === (j.job_id || j.id));
          return u || j;
        }));
      }
    };
    pollRef.current = setInterval(poll, 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobs]);

  const generate = async () => {
    if (!prompt.trim() && !startFrame) return;
    setLoading(true);
    try {
      if (provider.endpoint === 'krea') {
        const body: any = { prompt: prompt.trim(), aspectRatio: aspect };
        if (tab === 'video') {
          body.duration = duration;
          if (startFrame) body.startImage = `data:image/jpeg;base64,${startFrame}`;
          if (endFrame) body.endImage = `data:image/jpeg;base64,${endFrame}`;
        }
        if (tab === 'image') {
          body.width = 1024; body.height = 1024;
          if (styleRef) body.styleImages = [{ url: `data:image/jpeg;base64,${styleRef}`, strength: 0.8 }];
        }
        const r = await fetch(`${KREA_API}${provider.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KREA_KEY}` },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        setJobs(prev => [{ id: d.job_id, job_id: d.job_id, tool: provider.label, status: d.status || 'queued',
          input: { prompt: prompt.trim(), provider: provider.id }, createdAt: d.created_at || new Date().toISOString(),
          result: d.result }, ...prev]);
      } else {
        const endpoint = tab === 'video' ? '/generate/video' : tab === 'image' ? '/generate/image' : '/generate/audio';
        const body: any = tab === 'audio'
          ? { text: prompt.trim() }
          : { prompt: prompt.trim(), provider: provider.id === 'replicate' ? undefined : provider.id, aspectRatio: aspect,
            ...(startFrame && { referenceImage: `data:image/jpeg;base64,${startFrame}` }) };
        if (tab === 'video') body.duration = duration;
        const r = await fetch(`${API}${endpoint}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        setJobs(prev => [d, ...prev]);
      }
    } catch (err: any) {
      setJobs(prev => [{ id: `err-${Date.now()}`, tool: provider.label, status: 'failed',
        input: { prompt }, error: err.message, createdAt: new Date().toISOString() }, ...prev]);
    }
    setLoading(false);
  };

  const getOutputUrl = (j: Job): string | null => {
    if (j.result?.urls?.length) return j.result.urls[0];
    if (j.output?.resultUrl) return j.output.resultUrl;
    if (j.output?.latest?.assets?.video) return j.output.latest.assets.video;
    if (j.output?.audioBase64) return `data:audio/mpeg;base64,${j.output.audioBase64}`;
    return null;
  };

  const isComplete = (j: Job) =>
    j.status === 'completed' || j.status === 'complete' || !!j.completedAt || !!j.result?.urls?.length || !!getOutputUrl(j);

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Subtle grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm font-semibold tracking-[0.2em] text-white/90">ARG0N</div>
            <div className="w-px h-4 bg-white/10" />
            <div className="font-mono text-[10px] tracking-[0.15em] text-white/30">CREATIVE ENGINE</div>
          </div>
          <div className="flex items-center gap-4">
            {tools && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                <span className="font-mono text-[10px] tracking-wider text-white/30">
                  {Object.keys(tools.tools || {}).length} TOOLS · {Object.values(tools.envStatus || {}).filter(Boolean).length} KEYS
                </span>
              </div>
            )}
            <a href="https://ryujin.inferis.app" target="_blank" className="font-mono text-[10px] text-white/20 hover:text-white/40 transition">RYUJIN ↗</a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        {/* Tab bar */}
        <div className="flex gap-1 mb-8 p-1 bg-surface-1 rounded-lg w-fit">
          {(['video', 'image', 'audio'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-md font-mono text-xs tracking-[0.12em] uppercase transition-all ${
                tab === t ? 'bg-surface-3 text-white shadow-sm' : 'text-white/30 hover:text-white/50'
              }`}>
              {t === 'video' ? '◆ Video' : t === 'image' ? '◇ Image' : '♫ Audio'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* Left — Generation panel */}
          <div className="space-y-4 animate-in">
            {/* Prompt */}
            <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-5">
              <label className="block font-mono text-[10px] tracking-[0.2em] text-white/25 mb-3">
                {tab === 'audio' ? 'TEXT TO SPEAK' : 'PROMPT'}
              </label>
              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) generate(); }}
                placeholder={tab === 'video' ? 'Cinematic brand reveal. Logo assembles from glitch fragments on black...'
                  : tab === 'image' ? 'Luxury streetwear logo, minimal, dark background, metallic texture...'
                  : 'Welcome to Argon. The creative engine is live.'}
                className="w-full bg-transparent text-white/90 text-sm leading-relaxed resize-none outline-none placeholder:text-white/15 min-h-[100px]"
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
                <span className="font-mono text-[10px] text-white/15">⌘ + Enter to generate</span>
                <span className="font-mono text-[10px] text-white/15">{prompt.length} chars</span>
              </div>
            </div>

            {/* Provider selector */}
            <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-5">
              <label className="block font-mono text-[10px] tracking-[0.2em] text-white/25 mb-3">MODEL</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS[tab].map(p => (
                  <button key={p.id} onClick={() => setProvider(p)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      provider.id === p.id
                        ? 'border-accent/40 bg-accent/[0.06]'
                        : 'border-white/[0.04] hover:border-white/[0.08] bg-surface-2'
                    }`}>
                    <div className="text-xs font-medium text-white/80">{p.label}</div>
                    <div className="font-mono text-[10px] text-white/25 mt-0.5">{p.sub}</div>
                  </button>
                ))}
              </div>
            </div>


            {/* Reference uploads */}
            {tab !== 'audio' && (
              <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <label className="font-mono text-[10px] tracking-[0.2em] text-white/25">
                    {tab === 'video' ? 'KEYFRAMES' : 'STYLE REFERENCE'}
                  </label>
                  <span className="font-mono text-[9px] text-white/10">optional</span>
                </div>
                {tab === 'video' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <UploadZone label="START FRAME" value={startFrame}
                      onUpload={async (e) => { const f = e.target.files?.[0]; if (f) setStartFrame(await fileToBase64(f)); }}
                      onClear={() => setStartFrame(null)} />
                    <UploadZone label="END FRAME" value={endFrame}
                      onUpload={async (e) => { const f = e.target.files?.[0]; if (f) setEndFrame(await fileToBase64(f)); }}
                      onClear={() => setEndFrame(null)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <UploadZone label="REFERENCE" value={styleRef}
                      onUpload={async (e) => { const f = e.target.files?.[0]; if (f) setStyleRef(await fileToBase64(f)); }}
                      onClear={() => setStyleRef(null)} />
                    <div className="col-span-2 flex items-center justify-center rounded-lg border border-dashed border-white/[0.04] bg-surface-2/50">
                      <div className="text-center p-4">
                        <div className="font-mono text-[9px] text-white/10 tracking-wider">INSPIRATION BOARD</div>
                        <div className="text-[10px] text-white/[0.06] mt-1">Multi-ref coming soon</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Params row */}
            {tab !== 'audio' && (
              <div className="flex gap-3">
                <div className="flex-1 bg-surface-1 border border-white/[0.06] rounded-xl p-4">
                  <label className="block font-mono text-[10px] tracking-[0.2em] text-white/25 mb-2">ASPECT</label>
                  <div className="flex gap-1.5">
                    {ASPECTS.map(a => (
                      <button key={a} onClick={() => setAspect(a)}
                        className={`px-3 py-1.5 rounded-md font-mono text-[11px] transition ${
                          aspect === a ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/40'
                        }`}>{a}</button>
                    ))}
                  </div>
                </div>
                {tab === 'video' && (
                  <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-4 w-32">
                    <label className="block font-mono text-[10px] tracking-[0.2em] text-white/25 mb-2">DURATION</label>
                    <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                      className="bg-surface-2 border border-white/[0.06] rounded-md px-2 py-1.5 text-xs text-white/70 w-full outline-none">
                      <option value={5}>5s</option><option value={8}>8s</option><option value={10}>10s</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Generate button */}
            <button onClick={generate} disabled={loading || (!prompt.trim() && !startFrame)}
              className={`w-full py-3.5 rounded-xl font-mono text-xs tracking-[0.15em] uppercase transition-all ${
                loading ? 'bg-accent/20 text-accent/60 cursor-wait shimmer'
                : !prompt.trim() ? 'bg-surface-2 text-white/15 cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent/90 active:scale-[0.99] shadow-lg shadow-accent/20'
              }`}>
              {loading ? '◌ GENERATING...' : '◆ GENERATE'}
            </button>
          </div>

          {/* Right — Jobs / Output panel */}
          <div className="space-y-3 animate-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] tracking-[0.2em] text-white/25">OUTPUT</span>
              <span className="font-mono text-[10px] text-white/15">{jobs.length} jobs</span>
            </div>

            {jobs.length === 0 && (
              <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-12 text-center">
                <div className="text-white/10 text-3xl mb-3">◇</div>
                <div className="font-mono text-[10px] text-white/15 tracking-wider">NO GENERATIONS YET</div>
                <div className="text-xs text-white/10 mt-1">Write a prompt and hit generate</div>
              </div>
            )}

            {jobs.map(j => {
              const url = getOutputUrl(j);
              const done = isComplete(j);
              const failed = j.status === 'failed';
              return (
                <div key={j.id || j.job_id}
                  className={`bg-surface-1 border rounded-xl overflow-hidden transition-all ${
                    failed ? 'border-err/20' : done ? 'border-success/20' : 'border-white/[0.06]'
                  }`}>
                  {/* Output preview */}
                  {url && !url.startsWith('data:audio') && (
                    <div className="aspect-video bg-black relative">
                      {j.tool?.toLowerCase().includes('audio') || tab === 'audio' ? null : url.endsWith('.mp4') || j.tool?.includes('video') || j.tool?.includes('Kling') || j.tool?.includes('Hailuo') || j.tool?.includes('Veo') || j.tool?.includes('Wan') || j.tool?.includes('Runway') || j.tool?.includes('luma') ? (
                        <video src={url} controls className="w-full h-full object-contain" />
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-contain" />
                      )}
                    </div>
                  )}
                  {url && url.startsWith('data:audio') && (
                    <div className="p-4"><audio src={url} controls className="w-full" /></div>
                  )}

                  {/* Job info */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] tracking-wider text-white/40">{j.tool}</span>
                      <span className={`font-mono text-[9px] tracking-[0.12em] px-2 py-0.5 rounded ${
                        failed ? 'bg-err/10 text-err' : done ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'
                      }`}>
                        {failed ? '✕ FAILED' : done ? '✓ COMPLETE' : '◌ ' + (j.status?.toUpperCase() || 'PROCESSING')}
                      </span>
                    </div>
                    <p className="text-xs text-white/30 line-clamp-2">
                      {j.input?.prompt || j.input?.text || '—'}
                    </p>
                    {failed && j.error && (
                      <p className="text-[11px] text-err/60 mt-2 font-mono">{j.error}</p>
                    )}
                    {url && !url.startsWith('data:') && (
                      <a href={url} target="_blank" className="inline-block mt-2 font-mono text-[10px] text-accent/60 hover:text-accent transition">
                        Open CDN URL ↗
                      </a>
                    )}
                    <div className="font-mono text-[9px] text-white/10 mt-2">
                      {j.id || j.job_id}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] mt-16 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between font-mono text-[9px] text-white/15 tracking-wider">
          <span>ARG0N · RENZO · SECRET MENU</span>
          <span>BUILT BY RENZO · ryujin.inferis.app/api/argon</span>
        </div>
      </footer>
    </div>
  );
}
