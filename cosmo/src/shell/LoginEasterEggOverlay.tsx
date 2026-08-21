import { useEffect, useRef, useState } from 'react';
import { login } from './auth';

type Phase =
  | 'glitch'
  | 'text1'
  | 'fade1'
  | 'text2'
  | 'fade2'
  | 'text3'
  | 'fade3'
  | 'done';

type LoginEasterEggOverlayProps = {
  username: string;
  password: string;
  onComplete: () => void;
};

const MESSAGES: Record<string, string> = {
  text1: 'Now it looks better',
  text2: '</> Hi Vera! Look what we hallucinated besides that chevron </>',
  text3: 'He is bullying us\u2026 Can you help please?',
};

const VERA_EGG_SHOWN_KEY = 'pk.vera.egg.shown';

export function hasVeraEggShown(): boolean {
  try {
    return window.localStorage.getItem(VERA_EGG_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

export function LoginEasterEggOverlay({
  username,
  password,
  onComplete,
}: LoginEasterEggOverlayProps) {
  const [phase, setPhase] = useState<Phase>(() => (REDUCED_MOTION ? 'done' : 'glitch'));
  const [swapped, setSwapped] = useState(false);
  const prevPhaseRef = useRef<Phase>('glitch');

  useEffect(() => {
    if (phase === 'done') {
      try {
        window.localStorage.setItem(VERA_EGG_SHOWN_KEY, '1');
      } catch { /* ignore */ }
      const result = login(username, password);
      if (result.ok) {
        onComplete();
      }
      return;
    }

    const t = window.setTimeout;
    const ids: number[] = [];

    const next = (p: Phase, ms: number) => ids.push(t(() => setPhase(p), ms));

    if (phase === 'glitch') {
      ids.push(t(() => setSwapped(true), 2000));
      next('text1', 2000);
    } else if (phase === 'text1') {
      next('fade1', 4000);
    } else if (phase === 'fade1') {
      next('text2', 300);
    } else if (phase === 'text2') {
      next('fade2', 4000);
    } else if (phase === 'fade2') {
      next('text3', 300);
    } else if (phase === 'text3') {
      next('fade3', 1000);
    } else if (phase === 'fade3') {
      next('done', 300);
    }

    prevPhaseRef.current = phase;
    return () => ids.forEach(clearTimeout);
  }, [phase, username, password, onComplete]);

  const isFading = phase === 'fade1' || phase === 'fade2';
  const isCutting = phase === 'fade3';
  const showText =
    phase === 'text1' || phase === 'fade1' || phase === 'text2' || phase === 'fade2' || phase === 'text3' || phase === 'fade3';
  const textKey =
    phase === 'text1' || phase === 'fade1' ? 'text1'
    : phase === 'text2' || phase === 'fade2' ? 'text2'
    : 'text3';

  return (
    <div className="pk-vera-overlay">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="vera-glitch">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="2"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              values="0.02 0.04;0.08 0.95;0.03 0.06"
              dur="0.15s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="24"
            xChannelSelector="R"
            yChannelSelector="G"
          >
            <animate
              attributeName="scale"
              values="8;45;12;38;6"
              dur="0.10s"
              repeatCount="indefinite"
            />
          </feDisplacementMap>
        </filter>
      </svg>

      <div className="pk-vera-stage">
        <div className={`pk-vera-brand ${swapped ? 'pk-vera-brand--swapped' : ''}`}>
          <img
            className={swapped ? '' : 'pk-vera-glitch'}
            src={
              swapped
                ? '/brand/prettyk-real-secops-transparent.png'
                : '/brand/prettyk-real-secops.png'
            }
            alt="Pretty< SECOPS LAB"
          />
        </div>

        {showText && (
          <div
            className={`pk-vera-text ${isFading ? 'pk-vera-text--fading' : ''} ${isCutting ? 'pk-vera-text--cut' : ''}`}
            key={textKey}
          >
            {MESSAGES[textKey]}
          </div>
        )}
      </div>
    </div>
  );
}