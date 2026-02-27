import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import argon from '../../lib/argon-client';

const ART_STYLES = ['ENCOM GRID','NOIR SKETCH','ANIME CEL','OIL PAINT','GLITCH ART','WATERCOLOR','PIXEL ART','BRUTALIST'];

function detectBeats(buffer, threshold = 0.15, minGap = 0.28) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.floor(sr * 0.02);
  const beats = [];
  let prev = 0;
  for (let i = 0; i < data.length - win; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += data[j] * data[j];
    e /= win;
    const t = i / sr;
    const gap = beats.length ? t - beats[beats.length - 1] : Infinity;
    if ((e - prev) > threshold && gap > minGap) beats.push(t);
    prev = e * 0.55 + prev * 0.45;
  }
  return beats;
}

export default function VideoEditor({ generations }) {
  const [audioFile, setAudioFile]   = useState(null);
  const [audioBuf, setAudioBuf]     = useState(null);
  const [beats, setBeats]           = useState([]);
  const [duration, setDuration]     = useState(0);
  const [scenes, setScenes]         = useState([]);
  const [analyzing, setAnalyzing]   = useState(false);
  const [playing, setPlaying]       = useState(false);
  const [playhead, setPlayhead]     = useState(0);
  const waveRef   = useRef(null);
  const fileRef   = useRef(null);
  const timerRef  = useRef(null);

  const handleUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAnalyzing(true);
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      setAudioBuf(decoded);
      const dur = decoded.duration;
      setDuration(dur);
      const b = detectBeats(decoded);
      setBeats(b);
      // Auto-segment into scene slots (group ~4 beats per scene, max 16)
      const nScenes = Math.min(Math.max(Math.floor(b.length / 4), 4), 16);
      const segDur = dur / nScenes;
      setScenes(Array.from({ length: nScenes }, (_, i) => ({
        id: i, start: i * segDur, end: Math.min((i+1) * segDur, dur),
        style: ART_STYLES[i % ART_STYLES.length], prompt: '', status: 'pending', videoUrl: null,
      })));
      setTimeout(() => drawWave(decoded, b), 80);
    } catch (err) { console.error('Audio error', err); }
    finally { ctx?.close(); setAnalyzing(false); }
  };

  const drawWave = (buf, beatMarkers) => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width  = canvas.offsetWidth  * dpr;
    const H = canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const d = buf.getChannelData(0);
    const amp = H / 2;
    ctx.strokeStyle = '#00EEEE';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let x = 0; x < W; x += 2) {
      const idx = Math.floor((x / W) * d.length);
      const pk = Math.abs(d[idx]) * amp * 0.85;
      ctx.moveTo(x, amp - pk); ctx.lineTo(x, amp + pk);
    }
    ctx.stroke();
    ctx.strokeStyle = '#FFCC00'; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    beatMarkers.forEach(t => {
      const x = (t / buf.duration) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });
  };

  const togglePlay = () => {
    if (playing) { clearInterval(timerRef.current); setPlaying(false); }
    else {
      setPlaying(true);
      const t0 = Date.now() - playhead * 1000;
      timerRef.current = setInterval(() => {
        const el = (Date.now() - t0) / 1000;
        if (el >= duration) { setPlayhead(0); setPlaying(false); clearInterval(timerRef.current); }
        else setPlayhead(el);
      }, 50);
    }
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const genAll = async () => {
    for (const s of scenes) {
      setScenes(p => p.map(x => x.id === s.id ? { ...x, status: 'generating' } : x));
      try {
        const job = await argon.generateVideo({
          prompt: s.prompt || `cinematic scene, ${s.style.toLowerCase()} style`,
          backend: 'dream_machine',
          duration: Math.round(s.end - s.start)
        }, { wait: true });
        const videoUrl = job.result?.video || job.result?.output || null;
        setScenes(p => p.map(x => x.id === s.id ? { ...x, status: 'complete', videoUrl } : x));
      } catch (err) {
        setScenes(p => p.map(x => x.id === s.id ? { ...x, status: 'error' } : x));
      }
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const setStyle  = (id, v) => setScenes(p => p.map(x => x.id === id ? { ...x, style: v } : x));
  const setPrompt = (id, v) => setScenes(p => p.map(x => x.id === id ? { ...x, prompt: v } : x));
  const fmt = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(1).padStart(4,'0')}`;
  const phPct = duration > 0 ? (playhead / duration) * 100 : 0;

  return (
    <div className="ve-root">
      <div className="topbar">
        <span className="title">VIDEO EDITING ENGINE</span>
        <div className="controls">
          <button className="tbtn" onClick={togglePlay} disabled={!audioBuf}>{playing ? '⏸ PAUSE' : '▶ PLAY'}</button>
          <span className="tc">{fmt(playhead)} / {fmt(duration)}</span>
          <span className="bc">{beats.length} BEATS</span>
        </div>
        {scenes.length > 0 && <button className="gab" onClick={genAll}>▶ GENERATE ALL SCENES</button>}
      </div>

      <div className="wave-section">
        {audioBuf ? (
          <>
            <div className="wc">
              <canvas ref={waveRef} className="wcanvas" />
              <div className="ph-line" style={{ left: `${phPct}%` }} />
              {scenes.map(s => (
                <div key={s.id} className={`seg ${s.status}`}
                  style={{ left:`${(s.start/duration)*100}%`, width:`${((s.end-s.start)/duration)*100}%` }} />
              ))}
            </div>
            <div className="ainfo"><span>{audioFile?.name}</span><span>{duration.toFixed(1)}s · {beats.length} beats · {scenes.length} scenes</span></div>
          </>
        ) : (
          <div className="aupload" onClick={() => fileRef.current?.click()}>
            {analyzing
              ? <div className="anz"><div className="ring lg" /><span>ANALYZING AUDIO...</span></div>
              : <><div className="aicon">♫</div><div className="atext">DROP AUDIO TRACK</div><div className="asub">MP3 · WAV · M4A — beat detection + auto scene timing</div></>
            }
            <input ref={fileRef} type="file" accept="audio/*" onChange={handleUpload} hidden />
          </div>
        )}
      </div>

      <div className="timeline">
        <div className="tl-hdr">
          SCENE TIMELINE
          {scenes.length > 0 && <span className="tl-sub">{scenes.length} SEGMENTS · STYLE + PROMPT PER SCENE</span>}
        </div>
        <div className="tracks">
          {scenes.length === 0
            ? <div className="te">Load audio track to auto-generate scene timeline from beat analysis</div>
            : scenes.map(s => (
              <div key={s.id} className={`tscene ${s.status}`}>
                <div className="smeta">
                  <span className="snum">S{(s.id+1).toString().padStart(2,'0')}</span>
                  <span className="stime">{fmt(s.start)}–{fmt(s.end)}</span>
                  <span className={`sdot ${s.status}`} />
                </div>
                <select className="ssel" value={s.style} onChange={e => setStyle(s.id, e.target.value)}>
                  {ART_STYLES.map(st => <option key={st}>{st}</option>)}
                </select>
                <input className="sprompt" placeholder="Scene prompt..." value={s.prompt} onChange={e => setPrompt(s.id, e.target.value)} />
                <div className="sdur">{(s.end - s.start).toFixed(1)}s</div>
              </div>
            ))
          }
        </div>
      </div>

      <style jsx>{`
        .ve-root { height:100%; display:flex; flex-direction:column; overflow:hidden; background:rgba(0,5,5,.8); }
        .topbar { display:flex; align-items:center; gap:14px; padding:10px 16px; border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,0,0,.5); flex-shrink:0; }
        .title { font-family:var(--font-display); font-size:10px; letter-spacing:2px; color:var(--encom-gray-light); }
        .controls { display:flex; align-items:center; gap:14px; }
        .tbtn { padding:5px 12px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan-dim); color:var(--encom-cyan); font-family:var(--font-display); font-size:10px; letter-spacing:1px; cursor:pointer; transition:all .2s; }
        .tbtn:hover:not(:disabled) { border-color:var(--encom-cyan); } .tbtn:disabled { opacity:.3; cursor:not-allowed; }
        .tc { font-family:var(--font-mono); font-size:12px; color:var(--encom-cyan); letter-spacing:1px; }
        .bc { font-family:var(--font-mono); font-size:10px; color:var(--encom-gold); }
        .gab { margin-left:auto; padding:7px 14px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan); color:var(--encom-cyan); font-family:var(--font-display); font-size:10px; letter-spacing:2px; cursor:pointer; transition:all .2s; }
        .gab:hover { background:rgba(0,238,238,.18); }
        .wave-section { height:96px; flex-shrink:0; border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,0,0,.6); }
        .aupload { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; gap:5px; border:1px dashed var(--encom-cyan-dim); margin:6px 16px; transition:border-color .2s; }
        .aupload:hover { border-color:var(--encom-cyan); }
        .aicon { font-size:20px; color:var(--encom-cyan-dim); } .atext { font-family:var(--font-display); font-size:11px; color:var(--encom-gray-light); letter-spacing:2px; } .asub { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); }
        .anz { display:flex; flex-direction:column; align-items:center; gap:8px; } .anz span { font-family:var(--font-mono); font-size:10px; color:var(--encom-gold); }
        .wc { position:relative; height:calc(100% - 20px); margin:6px 16px 0; }
        .wcanvas { width:100%; height:100%; display:block; }
        .ph-line { position:absolute; top:0; bottom:0; width:1px; background:var(--encom-gold); box-shadow:0 0 4px var(--encom-gold); pointer-events:none; }
        .seg { position:absolute; top:0; bottom:0; background:rgba(0,238,238,.04); border-left:1px solid rgba(0,238,238,.18); pointer-events:none; }
        .seg.generating { background:rgba(255,204,0,.06); border-color:rgba(255,204,0,.3); } .seg.complete { background:rgba(0,238,238,.08); border-color:rgba(0,238,238,.3); }
        .ainfo { display:flex; justify-content:space-between; padding:3px 16px; font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); }
        .timeline { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .tl-hdr { padding:9px 16px; font-family:var(--font-display); font-size:10px; letter-spacing:2px; color:var(--encom-gray-light); border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,238,238,.03); display:flex; align-items:center; gap:14px; flex-shrink:0; }
        .tl-sub { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); letter-spacing:1px; }
        .tracks { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:3px; }
        .te { display:flex; align-items:center; justify-content:center; height:100%; color:var(--encom-gray-dark); font-family:var(--font-mono); font-size:11px; text-align:center; padding:20px; }
        .tscene { display:grid; grid-template-columns:90px 150px 1fr 46px; gap:8px; align-items:center; padding:7px 10px; background:rgba(0,0,0,.3); border:1px solid var(--encom-gray-dark); border-left:2px solid var(--encom-gray-dark); transition:all .2s; }
        .tscene.generating { border-left-color:var(--encom-gold); background:rgba(255,204,0,.03); } .tscene.complete { border-left-color:var(--encom-cyan); }
        .smeta { display:flex; flex-direction:column; gap:2px; }
        .snum { font-family:var(--font-mono); font-size:11px; color:var(--encom-cyan); } .stime { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); }
        .sdot { width:6px; height:6px; border-radius:50%; background:var(--encom-gray-dark); } .sdot.generating { background:var(--encom-gold); } .sdot.complete { background:var(--encom-cyan); }
        .ssel { background:rgba(0,0,0,.4); border:1px solid var(--encom-gray-dark); color:var(--encom-cyan); font-family:var(--font-mono); font-size:10px; padding:5px 6px; outline:none; cursor:pointer; width:100%; }
        .ssel:focus { border-color:var(--encom-cyan-dim); }
        .sprompt { background:rgba(0,0,0,.3); border:1px solid var(--encom-gray-dark); color:var(--encom-white); font-family:var(--font-mono); font-size:10px; padding:5px 8px; outline:none; width:100%; box-sizing:border-box; }
        .sprompt:focus { border-color:var(--encom-cyan-dim); } .sprompt::placeholder { color:var(--encom-gray-dark); }
        .sdur { font-family:var(--font-mono); font-size:10px; color:var(--encom-gray-light); text-align:right; }
        .ring { width:20px; height:20px; border:2px solid var(--encom-gray-dark); border-top-color:var(--encom-gold); border-radius:50%; animation:spin 1s linear infinite; } .ring.lg { width:26px; height:26px; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
