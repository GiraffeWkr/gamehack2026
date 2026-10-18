import { useEffect, useRef, useState } from 'react';
import { audio } from '../../game/engine/audio';
import { PixelIcon } from './PixelIcon';

const TRACK_LABEL: Record<string, string> = {
  menu: '标题',
  hub: '舰桥',
  battle: '战斗',
  boss: '首领',
};

const STATE_LABEL: Record<string, string> = {
  running: '音频运行中',
  suspended: '等待交互',
  uninitialized: '音频待启动',
  closed: '音频已关闭',
};

export function AudioMeter({
  compact = false,
  showLabel = true,
  className = '',
}: {
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState(() => audio.getStatus());
  const barsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = audio.getStatus();
      setStatus((current) =>
        current.state === next.state &&
        current.intensity === next.intensity &&
        Math.abs(current.level - next.level) < 0.02
          ? current
          : next,
      );
      const level = audio.getLevel();
      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const factor = 0.42 + (i / Math.max(1, bars.length - 1)) * 0.78;
          const value = Math.max(0.12, Math.min(1, level * factor * 1.9));
          (bars[i] as HTMLElement).style.transform = `scaleY(${value})`;
        }
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  const stateLabel = STATE_LABEL[status.state] ?? '音频待启动';
  const trackLabel = TRACK_LABEL[status.intensity] ?? status.intensity;
  const initialized = status.state !== 'uninitialized';

  return (
    <div
      className={`audio-meter ${compact ? 'audio-meter--compact' : ''} ${status.state === 'running' ? 'is-on' : ''} ${className}`}
      title={
        initialized
          ? `音频引擎：${stateLabel} · BGM：${trackLabel} · 点击设置调整音量`
          : '点击任意按钮或画面启动音频引擎'
      }
      aria-label={`${stateLabel}，背景音乐：${trackLabel}`}
      data-audio-state={status.state}
      data-audio-track={status.intensity}
      data-audio-level={status.level.toFixed(2)}
    >
      <PixelIcon name="music" size={compact ? 13 : 16} />
      <div className="audio-meter__bars" ref={barsRef} aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      {showLabel ? (
        <span className="audio-meter__label">
          {status.state === 'running'
            ? compact
              ? `BGM · ${trackLabel}`
              : `${stateLabel} · ${trackLabel}`
            : stateLabel}
        </span>
      ) : null}
    </div>
  );
}
