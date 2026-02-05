import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Sparkles, Video, Image,
  Settings, Sliders, Cpu, Cloud, Zap, Film
} from 'lucide-react';

const IMAGE_MODELS = [
  { id: 'flux_schnell', name: 'FLUX.1 Schnell', backend: 'huggingface', speed: 'fast', quality: 'good' },
  { id: 'flux_dev', name: 'FLUX Dev', backend: 'replicate', speed: 'medium', quality: 'excellent' },
  { id: 'flux_dev_lora', name: 'FLUX Dev + LoRA', backend: 'replicate', speed: 'medium', quality: 'excellent' },
  { id: 'sdxl', name: 'SDXL Base', backend: 'huggingface', speed: 'medium', quality: 'good' },
  { id: 'sdxl_lightning', name: 'SDXL Lightning', backend: 'replicate', speed: 'fast', quality: 'good' },
];

const VIDEO_BACKENDS = [
  { id: 'luma', name: 'Luma Dream Machine', icon: Film, color: '#8B5CF6' },
  { id: 'runway', name: 'Runway Gen-3 Alpha', icon: Video, color: '#EC4899' },
  { id: 'kling', name: 'Kling AI', icon: Zap, color: '#F59E0B' },
  { id: 'google_veo', name: 'Google Veo 2', icon: Cloud, color: '#10B981' },
  { id: 'replicate_svd', name: 'Stable Video Diffusion', icon: Cpu, color: '#6366F1' },
];

