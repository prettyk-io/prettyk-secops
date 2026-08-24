import { useEffect, useRef } from 'react';

const MEDIA_BASE = `${import.meta.env.BASE_URL}media/`;
const BG_POSTER = `${MEDIA_BASE}login-bg-poster.webp`;
const BG_WEBM = `${MEDIA_BASE}login-bg.webm`;
const BG_MP4 = `${MEDIA_BASE}login-bg.mp4`;

/** Фоновое видео логина — home / history / admin (хедер поверх). */
export function ShellAmbientVideo(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let cancelled = false;
    const kick = () => {
      if (cancelled) {
        return;
      }
      video.load();
      void Promise.resolve(video.play()).catch(() => undefined);
    };
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const ric = window.requestIdleCallback;
    if (typeof ric === 'function') {
      idleId = ric(kick, { timeout: 900 });
    } else {
      timeoutId = window.setTimeout(kick, 120);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className="pk-shell-bg-video"
      poster={BG_POSTER}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="shell-ambient-video"
    >
      <source src={BG_WEBM} type="video/webm" />
      <source src={BG_MP4} type="video/mp4" />
    </video>
  );
}
