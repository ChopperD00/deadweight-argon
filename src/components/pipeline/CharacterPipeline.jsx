import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const STAGES = [
  { id: 'reference', label: 'REFERENCE', sub: 'Upload / Describe' },
  { id: 'ideate',    label: 'IDEATE',    sub: 'Flux / Krea' },
  { id: 'refine',    label: 'REFINE',    sub: 'Nano Banana' },
  { id: 'charsheet', label: 'CHAR SHEET', sub: 'Consistency' },
  { id: 'output',    label: 'OUTPUT',    sub: 'Export / Save' },
];

const IDEATION_MODELS = ['Flux (Krea)', 'SDXL', 'Flux Pro', 'Stable Diffusion 3'];
const VIDEO_MODELS   = ['Dream Machine', 'Kling 3.0', 'Runway Gen-3', 'Luma'];

export default function CharacterPipeline({ onGenerate, onVideoGenerate, onSavePersona }) {
  const [activeStage, setActiveStage]   = useState(0);
  const [done, setDone]                 = useState(new Set());
  const [referenceImage, setRef]        = useState(null);
  const [name, setName]                 = useState('');
  const [desc, setDesc]                 = useState('');
  const [ideation, setIdeation]         = useState(IDEATION_MODELS[0]);
  const [video, setVideo]               = useState(VIDEO_MODELS[0]);
  const [isRunning, setIsRunning]       = useState(false);
  const fileRef = useRef(null);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = ev => setRef(ev.target.result);
    r.readAsDataURL(file);
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  const runPipeline = async () => {
    if (!desc && !referenceImage) return;
    setIsRunning(true);
    for (let i = 1; i <= 3; i++) {
      setActiveStage(i);
      const prompts = [
        `${desc || 'character reference'}${name ? ', ' + name : ''}`,
        `refined character study, ${desc}`,
        `character sheet multiple angles front 3/4 side back, ${desc}${name ? ', ' + name : ''}`,
      ];
      await onGenerate(prompts[i - 1], { width: 1024, height: 1024, steps: i === 2 ? 28 : 4 });
      setDone(prev => new Set([...prev, i]));
      await delay(800);
    }
    setActiveStage(4);
    setDone(prev => new Set([...prev, 4]));
    setIsRunning(false);
  };

  return (
    <div className="cp-root">
      {/* Stage track */}
      <div className="stage-track">
        {STAGES.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`snode ${i === activeStage ? 'active' : ''} ${done.has(i) ? 'done' : ''}`}>
              <div className="sdot">{done.has(i) ? '✓' : i + 1}</div>
              <div className="sinfo">
                <div className="slabel">{s.label}</div>
                <div className="ssub">{s.sub}</div>
              </div>
            </div>
            {i < STAGES.length - 1 && <div className={`sarrow ${done.has(i) ? 'done' : ''}`}>→</div>}
          </React.Fragment>
        ))}
      </div>

      {/* Panels */}
      <div className="panels">
        <div className="panel left">
          <div className="ph">PIPELINE INPUT</div>
          <div className="pbody">
            <div className="sl">REFERENCE IMAGE</div>
            <div className="upload"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              {referenceImage
                ? <img src={referenceImage} alt="ref" className="rimg" />
                : <div className="uphint"><span className="upicon">⊕</span><span>Drop reference or click to upload</span></div>
              }
              <input ref={fileRef} type="file" accept="image/*" onChange={e => loadFile(e.target.files?.[0])} hidden />
            </div>

            <div className="sl">CHARACTER NAME</div>
            <input className="ei" placeholder="Character designation..." value={name} onChange={e => setName(e.target.value)} />

            <div className="sl">SCENE / STYLE DESCRIPTION</div>
            <textarea className="et" rows={4} placeholder="Describe character, style, aesthetic, mood..." value={desc} onChange={e => setDesc(e.target.value)} />

            <div className="model-row">
              <div className="mg"><div className="sl">IDEATION MODEL</div>
                <select className="es" value={ideation} onChange={e => setIdeation(e.target.value)}>
                  {IDEATION_MODELS.map(m => <option key={m}>{m}</option>)}</select></div>
              <div className="mg"><div className="sl">VIDEO MODEL</div>
                <select className="es" value={video} onChange={e => setVideo(e.target.value)}>
                  {VIDEO_MODELS.map(m => <option key={m}>{m}</option>)}</select></div>
            </div>

            <button className={`runbtn ${isRunning ? 'running' : ''}`}
              onClick={runPipeline} disabled={isRunning || (!desc && !referenceImage)}>
              {isRunning ? `◈ ${STAGES[activeStage]?.label}...` : '▶ RUN FULL PIPELINE'}
            </button>
          </div>
        </div>

        <div className="panel right">
          <div className="ph">PIPELINE OUTPUT</div>
          <div className="output-area">
            {activeStage === 4
              ? <div className="complete"><div className="ci">✓</div><div className="cl">PIPELINE COMPLETE</div><div className="cs">Character asset generated</div></div>
              : isRunning
                ? <div className="running-state">
                    <div className="rl">{STAGES[activeStage]?.label}</div>
                    <div className="pbar"><motion.div className="pfill" animate={{ width: `${(activeStage / 4) * 100}%` }} transition={{ duration: 0.6 }} /></div>
                  </div>
                : <div className="empty">Output will appear here</div>
            }
          </div>
          <div className="out-actions">
            <button className="abtn" onClick={() => onSavePersona({ name, desc, referenceImage, model: ideation })} disabled={activeStage < 4}>◈ SAVE AS PERSONA</button>
            <button className="abtn" disabled={activeStage < 4}>↗ EXPORT ASSETS</button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .cp-root { height:100%; display:flex; flex-direction:column; padding:16px; gap:16px; overflow-y:auto; }
        .stage-track { display:flex; align-items:center; gap:8px; padding:12px 16px; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); flex-shrink:0; overflow-x:auto; }
        .snode { display:flex; align-items:center; gap:8px; opacity:.35; transition:opacity .3s; }
        .snode.active { opacity:1; } .snode.done { opacity:.75; }
        .sdot { width:26px; height:26px; border:1px solid var(--encom-gray-dark); border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-size:10px; color:var(--encom-gray-light); flex-shrink:0; }
        .snode.active .sdot { border-color:var(--encom-cyan); color:var(--encom-cyan); box-shadow:0 0 8px rgba(0,238,238,.4); }
        .snode.done .sdot { border-color:var(--encom-gold); color:var(--encom-gold); background:rgba(255,204,0,.1); }
        .slabel { font-family:var(--font-display); font-size:10px; color:var(--encom-cyan); letter-spacing:1px; white-space:nowrap; }
        .ssub { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-light); white-space:nowrap; }
        .sarrow { color:var(--encom-gray-dark); font-size:14px; flex-shrink:0; transition:color .3s; }
        .sarrow.done { color:var(--encom-gold); }
        .panels { display:grid; grid-template-columns:1fr 1fr; gap:16px; flex:1; min-height:0; }
        .panel { background:rgba(0,0,0,.5); border:1px solid var(--encom-cyan-dim); display:flex; flex-direction:column; overflow:hidden; }
        .ph { padding:10px 16px; font-family:var(--font-display); font-size:10px; letter-spacing:2px; color:var(--encom-gray-light); border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,238,238,.03); flex-shrink:0; }
        .pbody { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
        .sl { font-family:var(--font-display); font-size:9px; color:var(--encom-gray-light); letter-spacing:2px; }
        .upload { border:1px dashed var(--encom-cyan-dim); height:110px; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; transition:border-color .2s; }
        .upload:hover { border-color:var(--encom-cyan); }
        .rimg { width:100%; height:100%; object-fit:contain; }
        .uphint { display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--encom-gray-light); font-family:var(--font-mono); font-size:11px; }
        .upicon { font-size:22px; color:var(--encom-cyan-dim); }
        .ei { width:100%; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); color:var(--encom-white); font-family:var(--font-mono); font-size:12px; padding:8px 10px; outline:none; box-sizing:border-box; }
        .ei:focus { border-color:var(--encom-cyan); } .ei::placeholder { color:var(--encom-gray-dark); }
        .et { width:100%; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); color:var(--encom-white); font-family:var(--font-mono); font-size:11px; padding:8px 10px; outline:none; resize:vertical; box-sizing:border-box; line-height:1.5; }
        .et:focus { border-color:var(--encom-cyan); } .et::placeholder { color:var(--encom-gray-dark); }
        .model-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .mg { display:flex; flex-direction:column; gap:4px; }
        .es { width:100%; background:rgba(0,0,0,.6); border:1px solid var(--encom-cyan-dim); color:var(--encom-cyan); font-family:var(--font-mono); font-size:11px; padding:7px 8px; outline:none; cursor:pointer; }
        .runbtn { width:100%; padding:13px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan); color:var(--encom-cyan); font-family:var(--font-display); font-size:11px; letter-spacing:2px; cursor:pointer; transition:all .2s; margin-top:auto; }
        .runbtn:hover:not(:disabled) { background:rgba(0,238,238,.2); box-shadow:0 0 16px rgba(0,238,238,.2); }
        .runbtn:disabled { opacity:.4; cursor:not-allowed; } .runbtn.running { border-color:var(--encom-gold); color:var(--encom-gold); }
        .right { padding:16px; }
        .output-area { flex:1; display:flex; align-items:center; justify-content:center; border:1px solid var(--encom-gray-dark); background:rgba(0,0,0,.3); margin:12px 0; min-height:180px; }
        .empty { color:var(--encom-gray-dark); font-family:var(--font-mono); font-size:12px; }
        .running-state { display:flex; flex-direction:column; align-items:center; gap:14px; width:75%; }
        .rl { font-family:var(--font-display); font-size:11px; color:var(--encom-gold); letter-spacing:2px; }
        .pbar { width:100%; height:2px; background:var(--encom-gray-dark); }
        .pfill { height:100%; background:var(--encom-cyan); box-shadow:0 0 8px var(--encom-cyan); }
        .complete { display:flex; flex-direction:column; align-items:center; gap:8px; }
        .ci { font-size:30px; color:var(--encom-gold); } .cl { font-family:var(--font-display); font-size:13px; color:var(--encom-cyan); letter-spacing:2px; } .cs { font-family:var(--font-mono); font-size:10px; color:var(--encom-gray-light); }
        .out-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .abtn { padding:10px; background:rgba(0,0,0,.4); border:1px solid var(--encom-gray-dark); color:var(--encom-gray-light); font-family:var(--font-display); font-size:10px; letter-spacing:1px; cursor:pointer; transition:all .2s; }
        .abtn:hover:not(:disabled) { border-color:var(--encom-cyan-dim); color:var(--encom-cyan); } .abtn:disabled { opacity:.3; cursor:not-allowed; }
      `}</style>
    </div>
  );
}
