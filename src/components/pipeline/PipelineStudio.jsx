import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CharacterPipeline from './CharacterPipeline';
import ScriptStoryboard from './ScriptStoryboard';
import CharacterSheet from './CharacterSheet';
import VideoEditor from './VideoEditor';

const SUB_TABS = [
  { id: 'character', label: 'CHARACTER PIPELINE', icon: '◈' },
  { id: 'charsheet', label: 'CHAR SHEET', icon: '◧' },
  { id: 'storyboard', label: 'SCRIPT → BOARD', icon: '◫' },
  { id: 'video', label: 'VIDEO EDITOR', icon: '▶' },
];

export default function PipelineStudio({ onGenerate, onVideoGenerate, generations, systemStatus }) {
  const [activeTab, setActiveTab] = useState('character');
  const [personas, setPersonas] = useState([]);

  const savePersona = (persona) => setPersonas(prev => [...prev, { ...persona, id: Date.now() }]);

  return (
    <div className="pipeline-studio">
      <div className="pipeline-nav">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            className={`pipeline-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div className="pipeline-nav-info">
          PERSONAS SAVED: <span className="gold">{personas.length}</span>
        </div>
      </div>

      <div className="pipeline-content">
        <AnimatePresence mode="wait">
          {activeTab === 'character' && (
            <motion.div key="character" className="tab-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CharacterPipeline onGenerate={onGenerate} onVideoGenerate={onVideoGenerate} onSavePersona={savePersona} />
            </motion.div>
          )}
          {activeTab === 'charsheet' && (
            <motion.div key="charsheet" className="tab-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CharacterSheet onGenerate={onGenerate} onSavePersona={savePersona} />
            </motion.div>
          )}
          {activeTab === 'storyboard' && (
            <motion.div key="storyboard" className="tab-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ScriptStoryboard onGenerate={onGenerate} />
            </motion.div>
          )}
          {activeTab === 'video' && (
            <motion.div key="video" className="tab-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <VideoEditor onVideoGenerate={onVideoGenerate} generations={generations} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx>{`
        .pipeline-studio {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: rgba(0, 5, 5, 0.8);
        }
        .pipeline-nav {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.5);
          border-bottom: 1px solid var(--encom-cyan-dim);
          flex-shrink: 0;
        }
        .pipeline-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--encom-gray-light);
          font-family: var(--font-display);
          font-size: 10px;
          letter-spacing: 1.5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pipeline-tab:hover { color: var(--encom-cyan); border-color: var(--encom-cyan-dim); }
        .pipeline-tab.active {
          color: var(--encom-cyan);
          background: rgba(0, 238, 238, 0.08);
          border-color: var(--encom-cyan);
          border-bottom-color: transparent;
        }
        .tab-icon { font-size: 12px; }
        .pipeline-nav-info {
          margin-left: auto;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--encom-gray-light);
          letter-spacing: 1px;
        }
        .gold { color: var(--encom-gold); }
        .pipeline-content { flex: 1; overflow-y: auto; overflow-x: hidden; }
        .tab-panel { height: 100%; }
      `}</style>
    </div>
  );
}
