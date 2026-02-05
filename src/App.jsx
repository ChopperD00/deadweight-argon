import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VisualCanvas from './components/VisualCanvas';
import NodeEditor from './components/NodeEditor';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Header from './components/Header';
import GenerationQueue from './components/GenerationQueue';
import PasswordGate from './components/PasswordGate';

// DEADWEIGHT API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7860';

function App() {
  const [mode, setMode] = useState('canvas'); // 'canvas' or 'nodes'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generations, setGenerations] = useState([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('flux_schnell');
  const [selectedBackend, setSelectedBackend] = useState('huggingface');
  const [isGenerating, setIsGenerating] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    huggingface: 'checking',
    replicate: 'checking',
    luma: 'checking',
    runway: 'checking',
    kling: 'checking',
    googleVeo: 'checking'
  });
  const [generationSettings, setGenerationSettings] = useState({
    width: 1024,
    height: 1024,
    steps: 4,
    guidance: 3.5,
    seed: -1
  });

  // Check API status on mount
  useEffect(() => {
    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data);
      }
    } catch (error) {
      console.error('Failed to check system status:', error);
    }
  };

  const handleGenerate = useCallback(async (prompt, options = {}) => {
    if (isGenerating) return;

    setIsGenerating(true);
    const generationId = Date.now().toString();

    const newGeneration = {
      id: generationId,
      prompt: prompt || currentPrompt,
      status: 'processing',
      model: selectedModel,
      backend: selectedBackend,
      timestamp: new Date().toISOString(),
      settings: { ...generationSettings, ...options }
    };

    setGenerations(prev => [newGeneration, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt || currentPrompt,
          model: selectedModel,
          backend: selectedBackend,
          ...generationSettings,
          ...options
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGenerations(prev => prev.map(g =>
          g.id === generationId
            ? { ...g, status: 'complete', result: data.image, metadata: data.metadata }
            : g
        ));
      } else {
        throw new Error('Generation failed');
      }
    } catch (error) {
      console.error('Generation error:', error);
      setGenerations(prev => prev.map(g =>
        g.id === generationId
          ? { ...g, status: 'error', error: error.message }
          : g
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [currentPrompt, selectedModel, selectedBackend, generationSettings, isGenerating]);

  const handleVideoGenerate = useCallback(async (options) => {
    if (isGenerating) return;

    setIsGenerating(true);
    const generationId = Date.now().toString();

    const newGeneration = {
      id: generationId,
      prompt: options.prompt,
      status: 'processing',
      type: 'video',
      backend: options.backend,
      timestamp: new Date().toISOString()
    };

    setGenerations(prev => [newGeneration, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });

      if (response.ok) {
        const data = await response.json();
        setGenerations(prev => prev.map(g =>
          g.id === generationId
            ? { ...g, status: 'complete', result: data.video, metadata: data.metadata }
            : g
        ));
      } else {
        throw new Error('Video generation failed');
      }
    } catch (error) {
      setGenerations(prev => prev.map(g =>
        g.id === generationId
          ? { ...g, status: 'error', error: error.message }
          : g
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  return (
    <PasswordGate>
      <div className="encom-app">
        {/* Background Effects */}
        <div className="encom-grid-bg" />
        <div className="encom-scanlines" />

        {/* HUD Corners */}
        <div className="encom-hud">
          <div className="encom-hud-corner top-left" />
          <div className="encom-hud-corner top-right" />
          <div className="encom-hud-corner bottom-left" />
          <div className="encom-hud-corner bottom-right" />
        </div>

        {/* Header */}
        <Header
          mode={mode}
          onModeChange={setMode}
          systemStatus={systemStatus}
        />

        {/* Main Layout */}
        <div className="encom-main-layout">
          {/* Sidebar */}
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            currentPrompt={currentPrompt}
            onPromptChange={setCurrentPrompt}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            selectedBackend={selectedBackend}
            onBackendChange={setSelectedBackend}
            generationSettings={generationSettings}
            onSettingsChange={setGenerationSettings}
            onGenerate={handleGenerate}
            onVideoGenerate={handleVideoGenerate}
            isGenerating={isGenerating}
            systemStatus={systemStatus}
          />

          {/* Main Content Area */}
          <main className="encom-content">
            <AnimatePresence mode="wait">
              {mode === 'canvas' ? (
                <motion.div
                  key="canvas"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  style={{ height: '100%' }}
                >
                  <VisualCanvas
                    generations={generations}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    currentPrompt={currentPrompt}
                    onPromptChange={setCurrentPrompt}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="nodes"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  style={{ height: '100%' }}
                >
                  <NodeEditor
                    onGenerate={handleGenerate}
                    onVideoGenerate={handleVideoGenerate}
                    generations={generations}
                    systemStatus={systemStatus}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Generation Queue */}
          <GenerationQueue
            generations={generations}
            onClear={() => setGenerations([])}
            onRemove={(id) => setGenerations(prev => prev.filter(g => g.id !== id))}
          />
        </div>

        {/* Status Bar */}
        <StatusBar
          isGenerating={isGenerating}
          systemStatus={systemStatus}
          generationsCount={generations.length}
        />

        <style jsx>{`
          .encom-app {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
          }

          .encom-main-layout {
            flex: 1;
            display: flex;
            overflow: hidden;
            position: relative;
          }

          .encom-content {
            flex: 1;
            overflow: hidden;
            position: relative;
          }
        `}</style>
      </div>
    </PasswordGate>
  );
}

export default App;
