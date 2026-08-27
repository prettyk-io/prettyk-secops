/**
 * VideoTrack (F-6) — noVNC → <video> seamless switch.
 *
 * Shows Webswing noVNC iframe during live, switches to <video>
 * when RECORDING_FINALIZED arrives. <video> starts at currentTime
 * of the timeline, not from 0. Same dimensions, same background.
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import { useExecutionStore } from './useExecutionStore';

interface VideoTrackProps {
  className?: string;
}

export function VideoTrack({ className = '' }: VideoTrackProps) {
  const video = useExecutionStore((s) => s.video);
  const recordingUrl = useExecutionStore((s) => s.recordingUrl);
  const currentTime = useExecutionStore((s) => s.currentTime);
  const isPlaying = useExecutionStore((s) => s.isPlaying);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  // Sync video playback with master playhead
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !recordingUrl || video.source !== 'recording') return;
    if (isPlaying) {
      const play = async () => { try { await el.play(); } catch { /* user gesture needed */ } };
      play();
    } else {
      el.pause();
    }
    // Sync time
    if (Math.abs(el.currentTime - currentTime) > 0.3) {
      el.currentTime = currentTime;
    }
  }, [isPlaying, currentTime, video.source, recordingUrl]);

  // Seek when scrubbing
  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (el) el.currentTime = time;
  }, []);

  // Expose seek to store
  useEffect(() => {
    const orig = useExecutionStore.getState().seek;
    // wrap seek to also sync video
    const store = useExecutionStore;
  }, []);

  if (video.source === 'placeholder') {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ background: '#0F172A' }}>
        <span className="text-xs text-slate-600">Запись формируется</span>
      </div>
    );
  }

  if (video.source === 'recording' && recordingUrl) {
    return (
      <video
        ref={videoRef}
        src={recordingUrl}
        className={`object-contain ${className}`}
        style={{ background: '#000', width: '100%', height: '100%' }}
        preload="auto"
        onLoadedMetadata={() => {
          const el = videoRef.current;
          if (el) el.currentTime = currentTime;
          setReady(true);
        }}
        controls={false}
        muted
      />
    );
  }

  // noVNC — Webswing iframe
  if (video.source === 'novnc' && video.novncUrl) {
    return (
      <iframe
        src={video.novncUrl}
        className={`border-0 ${className}`}
        style={{ background: '#000', width: '100%', height: '100%' }}
        allow="autoplay"
      />
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`} style={{ background: '#0F172A' }}>
      <span className="text-xs text-slate-600">Нет источника видео</span>
    </div>
  );
}