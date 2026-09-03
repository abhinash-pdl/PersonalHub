'use client';

import React, { useEffect, useRef } from 'react';
import { useMusicPlayer } from '@/contexts/MusicContext';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from '@/components/icons';

function formatTime(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function MusicProgress() {
  const { duration, seek, subscribeProgress } = useMusicPlayer();
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const currentLabelRef = useRef<HTMLSpanElement>(null);
  const durationLabelRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef(duration);

  useEffect(() => {
    durationRef.current = duration;
    if (durationLabelRef.current) {
      durationLabelRef.current.textContent = formatTime(duration);
    }
  }, [duration]);

  useEffect(() => {
    return subscribeProgress((time, total) => {
      const d = total || durationRef.current;
      const progress = d > 0 ? Math.min((time / d) * 100, 100) : 0;
      if (fillRef.current) fillRef.current.style.width = `${progress}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${progress}%`;
      if (currentLabelRef.current) {
        currentLabelRef.current.textContent = formatTime(time);
      }
    });
  }, [subscribeProgress]);

  return (
    <div className="music-progress">
      <span className="progress-time" ref={currentLabelRef}>
        0:00
      </span>
      <div
        className="progress-track"
        onClick={(e) => {
          const d = durationRef.current;
          if (!d) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(Math.max(0, Math.min(d * ratio, d)));
        }}
      >
        <div className="progress-fill" ref={fillRef} style={{ width: '0%' }} />
        <div className="progress-thumb" ref={thumbRef} style={{ left: '0%' }} />
      </div>
      <span className="progress-time" ref={durationLabelRef}>
        {formatTime(duration)}
      </span>
    </div>
  );
}

const REPEAT_LABEL: Record<string, string> = {
  all: 'Repeat all (loop playlist)',
  one: 'Repeat one (loop current track)',
  off: 'Repeat off',
};

const REPEAT_ICON: Record<string, string> = {
  all: '🔁',
  one: '🔂',
  off: '🔁',
};

export default function MusicBar() {
  const { currentTrack, isPlaying, togglePlay, prev, next, repeatMode, cycleRepeat } = useMusicPlayer();

  if (!currentTrack) return null;

  return (
    <div className="music-bar">
      <div className="music-info">
        <div className="music-thumb">♪</div>
        <div className="music-meta">
          <p>{currentTrack.title}</p>
          <span>{currentTrack.artist || 'Unknown Artist'}</span>
        </div>
      </div>

      <div className="music-controls">
        <button type="button" className="ctrl-btn" title="Previous" onClick={prev}>
          <PrevIcon />
        </button>
        <button type="button" className="ctrl-btn play" title="Play/Pause" onClick={togglePlay}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="ctrl-btn" title="Next" onClick={next}>
          <NextIcon />
        </button>
        <button
          type="button"
          className="ctrl-btn"
          title={REPEAT_LABEL[repeatMode]}
          aria-label={REPEAT_LABEL[repeatMode]}
          aria-pressed={repeatMode !== 'off'}
          onClick={cycleRepeat}
          style={repeatMode === 'off' ? { opacity: 0.45 } : undefined}
        >
          <span aria-hidden="true" style={{ fontSize: '17px', lineHeight: 1 }}>{REPEAT_ICON[repeatMode]}</span>
        </button>
      </div>

      <MusicProgress />
    </div>
  );
}
