import { useRef, useCallback } from 'react';
import { CreateSessionMode } from "@workspace/api-client-react";

export type PhaseType = 'inhale' | 'exhale' | 'hold';

export interface ModeConfig {
  in: number;
  hold1: number;
  out: number;
  hold2: number;
  baseHz: number;
  label: string;
}

export const MODES: Record<CreateSessionMode, ModeConfig> = {
  focus: { in: 4, hold1: 1, out: 4, hold2: 0, baseHz: 440, label: "Focus" },
  sleep: { in: 4, hold1: 2, out: 8, hold2: 0, baseHz: 220, label: "Sleep" },
  yoga:  { in: 4, hold1: 4, out: 4, hold2: 4, baseHz: 330, label: "Yoga" },
  panic: { in: 2, hold1: 1, out: 8, hold2: 0, baseHz: 380, label: "Panic Calm" },
};

export function getPhaseInfo(t: number, mode: CreateSessionMode): { type: PhaseType, y: number, cycleTime: number } {
  const cfg = MODES[mode];
  const total = cfg.in + cfg.hold1 + cfg.out + cfg.hold2;
  const cycleTime = t % total;

  if (cycleTime < cfg.in) {
    const progress = cycleTime / cfg.in;
    return { type: 'inhale', y: 0.5 - 0.5 * Math.cos(Math.PI * progress), cycleTime };
  } else if (cycleTime < cfg.in + cfg.hold1) {
    return { type: 'hold', y: 1, cycleTime };
  } else if (cycleTime < cfg.in + cfg.hold1 + cfg.out) {
    const progress = (cycleTime - cfg.in - cfg.hold1) / cfg.out;
    return { type: 'exhale', y: 0.5 + 0.5 * Math.cos(Math.PI * progress), cycleTime };
  } else {
    return { type: 'hold', y: 0, cycleTime };
  }
}

export function useAudioAnalyzer() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const startMic = useCallback(async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      
      const analyzer = audioCtxRef.current.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.8;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Setup Oscillator for sonification
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.value = 0; // Start muted
      
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();
      
      oscillatorRef.current = osc;
      gainNodeRef.current = gain;

      return true;
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      return false;
    }
  }, []);

  const stopMic = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    analyzerRef.current = null;
  }, []);

  const getAmplitude = useCallback(() => {
    if (!analyzerRef.current) return 0;
    const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
    analyzerRef.current.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    // Normalize to 0-1 range approx
    return Math.min(1, (sum / dataArray.length) / 128);
  }, []);

  const updateSonification = useCallback((amplitude: number, soundEnabled: boolean, mode: CreateSessionMode) => {
    if (!oscillatorRef.current || !gainNodeRef.current) return;
    
    if (!soundEnabled) {
      gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current!.currentTime, 0.1);
      return;
    }

    const cfg = MODES[mode];
    // Map pitch around baseHz based on amplitude
    const targetFreq = cfg.baseHz + (amplitude * 150);
    // Map volume based on amplitude but keep it soothing
    const targetGain = amplitude * 0.3;

    oscillatorRef.current.frequency.setTargetAtTime(targetFreq, audioCtxRef.current!.currentTime, 0.1);
    gainNodeRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current!.currentTime, 0.1);
  }, []);

  return { startMic, stopMic, getAmplitude, updateSonification };
}
