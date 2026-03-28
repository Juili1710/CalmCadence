import React, { useEffect, useRef } from 'react';
import { CreateSessionMode } from "@workspace/api-client-react";
import { getReferenceY, getDotXFraction, MODES, PhaseType } from '../lib/waveEngine';

interface BreathVisualizerProps {
  mode: CreateSessionMode;
  isActive: boolean;
  amplitude: number;
  breathState: PhaseType | 'hold';
}

const PHASE_COLORS: Record<string, string> = {
  inhale: '#3B82F6',
  exhale: '#14B8A6',
  hold:   '#8B5CF6',
};

const USER_HISTORY_LEN = 300;

export function BreathVisualizer({ mode, isActive, amplitude, breathState }: BreathVisualizerProps) {
  const refCanvasRef  = useRef<HTMLCanvasElement>(null);
  const userCanvasRef = useRef<HTMLCanvasElement>(null);
  const userHistoryRef = useRef<number[]>(new Array(USER_HISTORY_LEN).fill(0));
  const startTimeRef   = useRef<number>(0);
  const rafRef         = useRef<number>(0);

  const amplitudeRef   = useRef(amplitude);
  const breathStateRef = useRef(breathState);
  const isActiveRef    = useRef(isActive);
  const modeRef        = useRef(mode);

  amplitudeRef.current   = amplitude;
  breathStateRef.current = breathState;
  isActiveRef.current    = isActive;
  modeRef.current        = mode;

  useEffect(() => {
    const refCanvas  = refCanvasRef.current;
    const userCanvas = userCanvasRef.current;
    if (!refCanvas || !userCanvas) return;

    const refCtx  = refCanvas.getContext('2d');
    const userCtx = userCanvas.getContext('2d');
    if (!refCtx || !userCtx) return;

    startTimeRef.current = performance.now();

    const render = (now: number) => {
      const amp    = amplitudeRef.current;
      const state  = breathStateRef.current;
      const active = isActiveRef.current;
      const curMode = modeRef.current;
      const t = active ? (now - startTimeRef.current) / 1000 : 0;

      // Update user amplitude history
      userHistoryRef.current.shift();
      userHistoryRef.current.push(active ? amp : 0);

      // ── REFERENCE CANVAS ────────────────────────────────────────────────
      const RW = refCanvas.width;
      const RH = refCanvas.height;
      const refPad  = 14;
      const refWaveH = RH - refPad * 2;
      const cycleDur = MODES[curMode].cycleDuration;

      refCtx.clearRect(0, 0, RW, RH);

      // Label
      refCtx.font = '11px Inter, sans-serif';
      refCtx.fillStyle = 'rgba(255,255,255,0.28)';
      refCtx.fillText('REFERENCE', 10, refPad - 2);

      // Background glow on reference wave
      refCtx.save();
      refCtx.shadowBlur  = 18;
      refCtx.shadowColor = 'rgba(59,130,246,0.18)';

      // Draw ghost reference wave (full cycle)
      refCtx.beginPath();
      refCtx.lineWidth = 2.5;
      refCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let x = 0; x <= RW; x++) {
        const { y } = getReferenceY((x / RW) * cycleDur, curMode);
        const cy = RH - refPad - y * refWaveH;
        x === 0 ? refCtx.moveTo(x, cy) : refCtx.lineTo(x, cy);
      }
      refCtx.stroke();
      refCtx.restore();

      // Dot x fraction and y
      const dotXFrac = getDotXFraction(t, curMode);
      const dotX = dotXFrac * RW;
      const { y: dotY, phase } = getReferenceY((t % cycleDur), curMode);
      const glowColor = PHASE_COLORS[phase];

      // Draw filled path up to dot (glowing progress trail)
      refCtx.save();
      refCtx.shadowBlur  = 16;
      refCtx.shadowColor = glowColor;
      refCtx.beginPath();
      refCtx.lineWidth = 4;
      refCtx.strokeStyle = glowColor + 'BB';
      for (let x = 0; x <= Math.ceil(dotX); x++) {
        const { y } = getReferenceY((x / RW) * cycleDur, curMode);
        const cy = RH - refPad - y * refWaveH;
        x === 0 ? refCtx.moveTo(x, cy) : refCtx.lineTo(x, cy);
      }
      refCtx.stroke();
      refCtx.restore();

      // Moving dot (spec: ONLY on reference canvas)
      const dotCanvasY = RH - refPad - dotY * refWaveH;
      refCtx.save();
      refCtx.shadowBlur  = 28;
      refCtx.shadowColor = 'white';
      refCtx.beginPath();
      refCtx.arc(dotX, dotCanvasY, 11, 0, Math.PI * 2);
      refCtx.fillStyle = 'white';
      refCtx.fill();
      refCtx.restore();

      // Inner dot color ring
      refCtx.save();
      refCtx.beginPath();
      refCtx.arc(dotX, dotCanvasY, 5, 0, Math.PI * 2);
      refCtx.fillStyle = glowColor;
      refCtx.fill();
      refCtx.restore();

      // ── USER BREATH CANVAS ───────────────────────────────────────────────
      const UW = userCanvas.width;
      const UH = userCanvas.height;
      const userPad   = 14;
      const userWaveH = UH - userPad * 2;
      const baseY     = userPad;
      const userColor = active ? PHASE_COLORS[state] : 'rgba(255,255,255,0.15)';

      userCtx.clearRect(0, 0, UW, UH);

      // Label
      userCtx.font = '11px Inter, sans-serif';
      userCtx.fillStyle = 'rgba(255,255,255,0.28)';
      userCtx.fillText('YOUR BREATH', 10, userPad - 2);

      // Draw user amplitude history — smoothed with simple moving average across 3 samples
      const hist = userHistoryRef.current;
      userCtx.save();
      userCtx.shadowBlur  = active ? 14 : 0;
      userCtx.shadowColor = userColor;
      userCtx.beginPath();
      userCtx.lineWidth = 3;
      userCtx.strokeStyle = userColor;
      for (let i = 0; i < hist.length; i++) {
        const x = (i / hist.length) * UW;
        // 3-point moving average for spec §12 smoothing
        const smoothed = (
          (hist[Math.max(0, i - 1)] + hist[i] + hist[Math.min(hist.length - 1, i + 1)]) / 3
        );
        const cy = UH - userPad - smoothed * userWaveH;
        i === 0 ? userCtx.moveTo(x, cy) : userCtx.lineTo(x, cy);
      }
      userCtx.stroke();
      userCtx.restore();

      // Current amplitude dot (leading edge) — NO moving dot here (spec §1)
      if (active) {
        const latestAmp = hist[hist.length - 1];
        const userDotY  = UH - userPad - latestAmp * userWaveH;
        userCtx.save();
        userCtx.shadowBlur  = 16;
        userCtx.shadowColor = userColor;
        userCtx.beginPath();
        userCtx.arc(UW - 3, userDotY, 6, 0, Math.PI * 2);
        userCtx.fillStyle = userColor;
        userCtx.fill();
        userCtx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // single rAF loop, reads from refs

  const phaseColor = PHASE_COLORS[breathState] ?? PHASE_COLORS.hold;

  return (
    <div
      className="w-full rounded-3xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Phase label */}
      <div className="text-center pt-4 pb-1">
        <h2
          className="text-2xl font-bold uppercase tracking-widest transition-colors duration-500"
          style={{ color: isActive ? phaseColor : 'rgba(255,255,255,0.38)' }}
        >
          {isActive ? breathState : 'READY'}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {isActive ? 'Follow the moving dot with your breath' : 'Press start when you are ready'}
        </p>
      </div>

      {/* Reference canvas — moving dot lives here */}
      <canvas
        ref={refCanvasRef}
        width={900}
        height={200}
        className="w-full"
        style={{ height: '160px' }}
      />

      {/* Subtle divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />

      {/* User breath canvas — NO dot */}
      <canvas
        ref={userCanvasRef}
        width={900}
        height={200}
        className="w-full"
        style={{ height: '160px' }}
      />
    </div>
  );
}
