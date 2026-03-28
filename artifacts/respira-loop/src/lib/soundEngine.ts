import { CreateSessionMode } from "@workspace/api-client-react";
import { MODES } from "./waveEngine";

interface AmbientLayer {
  osc: OscillatorNode;
  gain: GainNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
}

interface HarmonicLayer {
  osc: OscillatorNode;
  gain: GainNode;
}

export class SoundEngine {
  private audioCtx:    AudioContext | null = null;
  private analyzer:    AnalyserNode | null = null;
  private mediaStream: MediaStream | null  = null;

  // Mic pipeline: mic → bandpassFilter → analyser
  private micBandpass: BiquadFilterNode | null = null;

  // Sound pipeline: oscillators → lowpassFilter → masterGain → destination
  private masterGain:  GainNode | null         = null;
  private outputFilter: BiquadFilterNode | null = null;

  // Layers
  private breathOsc:   OscillatorNode | null = null;
  private breathGain:  GainNode | null       = null;
  private harmonic:    HarmonicLayer | null  = null;
  private ambient:     AmbientLayer | null   = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain:   GainNode | null       = null;

  // Smooth transition state
  private currentVolume = 0;
  private currentPitch  = 0;

  private getCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioCtx;
  }

  // ── Microphone ─────────────────────────────────────────────────────────────

  async startMic(): Promise<boolean> {
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      const source = ctx.createMediaStreamSource(stream);

      // Bandpass filter for breath frequencies (100–800 Hz region) — spec §2
      this.micBandpass = ctx.createBiquadFilter();
      this.micBandpass.type = 'bandpass';
      this.micBandpass.frequency.value = 600;
      this.micBandpass.Q.value = 1;

      this.analyzer = ctx.createAnalyser();
      this.analyzer.fftSize = 512;
      this.analyzer.smoothingTimeConstant = 0.4;

      // mic → bandpass → analyser
      source.connect(this.micBandpass);
      this.micBandpass.connect(this.analyzer);

      return true;
    } catch (err) {
      console.error('Microphone access failed:', err);
      return false;
    }
  }

  getRawAmplitude(): number {
    if (!this.analyzer) return 0;
    const data = new Uint8Array(this.analyzer.frequencyBinCount);
    this.analyzer.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return Math.min(1, (sum / data.length) / 80);
  }

  stopMic() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    this.micBandpass?.disconnect();
    this.micBandpass = null;
    this.analyzer = null;
  }

  // ── Sound layers ────────────────────────────────────────────────────────────

  startOscillator(mode: CreateSessionMode) {
    const ctx = this.getCtx();
    const cfg = MODES[mode];

    this._teardownSoundLayers();

    // Master gain + output lowpass filter
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;

    this.outputFilter = ctx.createBiquadFilter();
    this.outputFilter.type = 'lowpass';
    this.outputFilter.frequency.value = 800; // spec §9

    this.outputFilter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // Layer 1: Breath modulation oscillator
    this.breathOsc  = ctx.createOscillator();
    this.breathGain = ctx.createGain();
    this.breathOsc.type = 'sine';
    this.breathOsc.frequency.value = cfg.baseHz;
    this.breathGain.gain.value = 0;
    this.breathOsc.connect(this.breathGain);
    this.breathGain.connect(this.outputFilter);
    this.breathOsc.start();

    // Layer 2: Soft harmonic (perfect fifth above, quieter)
    const harmOsc  = ctx.createOscillator();
    const harmGain = ctx.createGain();
    harmOsc.type = 'sine';
    harmOsc.frequency.value = cfg.baseHz * 1.5;
    harmGain.gain.value = 0;
    harmOsc.connect(harmGain);
    harmGain.connect(this.outputFilter);
    harmOsc.start();
    this.harmonic = { osc: harmOsc, gain: harmGain };

    // Layer 3: Mode-specific ambient background
    this._startAmbientLayer(ctx, mode);

    this.currentPitch  = cfg.baseHz;
    this.currentVolume = 0;
  }

  private _startAmbientLayer(ctx: AudioContext, mode: CreateSessionMode) {
    const ambOsc  = ctx.createOscillator();
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0;

    switch (mode) {
      case 'focus': {
        // Soft rhythmic sub-bass pulse with LFO tremolo
        ambOsc.type = 'sine';
        ambOsc.frequency.value = 100;
        const lfo     = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.25; // 1 pulse per 4 seconds
        lfoGain.gain.value  = 0.06;
        lfo.connect(lfoGain);
        lfoGain.connect(ambGain.gain);
        lfo.start();
        this.ambient = { osc: ambOsc, gain: ambGain, lfo, lfoGain };
        break;
      }
      case 'sleep': {
        // Ocean/wind: bandpass-filtered white noise
        ambOsc.type = 'triangle';
        ambOsc.frequency.value = 60;
        this.ambient = { osc: ambOsc, gain: ambGain };
        this._startNoiseLayer(ctx, 400, 0.8);  // wind-like filtered noise
        break;
      }
      case 'yoga': {
        // Soft harmonic drone: multiple detuned oscillators
        ambOsc.type = 'sine';
        ambOsc.frequency.value = MODES.yoga.baseHz * 0.5; // octave below
        const lfo     = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.1;
        lfoGain.gain.value  = 0.03;
        lfo.connect(lfoGain);
        lfoGain.connect(ambGain.gain);
        lfo.start();
        this.ambient = { osc: ambOsc, gain: ambGain, lfo, lfoGain };
        break;
      }
      case 'panic': {
        // Warm pad: triangle wave, slow LFO swell
        ambOsc.type = 'triangle';
        ambOsc.frequency.value = MODES.panic.baseHz * 0.5;
        const lfo     = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.08; // very slow swell
        lfoGain.gain.value  = 0.04;
        lfo.connect(lfoGain);
        lfoGain.connect(ambGain.gain);
        lfo.start();
        this.ambient = { osc: ambOsc, gain: ambGain, lfo, lfoGain };
        break;
      }
    }

    if (this.ambient) {
      this.ambient.osc.connect(this.ambient.gain);
      this.ambient.gain.connect(this.outputFilter!);
      this.ambient.osc.start();
    }
  }

  /** White noise source for sleep ambient */
  private _startNoiseLayer(ctx: AudioContext, filterHz: number, filterQ: number) {
    const bufferSize = ctx.sampleRate * 3;
    const buffer     = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop   = true;

    const noiseBp = ctx.createBiquadFilter();
    noiseBp.type = 'bandpass';
    noiseBp.frequency.value = filterHz;
    noiseBp.Q.value = filterQ;

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    noiseSource.connect(noiseBp);
    noiseBp.connect(this.noiseGain);
    this.noiseGain.connect(this.outputFilter!);
    noiseSource.start();
    this.noiseSource = noiseSource;
  }

  // ── Sonification update (called every animation frame) ───────────────────

  /**
   * Update breath modulation layer.
   * Uses smooth transitions:
   *   currentVolume = 0.9 * prev + 0.1 * target  (spec §6)
   *   currentPitch  = 0.9 * prev + 0.1 * target
   * Routes amplitude to lowpass filter cutoff for brightness modulation. (spec §8)
   */
  updateSonification(amplitude: number, mode: CreateSessionMode, enabled: boolean) {
    if (!this.audioCtx || !this.masterGain) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const cfg = MODES[mode];

    if (!enabled) {
      this.masterGain.gain.setTargetAtTime(0, now, 0.15);
      return;
    }

    // Smooth transitions (spec §6)
    const targetVolume = Math.min(0.28, amplitude * 0.35 + 0.04);
    const targetPitch  = cfg.baseHz + amplitude * 200;
    this.currentVolume = 0.9 * this.currentVolume + 0.1 * targetVolume;
    this.currentPitch  = 0.9 * this.currentPitch  + 0.1 * targetPitch;

    // Breath oscillator
    this.breathOsc?.frequency.setTargetAtTime(this.currentPitch, now, 0.06);
    this.breathGain?.gain.setTargetAtTime(this.currentVolume, now, 0.06);

    // Harmonic layer: quieter
    this.harmonic?.osc.frequency.setTargetAtTime(this.currentPitch * 1.5, now, 0.08);
    this.harmonic?.gain.gain.setTargetAtTime(this.currentVolume * 0.3, now, 0.08);

    // Ambient layer volume (slightly lower)
    this.ambient?.gain.gain.setTargetAtTime(this.currentVolume * 0.5, now, 0.12);

    // Noise layer (sleep mode)
    this.noiseGain?.gain.setTargetAtTime(this.currentVolume * 0.4, now, 0.12);

    // Lowpass filter cutoff brightness modulation (spec §8)
    // Inhale → brighter (higher cutoff), exhale → darker
    const filterTarget = 500 + amplitude * 1200;
    this.outputFilter?.frequency.setTargetAtTime(filterTarget, now, 0.1);

    // Master output
    this.masterGain.gain.setTargetAtTime(1, now, 0.05);
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  private _teardownSoundLayers() {
    const safeStop = (n: AudioNode & { stop?: () => void } | null) => {
      try { n?.stop?.(); } catch {}
      n?.disconnect();
    };

    safeStop(this.breathOsc);   this.breathOsc = null;
    this.breathGain?.disconnect(); this.breathGain = null;

    safeStop(this.harmonic?.osc);
    this.harmonic?.gain.disconnect();
    this.harmonic = null;

    safeStop(this.ambient?.lfo);
    this.ambient?.lfoGain?.disconnect();
    safeStop(this.ambient?.osc);
    this.ambient?.gain.disconnect();
    this.ambient = null;

    safeStop(this.noiseSource); this.noiseSource = null;
    this.noiseGain?.disconnect(); this.noiseGain = null;

    this.outputFilter?.disconnect(); this.outputFilter = null;
    this.masterGain?.disconnect();   this.masterGain = null;
  }

  /**
   * Fade out sound gracefully then stop (spec §7).
   */
  stopOscillator() {
    if (!this.audioCtx || !this.masterGain) {
      this._teardownSoundLayers();
      return;
    }
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Gentle 0.6s fade-out (spec §7)
    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.6);

    setTimeout(() => this._teardownSoundLayers(), 700);
  }

  stopMicAndSound() {
    this.stopMic();
    this.stopOscillator();
  }
}
