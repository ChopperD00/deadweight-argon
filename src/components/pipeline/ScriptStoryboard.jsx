import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function parseScript(text) {
  if (!text.trim()) return [];
  const lines = text.split('\n');
  const scenes = [];
  let current = null;
  let body = [];

  const isHeader = l => /^(INT\.|EXT\.|INT\/EXT\.)/i.test(l.trim()) || /^SCENE\s+\d+/i.test(l.trim());

  lines.forEach(line => {
    const t = line.trim();
    if (isHeader(t)) {
      if (current) scenes.push({ ...current, body: body.join(' ').trim() });
      current = { id: scenes.length + 1, header: t, prompt: t, image: null, status: 'pending' };
      body = [];
    } else if (current && t) {
      body.push(t);
    }
  });
  if (current) scenes.push({ ...current, body: body.join(' ').trim() });

  // Fallback: split on double newlines
  if (scenes.length === 0) {
    return text.split(/\n\n+/).filter(b => b.trim()).map((b, i) => ({
      id: i + 1, header: `SCENE ${i + 1}`, body: b.trim(), prompt: b.trim().slice(0, 200), image: null, status: 'pending',
    }));
  }
  return scenes;
}

export default function ScriptStoryboard({ onGenerate }) {
  const [text, setText]           = useState('');
  const [scenes, setScenes]       = useState([]);
  const [parsed, setParsed]       = useState(false);
  const [genAll, setGenAll]       = useState(false);
  const [activeId, setActiveId]   = useState(null);

  const parse = () => { setScenes(parseScript(text)); setParsed(true); };

  const genScene = async (id) => {
    const s = scenes.find(x => x.id === id);
    if (!s) return;
    setActiveId(id);
    setScenes(p => p.map(x => x.id === id ? { ...x, status: 'generating' } : x));
    await onGenerate(s.prompt || s.body || s.header, { width: 1024, height: 576 });
    setScenes(p => p.map(x => x.id === id ? { ...x, status: 'complete' } : x));
    setActiveId(null);
  };

  const generateAll = async () => {
    setGenAll(true);
    for (const s of scenes) { await genScene(s.id); await new Promise(r => setTimeout(r, 400)); }
    setGenAll(false);
  };

  const setPrompt = (id, v) => setScenes(p => p.map(x => x.id === id ? { ...x, prompt: v } : x));

  return (
    <div className="sb-root">
      <div className="sp">
        <div className="ph">SCRIPT INPUT</div>
        <div className="sp-body">
          <textarea className="sta" placeholder={`Paste screenplay or scene descriptions...\n\nINT. NEON ALLEY - NIGHT\nA figure emerges from the shadows, chrome implants catching light...\n\nEXT. ROOFTOP - DAWN\nThe city below: endless grids of cyan fire...`}
            value={text} onChange={e => setText(e.target.value)} />
          <div className="sp-actions">
            <button className="pbtn" onClick={parse} disabled={!text.trim()}>◈ PARSE SCRIPT</button>
            {parsed && <span className="sc">{scenes.length} SCENES</span>}
          </div>
        </div>
      </div>

      <div className="bp">
        <div className="ph">
          STORYBOARD
          {parsed && scenes.length > 0 &&
            <button className="ga-btn" onClick={generateAll} disabled={genAll}>{genAll ? '◈ GENERATING...' : '▶ GENERATE ALL'}</button>}
        </div>
        <div className="board">
          <AnimatePresence>
            {scenes.map((s, i) => (
              <motion.div key={s.id} className={`sc-card ${s.status}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className="scn">#{s.id.toString().padStart(2, '0')}</div>
                <div className="preview">
                  {s.status === 'generating'
                    ? <div className="pload"><div className="ring" /></div>
                    : s.image ? <img src={s.image} alt={`s${s.id}`} />
                    : <div className="pempty">NO FRAME</div>}
                </div>
                <div className="sh">{s.header}</div>
                <textarea className="sp2" value={s.prompt || s.body || ''} onChange={e => setPrompt(s.id, e.target.value)} rows={2} placeholder="Scene prompt..." />
                <button className="gb" onClick={() => genScene(s.id)} disabled={activeId !== null}>
                  {s.status === 'generating' ? 'GENERATING...' : 'GEN FRAME'}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {!parsed && <div className="be">Parse a script to generate storyboard frames</div>}
        </div>
      </div>

      <style jsx>{`
        .sb-root { display:grid; grid-template-columns:360px 1fr; height:100%; overflow:hidden; }
        .sp { display:flex; flex-direction:column; border-right:1px solid var(--encom-cyan-dim); background:rgba(0,0,0,.4); overflow:hidden; }
        .bp { display:flex; flex-direction:column; background:rgba(0,5,5,.4); overflow:hidden; }
        .ph { padding:10px 16px; font-family:var(--font-display); font-size:10px; letter-spacing:2px; color:var(--encom-gray-light); border-bottom:1px solid var(--encom-cyan-dim); background:rgba(0,238,238,.03); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .sp-body { flex:1; display:flex; flex-direction:column; padding:16px; gap:10px; overflow:hidden; }
        .sta { flex:1; width:100%; background:rgba(0,0,0,.4); border:1px solid var(--encom-cyan-dim); color:var(--encom-white); font-family:var(--font-mono); font-size:11px; line-height:1.6; padding:10px; outline:none; resize:none; box-sizing:border-box; }
        .sta:focus { border-color:var(--encom-cyan); } .sta::placeholder { color:var(--encom-gray-dark); }
        .sp-actions { display:flex; align-items:center; gap:12px; flex-shrink:0; }
        .pbtn { padding:9px 18px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan); color:var(--encom-cyan); font-family:var(--font-display); font-size:10px; letter-spacing:2px; cursor:pointer; transition:all .2s; }
        .pbtn:hover:not(:disabled) { background:rgba(0,238,238,.18); } .pbtn:disabled { opacity:.4; cursor:not-allowed; }
        .sc { font-family:var(--font-mono); font-size:10px; color:var(--encom-gold); }
        .ga-btn { padding:5px 12px; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan-dim); color:var(--encom-cyan); font-family:var(--font-display); font-size:9px; letter-spacing:1px; cursor:pointer; transition:all .2s; }
        .ga-btn:hover:not(:disabled) { border-color:var(--encom-cyan); } .ga-btn:disabled { opacity:.5; cursor:not-allowed; }
        .board { flex:1; overflow-y:auto; padding:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; align-content:start; }
        .be { grid-column:1/-1; display:flex; align-items:center; justify-content:center; min-height:200px; color:var(--encom-gray-dark); font-family:var(--font-mono); font-size:12px; }
        .sc-card { background:rgba(0,0,0,.5); border:1px solid var(--encom-gray-dark); display:flex; flex-direction:column; gap:5px; padding:9px; transition:border-color .2s; }
        .sc-card.generating { border-color:var(--encom-gold); } .sc-card.complete { border-color:var(--encom-cyan-dim); }
        .scn { font-family:var(--font-mono); font-size:9px; color:var(--encom-gold); }
        .preview { width:100%; aspect-ratio:16/9; background:rgba(0,0,0,.6); border:1px solid var(--encom-gray-dark); display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .preview img { width:100%; height:100%; object-fit:cover; }
        .pload { display:flex; align-items:center; justify-content:center; width:100%; height:100%; }
        .ring { width:22px; height:22px; border:2px solid var(--encom-gray-dark); border-top-color:var(--encom-gold); border-radius:50%; animation:spin 1s linear infinite; }
        .pempty { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-dark); }
        .sh { font-family:var(--font-display); font-size:9px; color:var(--encom-cyan); letter-spacing:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sp2 { width:100%; background:rgba(0,0,0,.3); border:1px solid var(--encom-gray-dark); color:var(--encom-white); font-family:var(--font-mono); font-size:9px; padding:4px 6px; resize:none; outline:none; box-sizing:border-box; }
        .sp2:focus { border-color:var(--encom-cyan-dim); } .sp2::placeholder { color:var(--encom-gray-dark); }
        .gb { width:100%; padding:6px; background:rgba(0,238,238,.05); border:1px solid var(--encom-gray-dark); color:var(--encom-gray-light); font-family:var(--font-display); font-size:9px; letter-spacing:1px; cursor:pointer; transition:all .2s; }
        .gb:hover:not(:disabled) { border-color:var(--encom-cyan-dim); color:var(--encom-cyan); } .gb:disabled { opacity:.4; cursor:not-allowed; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
