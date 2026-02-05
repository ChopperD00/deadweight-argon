import React, { useState, useEffect } from 'react';

const GATE_KEY = 'argon_auth';

const PasswordGate = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(GATE_KEY) === '1') {
      setAuthenticated(true);
    }
  }, []);

  // Ensure fonts are loaded for the gate screen
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inconsolata:wght@300;400;500;700&family=Orbitron:wght@400;500;700;900&display=swap';
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    setTimeout(() => {
      if (password === 'endofline') {
        sessionStorage.setItem(GATE_KEY, '1');
        setAuthenticated(true);
      } else {
        setError(true);
        setGlitch(true);
        setPassword('');
        setTimeout(() => setGlitch(false), 600);
      }
      setLoading(false);
    }, 1000);
  };

  if (authenticated) return children;

  return (
    <div style={styles.container}>
      <div style={styles.gridBg} />
      <div style={styles.scanlines} />

      {/* HUD Corners */}
      <div style={{...styles.hudCorner, top: 10, left: 10, borderTop: '2px solid #00EEEE', borderLeft: '2px solid #00EEEE'}} />
      <div style={{...styles.hudCorner, top: 10, right: 10, borderTop: '2px solid #00EEEE', borderRight: '2px solid #00EEEE'}} />
      <div style={{...styles.hudCorner, bottom: 10, left: 10, borderBottom: '2px solid #00EEEE', borderLeft: '2px solid #00EEEE'}} />
      <div style={{...styles.hudCorner, bottom: 10, right: 10, borderBottom: '2px solid #00EEEE', borderRight: '2px solid #00EEEE'}} />

      <div style={{
        ...styles.panel,
        ...(glitch ? { transform: 'translateX(2px)', filter: 'hue-rotate(90deg)' } : {})
      }}>
        <div style={styles.panelGlow} />

        {/* Panel Header */}
        <div style={styles.header}>
          <span style={styles.headerSlash}>{'//'}</span>
          IDENTITY VERIFICATION REQUIRED
        </div>

        {/* Panel Body */}
        <div style={styles.body}>
          <div style={styles.logo}>
            <span style={styles.logoPrimary}>DEADWEIGHT</span>
            <span style={styles.logoDivider}>{'//'}</span>
            <span style={styles.logoSecondary}>ARGON</span>
          </div>

          <div style={styles.subtitle}>
            PRE-ALPHA v4.5 &mdash; RESTRICTED ACCESS
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>ENTER ACCESS CODE</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              style={{
                ...styles.input,
                ...(error ? styles.inputError : {}),
                ...(loading ? { opacity: 0.5 } : {})
              }}
              placeholder="_ _ _ _ _ _ _ _ _"
              autoFocus
              disabled={loading}
            />

            {error && (
              <div style={styles.error}>
                ACCESS DENIED &mdash; INVALID CREDENTIALS
              </div>
            )}

            <button
              type="submit"
              style={{
                ...styles.button,
                ...(loading ? styles.buttonLoading : {}),
                ...(!password && !loading ? { opacity: 0.3, cursor: 'default' } : {})
              }}
              disabled={loading || !password}
            >
              {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
            </button>
          </form>

          <div style={styles.footer}>
            SYSTEM SECURED &mdash; UNAUTHORIZED ACCESS PROHIBITED
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes argon-border-pulse {
          0%, 100% { border-color: rgba(0, 238, 238, 0.4); box-shadow: 0 0 20px rgba(0, 238, 238, 0.1), inset 0 0 20px rgba(0, 238, 238, 0.03); }
          50% { border-color: rgba(0, 238, 238, 0.7); box-shadow: 0 0 40px rgba(0, 238, 238, 0.2), inset 0 0 30px rgba(0, 238, 238, 0.06); }
        }
        @keyframes argon-text-glow {
          0%, 100% { text-shadow: 0 0 5px rgba(0, 238, 238, 0.3); }
          50% { text-shadow: 0 0 15px rgba(0, 238, 238, 0.6), 0 0 30px rgba(0, 238, 238, 0.3); }
        }
        @keyframes argon-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Inconsolata', monospace",
  },
  gridBg: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: 'linear-gradient(#333333 1px, transparent 1px), linear-gradient(90deg, #333333 1px, transparent 1px)',
    backgroundSize: '50px 50px',
    opacity: 0.15,
    pointerEvents: 'none',
  },
  scanlines: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
    pointerEvents: 'none',
    zIndex: 9999,
    opacity: 0.3,
  },
  hudCorner: {
    position: 'fixed',
    width: 20,
    height: 20,
    pointerEvents: 'none',
    zIndex: 100,
  },
  panel: {
    background: 'rgba(0, 0, 0, 0.9)',
    border: '1px solid rgba(0, 238, 238, 0.4)',
    borderRadius: 2,
    width: 440,
    maxWidth: '90vw',
    position: 'relative',
    zIndex: 10,
    animation: 'argon-border-pulse 3s ease-in-out infinite',
    transition: 'all 0.15s ease',
  },
  panelGlow: {
    position: 'absolute',
    top: -1,
    left: 0,
    right: 0,
    height: 3,
    background: 'linear-gradient(90deg, transparent, #00EEEE, transparent)',
  },
  header: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#00EEEE',
    padding: '12px 16px',
    borderBottom: '1px solid #333333',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerSlash: {
    color: '#FFCC00',
    fontWeight: 300,
  },
  body: {
    padding: '36px 28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoPrimary: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 24,
    fontWeight: 900,
    color: '#ffffff',
    letterSpacing: 3,
  },
  logoDivider: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 24,
    fontWeight: 300,
    color: '#FFCC00',
  },
  logoSecondary: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 24,
    fontWeight: 500,
    color: '#00EEEE',
    letterSpacing: 3,
    animation: 'argon-text-glow 2s ease-in-out infinite',
  },
  subtitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: '#666666',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
  },
  label: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: '#aaaaaa',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  input: {
    fontFamily: "'Inconsolata', monospace",
    fontSize: 18,
    color: '#ffffff',
    background: 'rgba(0, 0, 0, 0.6)',
    border: '1px solid #444444',
    padding: '14px 16px',
    width: '100%',
    outline: 'none',
    letterSpacing: 6,
    textAlign: 'center',
    transition: 'all 0.3s ease',
    borderRadius: 0,
  },
  inputError: {
    borderColor: '#ff4444',
    boxShadow: '0 0 15px rgba(255, 68, 68, 0.3)',
  },
  error: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 10,
    color: '#ff4444',
    letterSpacing: 1,
    textAlign: 'center',
    textShadow: '0 0 10px rgba(255, 68, 68, 0.5)',
  },
  button: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#00EEEE',
    background: 'rgba(0, 238, 238, 0.1)',
    border: '1px solid rgba(0, 170, 170, 0.6)',
    padding: '14px 24px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: 8,
    borderRadius: 0,
  },
  buttonLoading: {
    opacity: 0.6,
    cursor: 'wait',
  },
  footer: {
    fontFamily: "'Inconsolata', monospace",
    fontSize: 10,
    color: '#444444',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 12,
  },
};

export default PasswordGate;
