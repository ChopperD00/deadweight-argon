import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3, Workflow, Film, Zap, Activity } from 'lucide-react';

function Header({ mode, onModeChange, systemStatus }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessionTime, setSessionTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setSessionTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formatSession = (s) => `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor((s%3600)/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const activeBackends = () => Object.values(systemStatus).filter(s => s === 'online').length;

  return (
    <header className="encom-header">
      <div className="header-logo">
        <div className="logo-text">
          <span className="logo-primary">DEADWEIGHT</span>
          <span className="logo-divider">{'//'}</span>
          <span className="logo-secondary">ARGON INTERFACE</span>
        </div>
        <div className="logo-version">PRE-ALPHA v4.5 // INFERIS.APP</div>
      </div>

      <div className="header-mode-toggle">
        {[
          { id: 'canvas',   icon: <Grid3X3 size={14} />, label: 'VISUAL CANVAS' },
          { id: 'nodes',    icon: <Workflow size={14} />, label: 'NODE EDITOR' },
          { id: 'pipeline', icon: <Film size={14} />,     label: 'CREATION PIPELINE' },
        ].map(btn => (
          <motion.button
            key={btn.id}
            className={`mode-btn ${mode === btn.id ? 'active' : ''}`}
            onClick={() => onModeChange(btn.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {btn.icon}
            <span>{btn.label}</span>
            {mode === btn.id && (
              <motion.div
                className="mode-indicator"
                layoutId="modeIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      <div className="header-status">
        <div className="status-item">
          <Activity size={14} className="status-icon pulse" />
          <span className="status-label">BACKENDS</span>
          <span className="status-value">{activeBackends()}/6</span>
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <Zap size={14} className="status-icon" />
          <span className="status-label">SESSION</span>
          <span className="status-value mono">{formatSession(sessionTime)}</span>
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <span className="status-label">UTC</span>
          <span className="status-value mono">{formatTime(currentTime)}</span>
        </div>
      </div>

      <style jsx>{`
        .encom-header { height:56px; background:linear-gradient(180deg,rgba(0,20,20,.95) 0%,rgba(0,0,0,.9) 100%); border-bottom:1px solid var(--encom-cyan-dim); display:flex; align-items:center; justify-content:space-between; padding:0 20px; position:relative; z-index:100; }
        .encom-header::after { content:''; position:absolute; bottom:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,var(--encom-cyan),transparent); }
        .header-logo { display:flex; flex-direction:column; gap:2px; }
        .logo-text { display:flex; align-items:center; gap:8px; font-family:var(--font-display); font-size:14px; font-weight:700; letter-spacing:2px; }
        .logo-primary { color:var(--encom-cyan); text-shadow:0 0 10px var(--encom-cyan-glow); }
        .logo-divider { color:var(--encom-gold); }
        .logo-secondary { color:var(--encom-white); font-weight:400; }
        .logo-version { font-family:var(--font-mono); font-size:9px; color:var(--encom-gray-light); letter-spacing:1px; }
        .header-mode-toggle { display:flex; gap:4px; background:rgba(0,0,0,.4); padding:4px; border-radius:4px; border:1px solid var(--encom-gray-dark); }
        .mode-btn { display:flex; align-items:center; gap:8px; padding:7px 14px; background:transparent; border:none; color:var(--encom-gray-light); font-family:var(--font-display); font-size:10px; font-weight:500; letter-spacing:1px; cursor:pointer; position:relative; transition:color .3s; }
        .mode-btn:hover { color:var(--encom-cyan); }
        .mode-btn.active { color:var(--encom-cyan); }
        .mode-indicator { position:absolute; inset:0; background:rgba(0,238,238,.1); border:1px solid var(--encom-cyan-dim); border-radius:2px; z-index:-1; }
        .header-status { display:flex; align-items:center; gap:16px; }
        .status-item { display:flex; align-items:center; gap:8px; }
        .status-icon { color:var(--encom-cyan); }
        .status-icon.pulse { animation:pulse-glow 2s ease-in-out infinite; }
        .status-label { font-family:var(--font-display); font-size:9px; color:var(--encom-gray-light); letter-spacing:1px; }
        .status-value { font-family:var(--font-display); font-size:12px; color:var(--encom-cyan); font-weight:500; }
        .status-value.mono { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
        .status-divider { width:1px; height:24px; background:var(--encom-gray-dark); }
        @keyframes pulse-glow { 0%,100% { opacity:.7; } 50% { opacity:1; } }
      `}</style>
    </header>
  );
}

export default Header;