function Sidebar({
  collapsed,
  onToggle,
  currentPrompt,
  onPromptChange,
  selectedModel,
  onModelChange,
  selectedBackend,
  onBackendChange,
  generationSettings,
  onSettingsChange,
  onGenerate,
  onVideoGenerate,
  isGenerating,
  systemStatus
}) {
  const [activeTab, setActiveTab] = useState('image');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [selectedVideoBackend, setSelectedVideoBackend] = useState('luma');

  const handleSettingChange = (key, value) => {
    onSettingsChange({ ...generationSettings, [key]: value });
  };

  const getBackendStatus = (backendId) => {
    const statusMap = {
      'huggingface': systemStatus.huggingface,
      'replicate': systemStatus.replicate,
      'luma': systemStatus.luma,
      'runway': systemStatus.runway,
      'kling': systemStatus.kling,
      'google_veo': systemStatus.googleVeo
    };
    return statusMap[backendId] || 'offline';
  };

  return (
    <motion.aside
      className={`encom-sidebar ${collapsed ? 'collapsed' : ''}`}
      animate={{ width: collapsed ? 48 : 320 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Toggle Button */}
      <button className="sidebar-toggle" onClick={onToggle}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="sidebar-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Tab Navigation */}
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${activeTab === 'image' ? 'active' : ''}`}
                onClick={() => setActiveTab('image')}
              >
                <Image size={14} />
                <span>IMAGE</span>
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'video' ? 'active' : ''}`}
                onClick={() => setActiveTab('video')}
              >
                <Video size={14} />
                <span>VIDEO</span>
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={14} />
                <span>CONFIG</span>
              </button>
            </div>

            {/* Image Generation Panel */}
            {activeTab === 'image' && (
              <div className="sidebar-panel">
                <div className="panel-section">
                  <label className="section-label">PROMPT</label>
                  <textarea
                    className="encom-input encom-textarea"
                    value={currentPrompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    placeholder="Enter your image prompt..."
                    rows={4}
                  />
                </div>

                <div className="panel-section">
                  <label className="section-label">MODEL</label>
                  <div className="model-grid">
                    {IMAGE_MODELS.map(model => (
                      <button
                        key={model.id}
                        className={`model-card ${selectedModel === model.id ? 'selected' : ''}`}
                        onClick={() => {
                          onModelChange(model.id);
                          onBackendChange(model.backend);
                        }}
                      >
                        <div className="model-name">{model.name}</div>
                        <div className="model-meta">
                          <span className={`status-dot ${getBackendStatus(model.backend)}`} />
                          <span>{model.speed}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel-section">
                  <label className="section-label">
                    <Sliders size={12} />
                    PARAMETERS
                  </label>

                  <div className="param-row">
                    <span>Width</span>
                    <input
                      type="number"
                      className="encom-input param-input"
                      value={generationSettings.width}
                      onChange={(e) => handleSettingChange('width', parseInt(e.target.value))}
                      step={64}
                      min={512}
                      max={2048}
                    />
                  </div>

                  <div className="param-row">
                    <span>Height</span>
                    <input
                      type="number"
                      className="encom-input param-input"
                      value={generationSettings.height}
                      onChange={(e) => handleSettingChange('height', parseInt(e.target.value))}
                      step={64}
                      min={512}
                      max={2048}
                    />
                  </div>

                  <div className="param-row">
                    <span>Steps</span>
                    <input
                      type="range"
                      className="encom-slider"
                      value={generationSettings.steps}
                      onChange={(e) => handleSettingChange('steps', parseInt(e.target.value))}
                      min={1}
                      max={50}
                    />
                    <span className="param-value">{generationSettings.steps}</span>
                  </div>

                  <div className="param-row">
                    <span>Guidance</span>
                    <input
                      type="range"
                      className="encom-slider"
                      value={generationSettings.guidance}
                      onChange={(e) => handleSettingChange('guidance', parseFloat(e.target.value))}
                      min={1}
                      max={20}
                      step={0.5}
                    />
                    <span className="param-value">{generationSettings.guidance}</span>
                  </div>
                </div>

                <button
                  className="encom-btn encom-btn-primary generate-btn"
                  onClick={() => onGenerate()}
                  disabled={isGenerating || !currentPrompt.trim()}
                >
                  {isGenerating ? (
                    <>
                      <div className="encom-spinner small" />
                      GENERATING...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      GENERATE IMAGE
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Video Generation Panel */}
            {activeTab === 'video' && (
              <div className="sidebar-panel">
                <div className="panel-section">
                  <label className="section-label">VIDEO PROMPT</label>
                  <textarea
                    className="encom-input encom-textarea"
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="Describe your video scene..."
                    rows={4}
                  />
                </div>

                <div className="panel-section">
                  <label className="section-label">VIDEO BACKEND</label>
                  <div className="backend-list">
                    {VIDEO_BACKENDS.map(backend => {
                      const Icon = backend.icon;
                      const status = getBackendStatus(backend.id);
                      return (
                        <button
                          key={backend.id}
                          className={`backend-card ${selectedVideoBackend === backend.id ? 'selected' : ''}`}
                          onClick={() => setSelectedVideoBackend(backend.id)}
                          style={{ '--accent-color': backend.color }}
                          disabled={status !== 'online'}
                        >
                          <Icon size={16} style={{ color: backend.color }} />
                          <span className="backend-name">{backend.name}</span>
                          <span className={`status-dot ${status}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  className="encom-btn encom-btn-gold generate-btn"
                  onClick={() => onVideoGenerate({
                    prompt: videoPrompt,
                    backend: selectedVideoBackend
                  })}
                  disabled={isGenerating || !videoPrompt.trim()}
                >
                  {isGenerating ? (
                    <>
                      <div className="encom-spinner small" />
                      GENERATING...
                    </>
                  ) : (
                    <>
                      <Film size={14} />
                      GENERATE VIDEO
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Settings Panel */}
            {activeTab === 'settings' && (
              <div className="sidebar-panel">
                <div className="panel-section">
                  <label className="section-label">SYSTEM STATUS</label>
                  <div className="status-grid">
                    {Object.entries(systemStatus).map(([key, status]) => (
                      <div key={key} className="status-row">
                        <span className="status-name">{key.toUpperCase()}</span>
                        <span className={`status-badge ${status}`}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel-section">
                  <label className="section-label">API ENDPOINT</label>
                  <input
                    type="text"
                    className="encom-input"
                    defaultValue="http://localhost:7860"
                    placeholder="Backend API URL"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .encom-sidebar {
          background: linear-gradient(90deg, rgba(0, 15, 15, 0.95) 0%, rgba(0, 0, 0, 0.9) 100%);
          border-right: 1px solid var(--encom-gray-dark);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          z-index: 50;
        }

        .sidebar-toggle {
          position: absolute;
          top: 50%;
          right: -12px;
          transform: translateY(-50%);
          width: 24px;
          height: 48px;
          background: var(--encom-dark);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 0 4px 4px 0;
          color: var(--encom-cyan);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          transition: all 0.3s ease;
        }

        .sidebar-toggle:hover {
          background: rgba(0, 238, 238, 0.1);
          border-color: var(--encom-cyan);
        }

        .sidebar-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .sidebar-tabs {
          display: flex;
          border-bottom: 1px solid var(--encom-gray-dark);
          padding: 4px;
          gap: 4px;
        }

        .sidebar-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          background: transparent;
          border: none;
          color: var(--encom-gray-light);
          font-family: var(--font-display);
          font-size: 9px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 2px;
        }

        .sidebar-tab:hover {
          color: var(--encom-cyan);
          background: rgba(0, 238, 238, 0.05);
        }

        .sidebar-tab.active {
          color: var(--encom-cyan);
          background: rgba(0, 238, 238, 0.1);
          border: 1px solid var(--encom-cyan-dim);
        }

        .sidebar-panel {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-display);
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 1px;
          color: var(--encom-gold);
          text-transform: uppercase;
        }

        .model-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .model-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .model-card:hover {
          border-color: var(--encom-cyan-dim);
          background: rgba(0, 238, 238, 0.05);
        }

        .model-card.selected {
          border-color: var(--encom-cyan);
          background: rgba(0, 238, 238, 0.1);
          box-shadow: 0 0 10px var(--encom-cyan-glow);
        }

        .model-name {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--encom-white);
        }

        .model-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
          color: var(--encom-gray-light);
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .status-dot.online, .status-dot.checking { background: var(--encom-cyan); }
        .status-dot.offline { background: var(--encom-gray); }
        .status-dot.error { background: #ff4444; }

        .param-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 11px;
          color: var(--encom-gray-light);
        }

        .param-row span:first-child {
          width: 60px;
        }

        .param-input {
          width: 80px;
          padding: 6px 8px;
          font-size: 11px;
        }

        .param-row .encom-slider {
          flex: 1;
        }

        .param-value {
          width: 30px;
          text-align: right;
          color: var(--encom-cyan);
          font-family: var(--font-mono);
        }

        .backend-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .backend-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .backend-card:hover:not(:disabled) {
          border-color: var(--accent-color, var(--encom-cyan));
          background: rgba(0, 238, 238, 0.05);
        }

        .backend-card.selected {
          border-color: var(--accent-color, var(--encom-cyan));
          background: rgba(0, 238, 238, 0.1);
        }

        .backend-card:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .backend-name {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--encom-white);
          text-align: left;
        }

        .generate-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          margin-top: auto;
        }

        .generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .encom-spinner.small {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }

        .status-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }

        .status-name {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--encom-gray-light);
        }

        .status-badge {
          font-family: var(--font-display);
          font-size: 8px;
          padding: 2px 6px;
          border-radius: 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-badge.online {
          background: rgba(0, 238, 238, 0.2);
          color: var(--encom-cyan);
          border: 1px solid var(--encom-cyan-dim);
        }

        .status-badge.offline {
          background: rgba(102, 102, 102, 0.2);
          color: var(--encom-gray);
          border: 1px solid var(--encom-gray-dark);
        }

        .status-badge.checking {
          background: rgba(255, 204, 0, 0.2);
          color: var(--encom-gold);
          border: 1px solid var(--encom-gold-dim);
        }
      `}</style>
    </motion.aside>
  );
}

export default Sidebar;
