/**
 * Индикатор data_playground /api/health (G-валидатор конструкторов).
 */
import { useEffect, useState } from 'react';
import { Badge, Tooltip } from 'antd';
import {
  fetchPlaygroundHealth,
  type PlaygroundHealth,
} from '../api/playgroundHealth';

const POLL_MS = 15_000;

function tip(status: PlaygroundHealth): string {
  if (status === 'up') {
    return 'Playground бэкенд (:8765) подключён и работает онлайн';
  }
  if (status === 'down') {
    return 'Playground бэкенд оффлайн (некритично: браузерная валидация работает автономно)';
  }
  return 'Проверка связи с playground бэкендом…';
}

export function PlaygroundHealthBadge(): React.JSX.Element {
  const [status, setStatus] = useState<PlaygroundHealth>('unknown');

  useEffect(() => {
    let cancelled = false;
    const tick = (): void => {
      void fetchPlaygroundHealth().then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  let badgeStatus: 'success' | 'error' | 'processing' = 'processing';
  if (status === 'up') {
    badgeStatus = 'success';
  } else if (status === 'down') {
    badgeStatus = 'error';
  }

  let badgeText = 'PLAYGROUND…';
  if (status === 'up') {
    badgeText = 'PLAYGROUND ONLINE';
  } else if (status === 'down') {
    badgeText = 'PLAYGROUND OFFLINE';
  }

  return (
    <Tooltip title={tip(status)}>
      <span className="pk-playground-health" style={{ cursor: 'pointer', userSelect: 'none' }}>
        <Badge status={badgeStatus} text={badgeText} />
      </span>
    </Tooltip>
  );
}
