export type BreathState = 'inhale' | 'exhale' | 'hold';

// Spec-defined thresholds
const INHALE_THRESHOLD = 0.05;
const HOLD_THRESHOLD   = 0.02;

// Smoothing: 0.85 * prev + 0.15 * current (spec §2)
const PREV_WEIGHT    = 0.85;
const CURRENT_WEIGHT = 0.15;

// Hysteresis: minimum delta to switch away from hold
const DELTA_SENSITIVITY = 0.0008;

export class BreathDetector {
  private smoothedAmplitude = 0;
  private prevSmoothed      = 0;
  private state: BreathState = 'hold';
  // Hysteresis counter: don't switch state until we've seen N consistent samples
  private stateSamples = 0;
  private pendingState: BreathState = 'hold';

  update(rawAmplitude: number): { state: BreathState; smoothed: number } {
    this.smoothedAmplitude =
      PREV_WEIGHT * this.smoothedAmplitude + CURRENT_WEIGHT * rawAmplitude;

    const delta = this.smoothedAmplitude - this.prevSmoothed;
    this.prevSmoothed = this.smoothedAmplitude;

    // --- Determine candidate state ---
    let candidate: BreathState;
    if (this.smoothedAmplitude < HOLD_THRESHOLD) {
      candidate = 'hold';
    } else if (this.smoothedAmplitude > INHALE_THRESHOLD && delta > DELTA_SENSITIVITY) {
      candidate = 'inhale';
    } else if (delta < -DELTA_SENSITIVITY) {
      candidate = 'exhale';
    } else {
      candidate = this.state; // no change
    }

    // Hysteresis: require 3 consecutive samples of same candidate before switching
    if (candidate === this.pendingState) {
      this.stateSamples++;
      if (this.stateSamples >= 3) {
        this.state = candidate;
      }
    } else {
      this.pendingState = candidate;
      this.stateSamples = 1;
    }

    return { state: this.state, smoothed: this.smoothedAmplitude };
  }

  reset() {
    this.smoothedAmplitude = 0;
    this.prevSmoothed      = 0;
    this.state             = 'hold';
    this.stateSamples      = 0;
    this.pendingState      = 'hold';
  }
}
