import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from 'reactflow';
import { motion } from 'framer-motion';
import {
  Play, Save, Download, Trash2,
  Image, Video, Type, Cpu, Layers, GitBranch
} from 'lucide-react';
import 'reactflow/dist/style.css';

// Custom Node Components
const PromptNode = ({ data, selected }) => (
  <div className={`encom-node prompt-node ${selected ? 'selected' : ''}`}>
    <div className="node-header">
      <Type size={12} />
      <span>PROMPT INPUT</span>
    </div>
    <div className="node-body">
      <textarea
        className="node-textarea"
        value={data.prompt || ''}
        onChange={(e) => data.onChange?.(e.target.value)}
        placeholder="Enter prompt..."
        rows={3}
      />
    </div>
    <div className="node-outputs">
      <div className="node-port output" data-handleid="prompt">
        <span>PROMPT</span>
        <div className="port-dot" />
      </div>
    </div>
  </div>
);

const ImageGenerateNode = ({ data, selected }) => (
  <div className={`encom-node generate-node ${selected ? 'selected' : ''}`}>
    <div className="node-header">
      <Image size={12} />
      <span>IMAGE GENERATE</span>
    </div>
    <div className="node-body">
      <div className="node-select-group">
        <label>Model</label>
        <select
          className="node-select"
          value={data.model || 'flux_schnell'}
          onChange={(e) => data.onModelChange?.(e.target.value)}
        >
          <option value="flux_schnell">FLUX Schnell</option>
          <option value="flux_dev">FLUX Dev</option>
          <option value="sdxl">SDXL</option>
        </select>
      </div>
      <div className="node-params">
        <div className="param">
          <span>W</span>
          <input type="number" value={data.width || 1024} readOnly />
        </div>
        <div className="param">
          <span>H</span>
          <input type="number" value={data.height || 1024} readOnly />
        </div>
      </div>
    </div>
    <div className="node-inputs">
      <div className="node-port input">
        <div className="port-dot" />
        <span>PROMPT</span>
      </div>
    </div>
    <div className="node-outputs">
      <div className="node-port output">
        <span>IMAGE</span>
        <div className="port-dot" />
      </div>
    </div>
  </div>
);

const VideoGenerateNode = ({ data, selected }) => (
  <div className={`encom-node video-node ${selected ? 'selected' : ''}`}>
    <div className="node-header gold">
      <Video size={12} />
      <span>VIDEO GENERATE</span>
    </div>
    <div className="node-body">
      <div className="node-select-group">
        <label>Backend</label>
        <select
          className="node-select"
          value={data.backend || 'luma'}
          onChange={(e) => data.onBackendChange?.(e.target.value)}
        >
          <option value="luma">Luma Dream Machine</option>
          <option value="runway">Runway Gen-3</option>
          <option value="kling">Kling AI</option>
          <option value="google_veo">Google Veo 2</option>
        </select>
      </div>
      <div className="node-params">
        <div className="param">
          <span>Duration</span>
          <input type="number" value={data.duration || 5} readOnly />
        </div>
      </div>
    </div>
    <div className="node-inputs">
      <div className="node-port input">
        <div className="port-dot" />
        <span>PROMPT</span>
      </div>
      <div className="node-port input optional">
        <div className="port-dot" />
        <span>IMAGE (opt)</span>
      </div>
    </div>
    <div className="node-outputs">
      <div className="node-port output">
        <span>VIDEO</span>
        <div className="port-dot gold" />
      </div>
    </div>
  </div>
);

const OutputNode = ({ data, selected }) => (
  <div className={`encom-node output-node ${selected ? 'selected' : ''}`}>
    <div className="node-header cyan">
      <Layers size={12} />
      <span>OUTPUT</span>
    </div>
    <div className="node-body">
      {data.result ? (
        <div className="output-preview">
          {data.type === 'image' ? (
            <img src={data.result} alt="Output" />
          ) : (
            <video src={data.result} controls />
          )}
        </div>
      ) : (
        <div className="output-placeholder">
          <span>Awaiting output...</span>
        </div>
      )}
    </div>
    <div className="node-inputs">
      <div className="node-port input">
        <div className="port-dot" />
        <span>INPUT</span>
      </div>
    </div>
  </div>
);

