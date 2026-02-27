import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const POSES = [
  { id: 'front',     label: 'FRONT',    desc: 'full body, front view facing camera' },
  { id: 'quarter_l', label: '3/4 LEFT', desc: 'full body, three-quarter left view' },
  { id: 'side',      label: 'SIDE',     desc: 'full body, side profile view' },
  { id: 'back',      label: 'BACK',     desc: 'full body, rear view' },
  { id: 'quarter_r', label: '3/4 RIGHT',desc: 'full body, three-quarter right view' },
  { id: 'portrait',  label: 'PORTRAIT', desc: 'close-up portrait, head and shoulders' },
];

export default function CharacterSheet({ onGenerate, onSavePersona }) {
  const [ref, setRef]               = useState(null);
  const [name, setName]             = useState('');
  const [desc, setDesc]             = useState('');
  const [styleLock, setStyleLock]   = useState('');
  const [selected, setSelected]     = useState(new Set(POSES.map(p => p.id)));
  const [generated, setGenerated]   = useState({});
  const [isGen, setIsGen]           = useState(false);
  const [currentPose, setCurrent]   = useState(null);
  const fileRef = useRef(null);

  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const generateAll = async () => {
    setIsGen(true);
    for (const pose of POSES.filter(p => selected.has(p.id))) {
      setCurrent(pose.id);
      const prompt = `${name ? name + ', ' : ''}${desc}, ${pose.desc}${styleLock ? ', ' + styleLock : ''}, character sheet style, white background`;
      await onGenerate(prompt, { width: 768, height: 1024 });
      setGenerated(prev => ({ ...prev, [pose.id]: true }));
      await new Promise(r => setTimeout(r, 400));
    }
    setCurrent(null);
    setIsGen(false);
  };

  const loadFile = f => { if (!f) return; const r = new FileReader(); r.onload = ev => setRef(ev.target.result); r.readAsDataURL(f); };

  return (
    <div className="cs-root">
      <div className="cfg">
        <div className="ph">CHARACTER SHEET GENERATOR</div>
        <div className="cfg-body">
          <div className="sl">ANCHOR REFERENCE</div>
          <div className="uz" onClick={() => fileRef.current?.click()}>
            {ref ? <img src={ref} alt="ref" className="rimg" /> : <span className="uh">⊕ Drop anchor image</span>}
            <input ref={fileRef} type="file" accept="image/*" onChange={e => loadFile(e.target.files?.[0])} hidden />
          </div>
          <div className="sl">CHARACTER NAME</div>
          <input className="ei" placeholder="Character designation..." value={name} onChange={e => setName(e.target.value)} />
          <div className="sl">BASE DESCRIPTION</div>
          <textarea className="et" rows={3} placeholder="Physical appearance, costume, key visual traits..." value={desc} onChange={e => setDesc(e.target.value)} />
          <div className="sl">STYLE LOCK</div>
          <input className="ei" placeholder="e.g. cyberpunk noir, cel-shaded, watercolor..." value={styleLock} onChange={e => setStyleLock(e.target.value)} />
          <div className="sl">POSE SELECTION</div>
          <div className="pose-toggles">
            {POSES.map(p => (
              <button key={p.id} className={`pt ${selected.has(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>{p.label}</button>
            ))}
          </div>
          <button className="genbtn" onClick={generateAll} disabled={isGen || (!desc && !ref)}>
            {isGen ? `◈ GENERATING ${currentPose?.toUpperCase()}...` : `▶ GENERATE SHEET (${selected.size} POSES)`}
          </button>
          <button className="savebtn" onClick={() => onSavePersona({ name, desc, style: styleLock, ref, poses: generated })} disabled={Object.keys(generated).length === 0}>
            ◈ SAVE AS PERSONA
          </button>
        </div>
      </div>

      <div className="sheet">
        <div className="ph">CHARACTER SHEET OUTPUT</div>
        <div className="sheet-grid">
          {POSES.map(pose => (
            <motion.div key={pose.id} className={`pc ${!selected.has(pose.id) ? 'off' : ''} ${currentPose === pose.id ? 'gen' : ''} ${generated[pose.id] ? 'done' : ''}`}
              animate={{ opacity: selected.has(pose.id) ? 1 : 0.2 }}>
              <div className="plabel">{pose.label}</div>
              <div className="pframe">
                {currentPose === pose.id
                  ? <div className="gind"><div className="ring" /><span>GENERATING</span></div>
                  : generated[pose.id] ? <div className="pdone">✓ GENERATED</div>
                  : <div className="pempty">PENDING</div>
                }
              </div>
            </motion.div>
          ))}
        </div>
        <div className="legend">CHARACTER: <span className="cyan">{name || '—'}</span>{styleLock && <> · STYLE: <span className="gold">{styleLock}</span></>}</div>
      </div>

      <style jsx>{`
        .cs-root { display:grid; grid-template-columns:320px 1fr; height:100%; overflow:hidden; }
        .cfg { display:flex; flex-direction:column; border-right:1px solid var(--encom-cyan-dim); background:rgba(0,0,0,.4); overflow:hidden; }
        .cfg-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
        .sheet { display:flex; flex-direction:column; overflow:hidden; background:rgba(0,5,5,.4); }
        .ph { padding:10px 16px; font-family:var(--font-display); font-size:10px; letter-spacing:2px; color:var(--encom-gray-light); border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,238,238,.03); flex-shrink:0; }
        .sl { font-family:var(--font-display); font-size:9px; color:var(--encom-gray-light); letter-spacing:2px; }
        .uz { height:80px; border:1px dashed var(--encom-cyan-dim); display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; transition:border-color .2s; }
        .uz:hover { border-color:var(--encom-cyan); }
        .rimg { width:100%; height:100%; object-fit:contain; } .uh { font-family:var(--font-mono); font-size:11px; color:var(--encom-gray-dark); }
        .ei { width:100%; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); color:var(--encom-white); font-family:var(--font-mono); font-size:11px; padding:7px 10px; outline:none; box-sizing:border-box; }
        .ei:focus { border-color:var(--encom-cyan); } .ei::placeholder { color:var(--encom-gray-dark); }
        .et { width:100%; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); color:var(--encom-white); font-family:var(--font-mono); font-size:11px; padding:7px 10px; outline:none; resize:none; box-sizing:border-box; line-height:1.5; }
        .et:focus { border-color:var(--encom-cyan); } .et::placeholder { color:var(--encom-gray-dark); }
        .pose-toggles { display:flex; flex-wrap:wrap; gap:6px; }
        .pt { padding:5px 10px; background:rgba(0,0,0,.3); border:1px solid var(--encom-gray-dark); color:var(--encom-gray-light); font-family:var(--font-display); font-size:9px; letter-spacing:1px; cursor:pointer; transition:all .2s; }
        .pt.on { border-color:var(--encom-cyan-dim); color:var(--encom-cyan); background:rgba(0,238,238,.08); }
        .genbtn { width:100%; padding:11px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan); color:var(--encom-cyan); font-family:var(--font-display); font-size:10px; letter-spacing:2px; cursor:pointer; transition:all .2s; margin-top:4px; }
        .genbtn:hover:not(:disabled) { background:rgba(0,238,238,.18); } .genbtn:disabled { opacity:.4; cursor:not-allowed; }
        .savebtn { width:100%; padding:10px; background:rgba(255,204,0,.07); border:1px solid var(--encom-gold); color:var(--encom-gold); font-family:var(--font-display); font-size:10px; letter-spacing:2px; cursor:pointer; transition:all .2s; }
        .savebtn:hover:not(:disabled) { background:rgba(255,204,0,.14); } .savebtn:disabled { opacity:.3; cursor:not-allowed; }
        .sheet-grid { flex:1; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:16px; overflow-y:auto; align-content:start; }
        .pc { background:rgba(0,0,0,.5); border:1px solid var(--encom-gray-dark); display:flex; flex-direction:column; overflow:hidden; transition:border-color .3s; }
        .pc.gen { border-color:var(--encom-gold); } .pc.done { border-color:var(--encom-cyan-dim); } .pc.off { opacity:.2; }
        .plabel { padding:6px 10px; font-family:var(--font-display); font-size:9px; color:var(--encom-cyan); letter-spacing:1px; border-bottom:1px solid var(--encom-gray-dark); background:rgba(0,238,238,.03); }
        .pframe { flex:1; min-height:100px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.3); }
        .gind { display:flex; flex-direction:column; align-items:center; gap:6px; }
        .ring { width:18px; height:18px; border:2px solid var(--encom-gray-dark); border-top-color:var(--encom-gold); border-radius:50%; animation:spin 1s linear infinite; }
        .gind span { font-family:var(--font-mono); font-size:8px; color:var(--encom-gold); }
        .pdone { font-family:var(--font-mono); font-size:10px; color:var(--encom-cyan); } .pempty { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); }
        .legend { padding:10px 16px; border-top:1px solid var(--encom-cyan-dim); font-family:var(--font-mono); font-size:10px; color:var(--encom-gray-light); flex-shrink:0; }
        .cyan { color:var(--encom-cyan); } .gold { color:var(--encom-gold); }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
