import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CreateSessionMode, useCreateSession } from "@workspace/api-client-react";
import { useUserId } from '../hooks/use-user-id';
import { MODES } from '../lib/waveEngine';
import { SoundEngine } from '../lib/soundEngine';
import { BreathDetector, BreathState } from '../lib/breathDetection';
import { BreathVisualizer } from '../components/BreathVisualizer';
import { StatsPanel } from '../components/StatsPanel';
import { FeedbackModal } from '../components/FeedbackModal';
import { Volume2, VolumeX, Play, Square, Wind } from 'lucide-react';
import { formatTime } from '../lib/utils';
import { useToast } from '../hooks/use-toast';

// Singleton engines — persist across renders
const soundEngine = new SoundEngine();
const breathDetector = new BreathDetector();

export default function Home() {
  const userId = useUserId();
  const { mutate: createSession, isPending: isCreatingSession } = useCreateSession();
  const { toast } = useToast();

  const [mode, setMode] = useState<CreateSessionMode>('focus');
  const [isActive, setIsActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [amplitude, setAmplitude] = useState(0);
  const [breathState, setBreathState] = useState<BreathState>('hold');
  const [sessionTimer, setSessionTimer] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  const soundEnabledRef = useRef(soundEnabled);
  const modeRef = useRef(mode);
  const isActiveRef = useRef(isActive);
  soundEnabledRef.current = soundEnabled;
  modeRef.current = mode;
  isActiveRef.current = isActive;

  // Animation loop — reads mic, smooths amplitude, detects state, updates sonification
  useEffect(() => {
    let rafId: number;

    const loop = () => {
      if (isActiveRef.current) {
        const raw = soundEngine.getRawAmplitude();
        const { state, smoothed } = breathDetector.update(raw);
        setAmplitude(smoothed);
        setBreathState(state);
        soundEngine.updateSonification(smoothed, modeRef.current, soundEnabledRef.current);
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Session timer
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setSessionTimer(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const handleStartSession = useCallback(async () => {
    breathDetector.reset();
    const ok = await soundEngine.startMic();
    if (!ok) {
      toast({
        title: "Microphone required",
        description: "Please allow microphone access to analyze your breath.",
        variant: "destructive",
      });
      return;
    }
    soundEngine.startOscillator(mode);
    setStartedAt(new Date().toISOString());
    setSessionTimer(0);
    setIsActive(true);
  }, [mode, toast]);

  const handleEndSession = useCallback(() => {
    setIsActive(false);
    soundEngine.stopMicAndSound();

    if (startedAt && sessionTimer > 5) {
      const endedAt = new Date().toISOString();
      createSession(
        { data: { userId, mode, startedAt, endedAt, durationSeconds: sessionTimer } },
        {
          onSuccess: (session) => {
            setCurrentSessionId(session.id);
            setShowFeedback(true);
          },
          onError: () => {
            toast({
              title: "Could not save session",
              description: "Your session wasn't saved, but great job practicing!",
              variant: "destructive",
            });
          },
        }
      );
    } else {
      toast({ title: "Session too short", description: "Session wasn't saved (less than 5 seconds)." });
    }
    setStartedAt(null);
  }, [startedAt, sessionTimer, userId, mode, createSession, toast]);

  const bgImage = `${import.meta.env.BASE_URL}images/hero-bg.png`;

  return (
    <div
      className="min-h-screen relative w-full flex flex-col"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="absolute inset-0 bg-background/80 z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 max-w-6xl mx-auto w-full px-4 py-8 md:py-12">

        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <Wind className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={{ color: 'hsl(186 79% 60%)' }}>RespiraLoop</h1>
              <p className="text-xs text-muted-foreground tracking-widest uppercase">Breath-Driven Biofeedback</p>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-1 p-1.5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(Object.entries(MODES) as [CreateSessionMode, typeof MODES[CreateSessionMode]][]).map(([m, cfg]) => (
              <button
                key={m}
                onClick={() => !isActive && setMode(m)}
                disabled={isActive}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  mode === m ? 'bg-white text-background shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                } ${isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </header>

        {/* Mode description */}
        <p className="text-center text-sm text-muted-foreground mb-4">
          {MODES[mode].description}
        </p>

        {/* Visualizer */}
        <main className="flex-1 flex flex-col items-center gap-10 w-full">
          <div className="w-full">
            <BreathVisualizer
              mode={mode}
              isActive={isActive}
              amplitude={amplitude}
              breathState={breathState}
            />
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-5">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setSoundEnabled(s => !s)}
                className={`p-4 rounded-full transition-all border border-white/10 ${soundEnabled ? 'bg-white/10 text-primary' : 'bg-transparent text-muted-foreground'} hover:bg-white/20 hover:scale-105 active:scale-95`}
                title={soundEnabled ? "Disable Sound" : "Enable Sound"}
              >
                {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </button>

              {!isActive ? (
                <button
                  onClick={handleStartSession}
                  className="px-10 py-5 rounded-full text-white font-bold text-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                  style={{ background: 'linear-gradient(135deg, hsl(186 79% 44%), #3B82F6)', boxShadow: '0 0 30px rgba(20,184,166,0.3)' }}
                >
                  <Play className="w-6 h-6 fill-current" />
                  Start Session
                </button>
              ) : (
                <button
                  onClick={handleEndSession}
                  disabled={isCreatingSession}
                  className="px-10 py-5 rounded-full text-white font-bold text-xl hover:bg-white/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 backdrop-blur-md"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  {isCreatingSession
                    ? <span className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    : <Square className="w-6 h-6 fill-current" />
                  }
                  End Session
                </button>
              )}
            </div>

            <div className="text-4xl font-light tabular-nums" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {formatTime(sessionTimer)}
            </div>
          </div>
        </main>
      </div>

      <StatsPanel />

      {currentSessionId && (
        <FeedbackModal
          sessionId={currentSessionId}
          isOpen={showFeedback}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