const ModelRecommenderNode = ({ data, selected }) => (
  <div className={`encom-node recommender-node ${selected ? 'selected' : ''}`}>
    <div className="node-header orange">
      <Cpu size={12} />
      <span>MODEL RECOMMENDER</span>
    </div>
    <div className="node-body">
      <div className="node-select-group">
        <label>Quality Tier</label>
        <select className="node-select" value={data.tier || 'standard'}>
          <option value="fast">Fast</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
      </div>
      {data.recommendation && (
        <div className="recommendation-output">
          <span className="rec-label">Recommended:</span>
          <span className="rec-value">{data.recommendation}</span>
        </div>
      )}
    </div>
    <div className="node-inputs">
      <div className="node-port input">
        <div className="port-dot" />
        <span>PROMPT</span>
      </div>
    </div>
    <div className="node-outputs">
      <div className="node-port output">
        <span>MODEL</span>
        <div className="port-dot orange" />
      </div>
      <div className="node-port output">
        <span>SETTINGS</span>
        <div className="port-dot orange" />
      </div>
    </div>
  </div>
);

const nodeTypes = {
  prompt: PromptNode,
  imageGenerate: ImageGenerateNode,
  videoGenerate: VideoGenerateNode,
  output: OutputNode,
  modelRecommender: ModelRecommenderNode,
};

const NODE_TEMPLATES = [
  { type: 'prompt', label: 'Prompt', icon: Type, color: '#00EEEE' },
  { type: 'imageGenerate', label: 'Image Gen', icon: Image, color: '#00EEEE' },
  { type: 'videoGenerate', label: 'Video Gen', icon: Video, color: '#FFCC00' },
  { type: 'modelRecommender', label: 'Recommender', icon: Cpu, color: '#FF9933' },
  { type: 'output', label: 'Output', icon: Layers, color: '#00EEEE' },
];

const initialNodes = [
  {
    id: 'prompt-1',
    type: 'prompt',
    position: { x: 100, y: 200 },
    data: { prompt: '' },
  },
  {
    id: 'generate-1',
    type: 'imageGenerate',
    position: { x: 450, y: 180 },
    data: { model: 'flux_schnell', width: 1024, height: 1024 },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 800, y: 200 },
    data: { result: null, type: 'image' },
  },
];

const initialEdges = [
  {
    id: 'e1',
    source: 'prompt-1',
    target: 'generate-1',
    sourceHandle: 'prompt',
    targetHandle: 'prompt',
    animated: true,
    style: { stroke: '#00EEEE' },
  },
  {
    id: 'e2',
    source: 'generate-1',
    target: 'output-1',
    sourceHandle: 'image',
    targetHandle: 'input',
    animated: true,
    style: { stroke: '#00EEEE' },
  },
];

