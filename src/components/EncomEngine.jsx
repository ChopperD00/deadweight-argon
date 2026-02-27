import { useEffect, useRef } from 'react';

const CYAN = '#00EEEE';
const GOLD = '#FFCC00';

export default function EncomEngine({ opacity = 0.65 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H;
    let frame = 0;
    let gridH = [];
    let gridV = [];
    let particles = [];
    let pulseRings = [];
    let scanY = 0;
    let glitchTimer = 240;
    let glitchActive = false;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      init();
    }

    function init() {
      // Horizontal grid lines — perspective, receding toward vanishing point
      gridH = Array.from({ length: 22 }, (_, i) => ({
        t: i / 21,
        phase: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.004,
      }));

      // Vertical lines — radiating from vanishing point
      gridV = Array.from({ length: 28 }, (_, i) => ({
        t: i / 27,
        phase: Math.random() * Math.PI * 2,
        speed: 0.003 + Math.random() * 0.003,
      }));

      // Seed particles scattered across screen
      particles = Array.from({ length: 100 }, () => makeParticle(true));
    }

    function makeParticle(scattered = false) {
      const isGold = Math.random() < 0.12;
      return {
        x: Math.random() * (W || window.innerWidth),
        y: scattered
          ? Math.random() * (H || window.innerHeight)
          : -6,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.4 + Math.random() * 0.9,
        size: 0.8 + Math.random() * 2,
        color: isGold ? GOLD : CYAN,
        alpha: 0.25 + Math.random() * 0.65,
        life: 1,
        decay: 0.0008 + Math.random() * 0.0015,
      };
    }

    function drawGrid() {
      ctx.save();

      const vx = W * 0.5;   // vanishing point x — screen center
      const vy = H * 0.08;  // vanishing point y — near top

      // Horizontal lines
      gridH.forEach(line => {
        line.phase += line.speed;
        const pulse = 0.12 + Math.sin(line.phase) * 0.07;

        // Power curve — cluster lines near horizon
        const yNorm = Math.pow(line.t, 1.6);
        const y = vy + yNorm * (H - vy);

        // Width narrows toward horizon
        const x0 = vx - yNorm * W * 0.72;
        const x1 = vx + yNorm * W * 0.72;

        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.strokeStyle = CYAN;
        ctx.globalAlpha = pulse * (0.35 + yNorm * 0.5);
        ctx.lineWidth = 0.4 + yNorm * 0.6;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 4;
        ctx.stroke();
      });

      // Vertical lines radiating from vanishing point
      gridV.forEach(line => {
        line.phase += line.speed;
        const pulse = 0.07 + Math.sin(line.phase) * 0.04;

        // Spread angle across full width
        const angle = (line.t - 0.5) * Math.PI * 1.15;
        const len = H * 2.8;
        const farX = vx + Math.sin(angle) * len;
        const farY = vy + Math.cos(Math.abs(angle) * 0.3) * len;

        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(farX, farY);
        ctx.strokeStyle = CYAN;
        ctx.globalAlpha = pulse * 0.32;
        ctx.lineWidth = 0.35;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 2;
        ctx.stroke();
      });

      ctx.restore();
    }

    function drawParticles() {
      ctx.save();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0 || p.y > H + 10) {
          particles[i] = makeParticle();
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * p.life;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.restore();
    }

    function drawPulseRings() {
      // Spawn a ring every ~160 frames (max 5 active)
      if (frame % 160 === 0 && pulseRings.length < 5) {
        pulseRings.push({
          x: W * (0.12 + Math.random() * 0.76),
          y: H * (0.18 + Math.random() * 0.64),
          r: 0,
          maxR: 120 + Math.random() * 200,
          color: Math.random() < 0.25 ? GOLD : CYAN,
          speed: 1.2 + Math.random() * 1.8,
        });
      }

      ctx.save();
      for (let i = pulseRings.length - 1; i >= 0; i--) {
        const ring = pulseRings[i];
        ring.r += ring.speed;
        const t = ring.r / ring.maxR;
        if (t >= 1) {
          pulseRings.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = (1 - t) * 0.22;
        ctx.lineWidth = 1;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = 8;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawScanlines() {
      scanY = (scanY + 0.6) % H;
      ctx.save();

      // Rolling bright band
      const grad = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, 'rgba(0, 238, 238, 0.035)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, scanY - 20, W, 40);

      // Static horizontal line texture (every 3px)
      ctx.globalAlpha = 0.016;
      ctx.fillStyle = '#000d0d';
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1);
      }

      ctx.restore();
    }

    function drawHUDData() {
      ctx.save();
      ctx.font = '9px "Courier New", monospace';

      const telemetry = [
        `SYS.CLK  ${(frame * 0.016).toFixed(2)}s`,
        `SESSION  ${Date.now().toString(36).toUpperCase().slice(-7)}`,
        `MEM.HEAP ${(Math.sin(frame * 0.008) * 12 + 68).toFixed(1)}%`,
        `ARGON.RT ${(Math.random() * 3 + 19).toFixed(0)}ms`,
      ];

      // Top-right block
      ctx.textAlign = 'right';
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 5;
      ctx.globalAlpha = 0.27;
      telemetry.forEach((line, i) => {
        ctx.fillText(line, W - 18, 22 + i * 13);
      });

      // Bottom-left branding
      ctx.textAlign = 'left';
      ctx.fillStyle = GOLD;
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 5;
      ctx.globalAlpha = 0.22;
      ctx.fillText('DEADWEIGHT v2.0  //  ARGON', 18, H - 34);
      ctx.font = '8px "Courier New", monospace';
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.fillText('ENCOM INTERFACE SYSTEM  [CLASSIFIED]', 18, H - 21);

      ctx.restore();
    }

    function drawGlitch() {
      glitchTimer--;
      if (glitchTimer <= 0) {
        glitchTimer = 200 + Math.floor(Math.random() * 280);
        glitchActive = true;
        setTimeout(() => {
          glitchActive = false;
        }, 60 + Math.random() * 100);
      }
      if (!glitchActive) return;

      ctx.save();
      // RGB horizontal slice shift — read from canvas and redraw offset
      const slices = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < slices; i++) {
        const sy = Math.random() * H;
        const sh = 2 + Math.random() * 12;
        const dx = (Math.random() - 0.5) * 24;
        try {
          ctx.drawImage(canvas, 0, sy, W, sh, dx, sy, W, sh);
        } catch (e) {
          // ignore cross-origin or zero-dimension edge cases
        }
      }
      ctx.restore();
    }

    function loop() {
      frame++;

      // Dark fade — slight motion blur trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillRect(0, 0, W, H);

      drawGrid();
      drawParticles();
      drawPulseRings();
      drawScanlines();
      drawHUDData();
      drawGlitch();

      animRef.current = requestAnimationFrame(loop);
    }

    resize();
    loop();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity,
      }}
    />
  );
}
