import { CreateSessionMode } from "@workspace/api-client-react";

export interface ModeConfig {
  cycleDuration: number;
  baseHz: number;
  label: string;
  description: string;
}

export const MODES: Record<CreateSessionMode, ModeConfig> = {
  focus: {
    cycleDuration: 8,
    baseHz: 400,
    label: "Focus",
    description: "4s inhale / 4s exhale",
  },
  sleep: {
    cycleDuration: 14,
    baseHz: 200,
    label: "Sleep",
    description: "4s inhale / 2s hold / 8s exhale",
  },
  yoga: {
    cycleDuration: 16,
    baseHz: 330,
    label: "Yoga",
    description: "Box: 4s inhale / 4s hold / 4s exhale / 4s hold",
  },
  panic: {
    cycleDuration: 11,
    baseHz: 380,
    label: "Panic Calm",
    description: "2s inhale / 1s hold / 8s exhale",
  },
};

export type PhaseType = 'inhale' | 'hold' | 'exhale';

/**
 * Returns a normalized y value [0..1] for the reference wave at time t (seconds).
 * 0 = bottom (exhale complete), 1 = top (inhale complete)
 */
export function getReferenceY(t: number, mode: CreateSessionMode): { y: number; phase: PhaseType } {
  const cfg = MODES[mode];
  const cycle = t % cfg.cycleDuration;

  switch (mode) {
    case 'focus': {
      // y = 0.5 + 0.5 * sin(2π * cycle / 8)  — symmetric sine
      const y = 0.5 + 0.5 * Math.sin((2 * Math.PI * cycle) / cfg.cycleDuration);
      const phase: PhaseType = cycle < cfg.cycleDuration / 2 ? 'inhale' : 'exhale';
      return { y, phase };
    }

    case 'sleep': {
      // 4s inhale (ramp up), 2s hold, 8s exhale (ramp down)
      const IN = 4, HOLD = 2, OUT = 8;
      if (cycle < IN) {
        return { y: cycle / IN, phase: 'inhale' };
      } else if (cycle < IN + HOLD) {
        return { y: 1, phase: 'hold' };
      } else {
        const p = (cycle - IN - HOLD) / OUT;
        return { y: 1 - p, phase: 'exhale' };
      }
    }

    case 'yoga': {
      // Piecewise box breathing: 4s ramp up / 4s flat high / 4s ramp down / 4s flat low
      const PHASE = 4;
      if (cycle < PHASE) {
        return { y: cycle / PHASE, phase: 'inhale' };
      } else if (cycle < PHASE * 2) {
        return { y: 1, phase: 'hold' };
      } else if (cycle < PHASE * 3) {
        return { y: 1 - (cycle - PHASE * 2) / PHASE, phase: 'exhale' };
      } else {
        return { y: 0, phase: 'hold' };
      }
    }

    case 'panic': {
      // 2s inhale / 1s hold / 8s exhale
      const IN = 2, HOLD = 1, OUT = 8;
      if (cycle < IN) {
        return { y: cycle / IN, phase: 'inhale' };
      } else if (cycle < IN + HOLD) {
        return { y: 1, phase: 'hold' };
      } else {
        const p = (cycle - IN - HOLD) / OUT;
        return { y: 1 - p, phase: 'exhale' };
      }
    }
  }
}

/**
 * Returns the dot x-position as a fraction [0..1] of canvas width for the current time.
 */
export function getDotXFraction(t: number, mode: CreateSessionMode): number {
  const cfg = MODES[mode];
  return (t % cfg.cycleDuration) / cfg.cycleDuration;
}
