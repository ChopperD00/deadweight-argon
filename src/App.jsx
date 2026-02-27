import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VisualCanvas from './components/VisualCanvas';
import NodeEditor from './components/NodeEditor';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Header from './components/Header';
import GenerationQueue from './components/GenerationQueue';
import PasswordGate from './components/PasswordGate';
import EncomEngine from './components/EncomEngine';
import PipelineStudio from './components/pipeline/PipelineStudio';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7860';

function App() {
  const [mode, setMode] = useState('canvas');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generations, setGenerations] = useState([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux_schnell');
  const [selectedBackend, setSelectedBackend] = useState('huggingface');
  const [isGenerating, setIsGenerating] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    huggingface: 'checking', replicate: 'checking', luma: 'checking',
    runway: 'checking', kling: 'checking', googleVeo: 'checking'
  });
  const [generationSettings, setGenerationSettings] = useState({ width: 1024, height: 1024, steps: 4, guidance: 3.5, seed: -1 });

  useEffect(() => {
    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemStatus = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/status`);
      if (r.ok) setSystemStatus(await r.json());
    } catch {}
  };

  const handleGenerate = useCallback(async (prompt, options = {}) => {
    if (isGenerating) return;
    setIsGenerating(true);
    const id = Date.now().toString();
    setGenerations(prev => [{ id, prompt: prompt || currentPrompt, status: 'processing', model: selectedModel, backend: selectedBackend, timestamp: new Date().toISOString(), settings: { ...generationSettings, ...options } }, ...prev]);
    try {
      const r = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt || currentPrompt, model: selectedModel, backend: selectedBackend, ...generationSettings, ...options })
      });
      if (r.ok) {
        const data = await r.json();
        setGenerations(prev => prev.map(g => g.id === id ? { ...g, status: 'complete', result: data.image, metadata: data.metadata } : g));
      } else throw new Error('Generation failed');
    } catch (err) {
      setGenerations(prev => prev.map(g => g.id === id ? { ...g, status: 'error', error: err.message } : g));
    } finally { setIsGenerating(false); }
  }, [currentPrompt, selectedModel, selectedBackend, generationSettings, isGenerating]);

  const handleVideoGenerate = useCallback(async (options) => {
    if (isGenerating) return;
    setIsGenerating(true);
    const id = Date.now().toString();
    setGenerations(prev => [{ id, prompt: options.prompt, status: 'processing', type: 'video', backend: options.backend, timestamp: new Date().toISOString() }, ...prev]);
    try {
      const r = await fetch(`${API_BASE_URL}/api/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) });
      if (r.ok) {
        const data = await r.json();
        setGenerations(prev => prev.map(g => g.id === id ? { ...g, status: 'complete', result: data.video, metadata: data.metadata } : g));
      } else throw new Error('Video generation failed');
    } catch (err) {
      setGenerations(prev => prev.map(g => g.id === id ? { ...g, status: 'error', error: err.message } : g));
    } finally { setIsGenerating(false); }
  }, [isGenerating]);

  const isPipeline = mode === 'pipeline';

  return (
    <PasswordGate>
      <EncomEngine opacity={0.65} />
      <div className="encom-app">
        <div className="encom-scanlines" />
        <div className="encom-hud">
          <div className="encom-hud-corner top-left" />
          <div className="encom-hud-corner top-right" />
          <div className="encom-hud-corner bottom-left" />
          <div className="encom-hud-corner bottom-right" />
        </div>

        <Header mode={mode} onModeChange={setMode} systemStatus={systemStatus} />

        <div className="encom-main-layout">
          {/* Sidebar hidden in pipeline mode */}
          {!isPipeline && (
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              currentPrompt={currentPrompt} onPromptChange={setCurrentPrompt}
              selectedModel={selectedModel} onModelChange={setSelectedModel}
              selectedBackend={selectedBackend} onBackendChange={setSelectedBackend}
              generationSettings={generationSettings} onSettingsChange={setGenerationSettings}
              onGenerate={handleGenerate} onVideoGenerate={handleVideoGenerate}
              isGenerating={isGenerating} systemStatus={systemStatus}
            />
          )}

          <main className="encom-content">
            <AnimatePresence mode="wait">
              {mode === 'canvas' && (
                <motion.div key="canvas" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }} style={{ height: '100%' }}>
                  <VisualCanvas generations={generations} onGenerate={handleGenerate} isGenerating={isGenerating} currentPrompt={currentPrompt} onPromptChange={setCurrentPrompt} />
                </motion.div>
              )}
              {mode === 'nodes' && (
                <motion.div key="nodes" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} style={{ height: '100%' }}>
                  <NodeEditor onGenerate={handleGenerate} onVideoGenerate={handleVideoGenerate} generations={generations} systemStatus={systemStatus} />
                </motion.div>
              )}
              {mode === 'pipeline' && (
                <motion.div key="pipeline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} style={{ height: '100%' }}>
                  <PipelineStudio onGenerate={handleGenerate} onVideoGenerate={handleVideoGenerate} generations={generations} systemStatus={systemStatus} />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {!isPipeline && (
            <GenerationQueue
              generations={generations}
              onClear={() => setGenerations([])}
              onRemove={(id) => setGenerations(prev => prev.filter(g => g.id !== id))}
            />
          )}
        </div>

        <StatusBar isGenerating={isGenerating} systemStatus={systemStatus} generationsCount={generations.length} />

        <style jsx>{`
          .encom-app { width:100vw; height:100vh; display:flex; flex-direction:column; position:relative; overflow:hidden; z-index:1; }
          .encom-main-layout { flex:1; display:flex; overflow:hidden; position:relative; }
          .encom-content { flex:1; overflow:hidden; position:relative; }
        `}</style>
      </div>
    </PasswordGate>
  );
}

export default App;
