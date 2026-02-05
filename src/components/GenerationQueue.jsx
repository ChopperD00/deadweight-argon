import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp, ChevronDown, X, Image, Video,
  Clock, CheckCircle, AlertCircle, Loader
} from 'lucide-react';

function GenerationQueue({ generations, onClear, onRemove }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const recentGenerations = generations.slice(0, 10);
  const processingCount = generations.filter(g => g.status === 'processing').length;
  const completedCount = generations.filter(g => g.status === 'complete').length;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
        return <Loader size={14} className="spinning" />;
      case 'complete':
        return <CheckCircle size={14} />;
      case 'error':
        return <AlertCircle size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'processing':
        return 'var(--encom-gold)';
      case 'complete':
        return 'var(--encom-cyan)';
      case 'error':
        return '#ff4444';
      default:
        return 'var(--encom-gray)';
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (isCollapsed) {
    return (
      <motion.div
        className="queue-collapsed"
        initial={{ x: 100 }}
        animate={{ x: 0 }}
        onClick={() => setIsCollapsed(false)}
      >
        <div className="collapsed-count">
          {processingCount > 0 ? (
            <Loader size={14} className="spinning" />
          ) : (
            <Image size={14} />
          )}
          <span>{generations.length}</span>
        </div>

        <style jsx>{`
          .queue-collapsed {
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 10, 10, 0.95);
            border: 1px solid var(--encom-cyan-dim);
            border-right: none;
            border-radius: 4px 0 0 4px;
            padding: 12px 8px;
            cursor: pointer;
            z-index: 40;
          }

          .collapsed-count {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            color: var(--encom-cyan);
            font-family: var(--font-display);
            font-size: 12px;
          }

          .spinning {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </motion.div>
    );
  }

  return (
    <motion.aside
      className="generation-queue"
      initial={{ x: 100 }}
      animate={{ x: 0 }}
    >
      {/* Header */}
      <div className="queue-header">
        <div className="header-title">
          <span>GENERATION QUEUE</span>
          <div className="queue-stats">
            <span className="stat processing">{processingCount}</span>
            <span className="stat complete">{completedCount}</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="header-btn"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            className="header-btn"
            onClick={() => setIsCollapsed(true)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Queue Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="queue-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {recentGenerations.length === 0 ? (
              <div className="queue-empty">
                <Image size={24} />
                <span>No generations yet</span>
              </div>
            ) : (
              <div className="queue-list">
                {recentGenerations.map((gen, index) => (
                  <motion.div
                    key={gen.id}
                    className={`queue-item ${gen.status}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    {/* Thumbnail */}
                    <div className="item-thumbnail">
                      {gen.result ? (
                        gen.type === 'video' ? (
                          <video src={gen.result} muted />
                        ) : (
                          <img src={gen.result} alt="" />
                        )
                      ) : (
                        <div className="thumbnail-placeholder">
                          {gen.type === 'video' ? <Video size={16} /> : <Image size={16} />}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="item-info">
                      <div className="item-prompt">
                        {gen.prompt.length > 40 ? gen.prompt.slice(0, 40) + '...' : gen.prompt}
                      </div>
                      <div className="item-meta">
                        <span className="meta-model">{gen.model || gen.backend}</span>
                        <span className="meta-time">{formatTime(gen.timestamp)}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="item-status" style={{ color: getStatusColor(gen.status) }}>
                      {getStatusIcon(gen.status)}
                    </div>

                    {/* Remove Button */}
                    {gen.status !== 'processing' && (
                      <button
                        className="item-remove"
                        onClick={() => onRemove(gen.id)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Footer */}
            {generations.length > 0 && (
              <div className="queue-footer">
                <button className="clear-btn" onClick={onClear}>
                  CLEAR ALL
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .generation-queue {
          position: absolute;
          right: 0;
          top: 60px;
          bottom: 40px;
          width: 280px;
          background: rgba(0, 10, 10, 0.95);
          border-left: 1px solid var(--encom-gray-dark);
          display: flex;
          flex-direction: column;
          z-index: 40;
        }

        .queue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid var(--encom-gray-dark);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-title span {
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1px;
          color: var(--encom-cyan);
        }

        .queue-stats {
          display: flex;
          gap: 8px;
        }

        .stat {
          font-family: var(--font-mono);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 2px;
        }

        .stat.processing {
          background: rgba(255, 204, 0, 0.2);
          color: var(--encom-gold);
        }

        .stat.complete {
          background: rgba(0, 238, 238, 0.2);
          color: var(--encom-cyan);
        }

        .header-actions {
          display: flex;
          gap: 4px;
        }

        .header-btn {
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--encom-gray-light);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 2px;
          transition: all 0.2s ease;
        }

        .header-btn:hover {
          color: var(--encom-cyan);
          background: rgba(0, 238, 238, 0.1);
        }

        .queue-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .queue-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--encom-gray);
          font-size: 11px;
        }

        .queue-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .queue-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          border-left: 3px solid var(--encom-gray);
          position: relative;
        }

        .queue-item.processing {
          border-left-color: var(--encom-gold);
        }

        .queue-item.complete {
          border-left-color: var(--encom-cyan);
        }

        .queue-item.error {
          border-left-color: #ff4444;
        }

        .item-thumbnail {
          width: 40px;
          height: 40px;
          border-radius: 2px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.5);
          flex-shrink: 0;
        }

        .item-thumbnail img, .item-thumbnail video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thumbnail-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--encom-gray);
        }

        .item-info {
          flex: 1;
          min-width: 0;
        }

        .item-prompt {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--encom-white);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-meta {
          display: flex;
          gap: 8px;
          margin-top: 4px;
          font-size: 8px;
          color: var(--encom-gray);
        }

        .meta-model {
          text-transform: uppercase;
        }

        .item-status {
          flex-shrink: 0;
        }

        .item-remove {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 16px;
          height: 16px;
          background: transparent;
          border: none;
          color: var(--encom-gray);
          cursor: pointer;
          opacity: 0;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .queue-item:hover .item-remove {
          opacity: 1;
        }

        .item-remove:hover {
          color: #ff4444;
        }

        .queue-footer {
          padding: 8px 12px;
          border-top: 1px solid var(--encom-gray-dark);
        }

        .clear-btn {
          width: 100%;
          padding: 8px;
          background: transparent;
          border: 1px solid var(--encom-gray-dark);
          border-radius: 2px;
          color: var(--encom-gray-light);
          font-family: var(--font-display);
          font-size: 9px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .clear-btn:hover {
          border-color: var(--encom-cyan-dim);
          color: var(--encom-cyan);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.aside>
  );
}

export default GenerationQueue;