function NodeEditor({ onGenerate, onVideoGenerate, generations, systemStatus }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isExecuting, setIsExecuting] = useState(false);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: '#00EEEE' }
    }, eds)),
    [setEdges]
  );

  const addNode = useCallback((type) => {
    const id = `${type}-${Date.now()}`;
    const newNode = {
      id,
      type,
      position: { x: Math.random() * 400 + 200, y: Math.random() * 300 + 100 },
      data: type === 'prompt' ? { prompt: '' } :
            type === 'imageGenerate' ? { model: 'flux_schnell', width: 1024, height: 1024 } :
            type === 'videoGenerate' ? { backend: 'luma', duration: 5 } :
            type === 'modelRecommender' ? { tier: 'standard' } :
            { result: null },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const executeWorkflow = useCallback(async () => {
    setIsExecuting(true);

    // Find generate nodes and execute their workflows
    const generateNodes = nodes.filter(n => n.type === 'imageGenerate' || n.type === 'videoGenerate');

    for (const genNode of generateNodes) {
      // Find connected prompt
      const connectedEdge = edges.find(e => e.target === genNode.id);
      if (connectedEdge) {
        const promptNode = nodes.find(n => n.id === connectedEdge.source);
        if (promptNode && promptNode.data.prompt) {
          if (genNode.type === 'imageGenerate') {
            await onGenerate(promptNode.data.prompt, {
              model: genNode.data.model,
              width: genNode.data.width,
              height: genNode.data.height
            });
          } else if (genNode.type === 'videoGenerate') {
            await onVideoGenerate({
              prompt: promptNode.data.prompt,
              backend: genNode.data.backend
            });
          }
        }
      }
    }

    setIsExecuting(false);
  }, [nodes, edges, onGenerate, onVideoGenerate]);

  const clearWorkflow = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [setNodes, setEdges]);

  return (
    <div className="node-editor-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
      >
        <Background
          variant="dots"
          gap={20}
          size={1}
          color="#333"
        />
        <Controls
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #333',
            borderRadius: '4px',
          }}
        />
        <MiniMap
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #333',
          }}
          nodeColor={(node) => {
            if (node.type === 'prompt') return '#00EEEE';
            if (node.type === 'videoGenerate') return '#FFCC00';
            if (node.type === 'modelRecommender') return '#FF9933';
            return '#00EEEE';
          }}
        />

        {/* Node Palette */}
        <Panel position="top-left" className="node-palette">
          <div className="palette-header">
            <GitBranch size={14} />
            <span>NODE PALETTE</span>
          </div>
          <div className="palette-nodes">
            {NODE_TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.type}
                  className="palette-node"
                  onClick={() => addNode(template.type)}
                  style={{ '--node-color': template.color }}
                >
                  <Icon size={14} />
                  <span>{template.label}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Workflow Controls */}
        <Panel position="top-right" className="workflow-controls">
          <motion.button
            className="control-btn primary"
            onClick={executeWorkflow}
            disabled={isExecuting}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isExecuting ? (
              <div className="encom-spinner small" />
            ) : (
              <Play size={16} />
            )}
            <span>{isExecuting ? 'EXECUTING...' : 'EXECUTE'}</span>
          </motion.button>
          <button className="control-btn" onClick={clearWorkflow}>
            <Trash2 size={14} />
          </button>
          <button className="control-btn">
            <Save size={14} />
          </button>
          <button className="control-btn">
            <Download size={14} />
          </button>
        </Panel>
      </ReactFlow>

      <style jsx global>{`
        .node-editor-container {
          height: 100%;
          width: 100%;
        }

        .react-flow__node {
          border-radius: 4px;
        }

        .react-flow__edge-path {
          stroke-width: 2;
        }

        .react-flow__handle {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--encom-black);
          border: 2px solid var(--encom-cyan);
        }

        .react-flow__handle-left {
          left: -6px;
        }

        .react-flow__handle-right {
          right: -6px;
        }

        /* Custom Node Styles */
        .encom-node {
          background: rgba(0, 10, 10, 0.95);
          border: 1px solid var(--encom-cyan-dim);
          border-radius: 4px;
          min-width: 200px;
          font-family: var(--font-mono);
          transition: all 0.3s ease;
        }

        .encom-node.selected {
          border-color: var(--encom-cyan);
          box-shadow: 0 0 20px var(--encom-cyan-glow);
        }

        .node-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(0, 238, 238, 0.1);
          border-bottom: 1px solid var(--encom-gray-dark);
          font-family: var(--font-display);
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 1px;
          color: var(--encom-cyan);
        }

        .node-header.gold {
          background: rgba(255, 204, 0, 0.1);
          color: var(--encom-gold);
        }

        .node-header.orange {
          background: rgba(255, 153, 51, 0.1);
          color: var(--encom-orange);
        }

        .node-header.cyan {
          background: rgba(0, 238, 238, 0.15);
          color: var(--encom-cyan);
        }

        .node-body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .node-textarea {
          width: 100%;
          min-height: 60px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 2px;
          color: var(--encom-white);
          font-family: var(--font-mono);
          font-size: 11px;
          resize: vertical;
          outline: none;
        }

        .node-textarea:focus {
          border-color: var(--encom-cyan);
        }

        .node-select-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .node-select-group label {
          font-size: 8px;
          color: var(--encom-gray-light);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .node-select {
          padding: 6px 8px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 2px;
          color: var(--encom-white);
          font-family: var(--font-mono);
          font-size: 10px;
          outline: none;
          cursor: pointer;
        }

        .node-params {
          display: flex;
          gap: 8px;
        }

        .node-params .param {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: var(--encom-gray-light);
        }

        .node-params .param input {
          width: 50px;
          padding: 4px 6px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 2px;
          color: var(--encom-cyan);
          font-family: var(--font-mono);
          font-size: 10px;
          text-align: center;
        }

        .node-inputs, .node-outputs {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .node-inputs {
          border-top: 1px solid var(--encom-gray-dark);
        }

        .node-port {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 9px;
          color: var(--encom-gray-light);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .node-port.input {
          justify-content: flex-start;
        }

        .node-port.output {
          justify-content: flex-end;
        }

        .node-port.optional {
          opacity: 0.6;
        }

        .port-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--encom-cyan);
          box-shadow: 0 0 6px var(--encom-cyan);
        }

        .port-dot.gold {
          background: var(--encom-gold);
          box-shadow: 0 0 6px var(--encom-gold);
        }

        .port-dot.orange {
          background: var(--encom-orange);
          box-shadow: 0 0 6px var(--encom-orange);
        }

        .output-preview {
          width: 100%;
          aspect-ratio: 1;
          background: #111;
          border-radius: 2px;
          overflow: hidden;
        }

        .output-preview img, .output-preview video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .output-placeholder {
          width: 100%;
          aspect-ratio: 1;
          background: rgba(0, 0, 0, 0.5);
          border: 1px dashed var(--encom-gray-dark);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--encom-gray);
        }

        .recommendation-output {
          padding: 8px;
          background: rgba(255, 153, 51, 0.1);
          border-radius: 2px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rec-label {
          font-size: 8px;
          color: var(--encom-gray-light);
          text-transform: uppercase;
        }

        .rec-value {
          font-size: 11px;
          color: var(--encom-orange);
        }

        /* Panels */
        .node-palette {
          background: rgba(0, 10, 10, 0.95);
          border: 1px solid var(--encom-cyan-dim);
          border-radius: 4px;
          padding: 0;
          overflow: hidden;
        }

        .palette-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(0, 238, 238, 0.1);
          border-bottom: 1px solid var(--encom-gray-dark);
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1px;
          color: var(--encom-cyan);
        }

        .palette-nodes {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .palette-node {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: transparent;
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          color: var(--node-color, var(--encom-cyan));
          font-family: var(--font-display);
          font-size: 9px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .palette-node:hover {
          background: rgba(0, 238, 238, 0.1);
          border-color: var(--node-color, var(--encom-cyan));
        }

        .workflow-controls {
          display: flex;
          gap: 8px;
        }

        .control-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(0, 10, 10, 0.95);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          color: var(--encom-gray-light);
          font-family: var(--font-display);
          font-size: 10px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .control-btn:hover {
          border-color: var(--encom-cyan);
          color: var(--encom-cyan);
        }

        .control-btn.primary {
          background: rgba(0, 238, 238, 0.15);
          border-color: var(--encom-cyan);
          color: var(--encom-cyan);
        }

        .control-btn.primary:hover {
          background: rgba(0, 238, 238, 0.25);
          box-shadow: 0 0 15px var(--encom-cyan-glow);
        }

        .control-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .encom-spinner.small {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }
      `}</style>
    </div>
  );
}

export default NodeEditor;
