import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Image, Sparkles, ZoomIn, ZoomOut,
  Download, Trash2, Copy, RefreshCw, Maximize2, X, HelpCircle
} from 'lucide-react';

function VisualCanvas({
  generations,
  onGenerate,
  isGenerating,
  currentPrompt,
  onPromptChange
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageUpload(files[0]);
    }
  }, []);

  const handleImageUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage({
        src: e.target.result,
        name: file.name,
        size: file.size
      });
      setShowGuide(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
    }
  };

  const handleZoom = (delta) => {
    setZoom(prev => Math.max(0.25, Math.min(4, prev + delta)));
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.altKey) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const completedGenerations = generations.filter(g => g.status === 'complete');
  const canvasIsEmpty = completedGenerations.length === 0 && !uploadedImage && !isGenerating;

  return (
    <div className="visual-canvas-container">
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
            data-tooltip="Upload Image"
          >
            <Upload size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => handleZoom(0.25)}
            data-tooltip="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            className="toolbar-btn"
            onClick={() => handleZoom(-0.25)}
            data-tooltip="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="toolbar-btn"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            data-tooltip="Reset View"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <span className="generation-count">
            {completedGenerations.length} GENERATIONS
          </span>
        </div>

        {/* Re-open Guide Button (shows when guide is dismissed) */}
        {!showGuide && canvasIsEmpty && (
          <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
            <button
              className="toolbar-btn guide-reopen"
              onClick={() => setShowGuide(true)}
              data-tooltip="Show Guide"
            >
              <HelpCircle size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Canvas Area */}
      <div
        ref={canvasRef}
        className={`canvas-area ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid Pattern */}
        <div
          className="canvas-grid"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            backgroundSize: `${50 * zoom}px ${50 * zoom}px`
          }}
        />

        {/* Generated Images */}
        <div
          className="canvas-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            pointerEvents: canvasIsEmpty ? 'none' : 'auto'
          }}
        >
          {/* Uploaded Image */}
          {uploadedImage && (
            <motion.div
              className="canvas-image uploaded"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ left: 100, top: 100 }}
            >
              <img src={uploadedImage.src} alt={uploadedImage.name} />
              <div className="image-actions">
                <button
                  className="action-btn"
                  onClick={() => setUploadedImage(null)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="image-label">
                UPLOADED: {uploadedImage.name}
              </div>
            </motion.div>
          )}

          {/* Generated Images Grid */}
          {completedGenerations.map((gen, index) => (
            <motion.div
              key={gen.id}
              className={`canvas-image generated ${selectedImage === gen.id ? 'selected' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              style={{
                left: 100 + (index % 3) * 320,
                top: 100 + Math.floor(index / 3) * 320
              }}
              onClick={() => setSelectedImage(gen.id)}
            >
              <img
                src={gen.result}
                alt={gen.prompt}
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23111" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="%23666" font-size="10">Error</text></svg>';
                }}
              />
              <div className="image-actions">
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = document.createElement('a');
                    link.href = gen.result;
                    link.download = `generation-${gen.id}.png`;
                    link.click();
                  }}
                >
                  <Download size={14} />
                </button>
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPromptChange(gen.prompt);
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPromptChange(gen.prompt);
                    onGenerate(gen.prompt);
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="image-label">
                {gen.model.toUpperCase()} {'// '}{gen.prompt.slice(0, 40)}...
              </div>
            </motion.div>
          ))}

          {/* Processing Indicator */}
          {isGenerating && (
            <motion.div
              className="canvas-image processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                left: 100 + (completedGenerations.length % 3) * 320,
                top: 100 + Math.floor(completedGenerations.length / 3) * 320
              }}
            >
              <div className="processing-content">
                <div className="encom-spinner" />
                <span>GENERATING...</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Guide Popup (floating gold card) */}
        <AnimatePresence>
          {showGuide && canvasIsEmpty && (
            <div className="guide-overlay">
              <motion.div
                className="guide-popup"
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="guide-glow-bar" />

                <button
                  className="guide-close"
                  onClick={() => setShowGuide(false)}
                >
                  <X size={14} />
                </button>

                <div className="guide-header">
                  <span className="guide-slash">{'//'}</span>
                  WORKSPACE GUIDE
                </div>

                <div className="guide-body">
                  <div className="guide-icon">
                    <Image size={36} />
                  </div>

                  <h3 className="guide-title">VISUAL WORKSPACE</h3>
                  <p className="guide-desc">
                    Drop an image onto the canvas, upload a file, or use the
                    sidebar to generate with AI models.
                  </p>

                  <div className="guide-actions">
                    <button
                      className="guide-btn"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={14} />
                      UPLOAD IMAGE
                    </button>
                  </div>

                  <div className="guide-hints">
                    <div className="guide-hint">
                      <span className="hint-key">ALT + DRAG</span>
                      <span className="hint-desc">Pan canvas</span>
                    </div>
                    <div className="guide-hint">
                      <span className="hint-key">TOOLBAR +/-</span>
                      <span className="hint-desc">Zoom in/out</span>
                    </div>
                    <div className="guide-hint">
                      <span className="hint-key">PROMPT BAR</span>
                      <span className="hint-desc">Quick generate below</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Quick Prompt Bar */}
        <div className="quick-prompt-bar">
          <input
            type="text"
            className="quick-prompt-input"
            value={currentPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Quick generate: describe your image..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && currentPrompt.trim()) {
                onGenerate();
              }
            }}
          />
          <button
            className="quick-generate-btn"
            onClick={() => onGenerate()}
            disabled={isGenerating || !currentPrompt.trim()}
          >
            {isGenerating ? (
              <RefreshCw size={16} className="spinning" />
            ) : (
              <Sparkles size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Image Detail Panel */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            className="image-detail-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            {(() => {
              const gen = generations.find(g => g.id === selectedImage);
              if (!gen) return null;
              return (
                <>
                  <div className="detail-header">
                    <span>GENERATION DETAILS</span>
                    <button onClick={() => setSelectedImage(null)}>×</button>
                  </div>
                  <div className="detail-content">
                    <div className="detail-row">
                      <span className="detail-label">MODEL</span>
                      <span className="detail-value">{gen.model}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">BACKEND</span>
                      <span className="detail-value">{gen.backend}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">PROMPT</span>
                      <span className="detail-value prompt">{gen.prompt}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">SIZE</span>
                      <span className="detail-value">
                        {gen.settings?.width}×{gen.settings?.height}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">TIMESTAMP</span>
                      <span className="detail-value">
                        {new Date(gen.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .visual-canvas-container {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: radial-gradient(ellipse at center, rgba(0, 30, 30, 0.4) 0%, var(--encom-black) 70%);
          position: relative;
        }

        .canvas-toolbar {
          height: 44px;
          background: rgba(0, 0, 0, 0.8);
          border-bottom: 1px solid var(--encom-gray-dark);
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 12px;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .toolbar-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          color: var(--encom-gray-light);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .toolbar-btn:hover {
          color: var(--encom-cyan);
          border-color: var(--encom-cyan-dim);
          background: rgba(0, 238, 238, 0.1);
        }

        .toolbar-btn.guide-reopen {
          color: var(--encom-gold-dim);
          border-color: var(--encom-gold-dim);
        }

        .toolbar-btn.guide-reopen:hover {
          color: var(--encom-gold);
          border-color: var(--encom-gold);
          background: rgba(255, 204, 0, 0.1);
        }

        .zoom-level {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--encom-cyan);
          min-width: 50px;
          text-align: center;
        }

        .toolbar-divider {
          width: 1px;
          height: 24px;
          background: var(--encom-gray-dark);
        }

        .generation-count {
          font-family: var(--font-display);
          font-size: 10px;
          color: var(--encom-gray-light);
          letter-spacing: 1px;
        }

        .canvas-area {
          flex: 1;
          position: relative;
          overflow: hidden;
          cursor: default;
        }

        .canvas-area.drag-over {
          background: rgba(0, 238, 238, 0.05);
        }

        .canvas-area.drag-over::after {
          content: '';
          position: absolute;
          inset: 20px;
          border: 2px dashed var(--encom-cyan);
          border-radius: 8px;
          pointer-events: none;
        }

        .canvas-grid {
          position: absolute;
          inset: -1000px;
          background-image:
            linear-gradient(var(--encom-gray-dark) 1px, transparent 1px),
            linear-gradient(90deg, var(--encom-gray-dark) 1px, transparent 1px);
          background-size: 50px 50px;
          opacity: 0.3;
          pointer-events: none;
          transform-origin: center center;
        }

        /* === GUIDE POPUP (Gold Accent) === */
        .guide-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 15;
          pointer-events: none;
        }

        .guide-popup {
          pointer-events: all;
          background: rgba(0, 0, 0, 0.92);
          border: 1px solid rgba(255, 204, 0, 0.4);
          border-radius: 6px;
          width: 400px;
          max-width: 90vw;
          position: relative;
          box-shadow:
            0 0 40px rgba(255, 204, 0, 0.08),
            0 0 80px rgba(255, 204, 0, 0.04),
            inset 0 0 30px rgba(255, 204, 0, 0.02);
        }

        .guide-glow-bar {
          position: absolute;
          top: -1px;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--encom-gold), transparent);
          border-radius: 6px 6px 0 0;
        }

        .guide-close {
          position: absolute;
          top: 10px;
          right: 12px;
          background: none;
          border: 1px solid transparent;
          border-radius: 4px;
          color: var(--encom-gray);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          z-index: 2;
        }

        .guide-close:hover {
          color: var(--encom-gold);
          border-color: var(--encom-gold-dim);
          background: rgba(255, 204, 0, 0.1);
        }

        .guide-header {
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--encom-gold);
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 204, 0, 0.15);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .guide-slash {
          color: var(--encom-gold-dim);
          font-weight: 300;
        }

        .guide-body {
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .guide-icon {
          color: var(--encom-gold);
          opacity: 0.6;
        }

        .guide-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 500;
          letter-spacing: 3px;
          color: var(--encom-gold);
          margin: 0;
        }

        .guide-desc {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--encom-gray-light);
          text-align: center;
          line-height: 1.5;
          margin: 0;
          max-width: 320px;
        }

        .guide-actions {
          display: flex;
          gap: 10px;
          margin-top: 8px;
        }

        .guide-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--encom-gold);
          background: rgba(255, 204, 0, 0.1);
          border: 1px solid var(--encom-gold-dim);
          padding: 10px 22px;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 2px;
        }

        .guide-btn:hover {
          background: rgba(255, 204, 0, 0.2);
          border-color: var(--encom-gold);
          box-shadow: 0 0 20px rgba(255, 204, 0, 0.25);
        }

        .guide-hints {
          display: flex;
          gap: 16px;
          margin-top: 12px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 204, 0, 0.1);
        }

        .guide-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .hint-key {
          font-family: var(--font-display);
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 1px;
          color: var(--encom-gold-dim);
          background: rgba(255, 204, 0, 0.08);
          border: 1px solid rgba(255, 204, 0, 0.15);
          padding: 3px 8px;
          border-radius: 2px;
        }

        .hint-desc {
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--encom-gray);
        }

        /* === QUICK PROMPT BAR === */
        .quick-prompt-bar {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          z-index: 10;
        }

        .quick-prompt-input {
          width: 500px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          color: var(--encom-white);
          font-family: var(--font-mono);
          font-size: 13px;
          outline: none;
          transition: all 0.3s ease;
        }

        .quick-prompt-input:focus {
          border-color: var(--encom-cyan);
          box-shadow: 0 0 20px var(--encom-cyan-glow);
        }

        .quick-generate-btn {
          width: 48px;
          height: 48px;
          background: rgba(0, 238, 238, 0.2);
          border: 1px solid var(--encom-cyan);
          border-radius: 4px;
          color: var(--encom-cyan);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .quick-generate-btn:hover:not(:disabled) {
          background: rgba(0, 238, 238, 0.3);
          box-shadow: 0 0 20px var(--encom-cyan-glow);
        }

        .quick-generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* === CANVAS CONTENT === */
        .canvas-content {
          position: absolute;
          inset: 0;
          transform-origin: center center;
        }

        .canvas-image {
          position: absolute;
          width: 300px;
          background: var(--encom-panel-bg);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .canvas-image:hover {
          border-color: var(--encom-cyan);
          box-shadow: 0 0 30px var(--encom-cyan-glow);
        }

        .canvas-image.selected {
          border-color: var(--encom-gold);
          box-shadow: 0 0 30px rgba(255, 204, 0, 0.3);
        }

        .canvas-image img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          display: block;
        }

        .image-actions {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .canvas-image:hover .image-actions {
          opacity: 1;
        }

        .action-btn {
          width: 28px;
          height: 28px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid var(--encom-gray-dark);
          border-radius: 4px;
          color: var(--encom-white);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: rgba(0, 238, 238, 0.2);
          border-color: var(--encom-cyan);
          color: var(--encom-cyan);
        }

        .image-label {
          padding: 8px 10px;
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--encom-gray-light);
          background: rgba(0, 0, 0, 0.6);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .canvas-image.processing {
          width: 300px;
          height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .processing-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          color: var(--encom-cyan);
          font-family: var(--font-display);
          font-size: 11px;
          letter-spacing: 2px;
        }

        /* === IMAGE DETAIL PANEL === */
        .image-detail-panel {
          position: absolute;
          top: 60px;
          right: 20px;
          width: 280px;
          background: var(--encom-panel-bg);
          border: 1px solid var(--encom-cyan-dim);
          border-radius: 4px;
          z-index: 20;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--encom-gray-dark);
          font-family: var(--font-display);
          font-size: 10px;
          color: var(--encom-gold);
          letter-spacing: 1px;
        }

        .detail-header button {
          background: none;
          border: none;
          color: var(--encom-gray-light);
          font-size: 18px;
          cursor: pointer;
        }

        .detail-content {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .detail-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-label {
          font-family: var(--font-display);
          font-size: 8px;
          color: var(--encom-gray);
          letter-spacing: 1px;
        }

        .detail-value {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--encom-white);
        }

        .detail-value.prompt {
          font-size: 10px;
          color: var(--encom-gray-light);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

export default VisualCanvas;
