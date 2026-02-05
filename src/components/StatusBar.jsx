import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Cpu, HardDrive, Wifi, Clock } from 'lucide-react';

function StatusBar({ isGenerating, systemStatus, generationsCount }) {
  const [memoryUsage, setMemoryUsage] = useState(45);
  const [networkLatency, setNetworkLatency] = useState(28);

  // Simulate dynamic metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setMemoryUsage(Math.floor(40 + Math.random() * 30));
      setNetworkLatency(Math.floor(20 + Math.random() * 40));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getOnlineCount = () => {
    return Object.values(systemStatus).filter(s => s === 'online').length;
  };

  return (
    <footer className="encom-status-bar">
      {/* Left Section */}
      <div className="status-section left">
        <div className="status-indicator">
          <motion.div
            className={`indicator-dot ${isGenerating ? 'active' : 'idle'}`}
            animate={{
              scale: isGenerating ? [1, 1.2, 1] : 1,
              opacity: isGenerating ? [1, 0.5, 1] : 0.7
            }}
            transition={{ repeat: isGenerating ? Infinity : 0, duration: 1 }}
          />
          <span>{isGenerating ? 'GENERATING' : 'READY'}</span>
        </div>

        <div className="status-divider" />

        <div className="status-metric">
          <Activity size={12} />
          <span>GENERATIONS</span>
          <span className="metric-value">{generationsCount}</span>
        </div>
      </div>

      {/* Center Section - Data Stream Effect */}
      <div className="status-section center">
        <div className="data-stream">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="stream-bar"
              animate={{
                height: [4, Math.random() * 12 + 4, 4],
                opacity: [0.3, 0.8, 0.3]
              }}
              transition={{
                repeat: Infinity,
                duration: 0.8 + Math.random() * 0.4,
                delay: i * 0.05
              }}
            />
          ))}
        </div>
      </div>

      {/* Right Section */}
      <div className="status-section right">
        <div className="status-metric">
          <Wifi size={12} />
          <span>BACKENDS</span>
          <span className="metric-value cyan">{getOnlineCount()}/6</span>
        </div>

        <div className="status-divider" />

        <div className="status-metric">
          <Cpu size={12} />
          <span>MEM</span>
          <span className="metric-value">{memoryUsage}%</span>
        </div>

        <div className="status-divider" />

        <div className="status-metric">
          <HardDrive size={12} />
          <span>LATENCY</span>
          <span className="metric-value">{networkLatency}ms</span>
        </div>

        <div className="status-divider" />

        <div className="status-metric">
          <Clock size={12} />
          <span className="version">DEADWEIGHT PRE-ALPHA v4.5</span>
        </div>
      </div>

      <style jsx>{`
        .encom-status-bar {
          height: 32px;
          background: linear-gradient(180deg, rgba(0, 10, 10, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%);
          border-top: 1px solid var(--encom-gray-dark);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          position: relative;
          z-index: 100;
        }

        .encom-status-bar::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--encom-cyan-dim), transparent);
        }

        .status-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .status-section.center {
          flex: 1;
          justify-content: center;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-display);
          font-size: 9px;
          letter-spacing: 1px;
          color: var(--encom-gray-light);
        }

        .indicator-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .indicator-dot.idle {
          background: var(--encom-gray);
        }

        .indicator-dot.active {
          background: var(--encom-cyan);
          box-shadow: 0 0 8px var(--encom-cyan);
        }

        .status-divider {
          width: 1px;
          height: 16px;
          background: var(--encom-gray-dark);
        }

        .status-metric {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--encom-gray);
        }

        .metric-value {
          color: var(--encom-white);
          font-weight: 500;
        }

        .metric-value.cyan {
          color: var(--encom-cyan);
        }

        .data-stream {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 16px;
        }

        .stream-bar {
          width: 2px;
          background: var(--encom-cyan);
          border-radius: 1px;
        }

        .version {
          color: var(--encom-gray);
          font-family: var(--font-display);
          font-size: 8px;
          letter-spacing: 1px;
        }
      `}</style>
    </footer>
  );
}

export default StatusBar;
