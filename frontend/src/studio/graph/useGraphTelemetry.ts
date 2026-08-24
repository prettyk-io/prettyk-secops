import { useEffect, useState } from 'react';
import { LIVE_BASE } from '../../api/apiBase';

export type GraphTelemetryEvent = {
  event_id: string;
  run_id: string;
  step_id?: string;
  seq: number;
  kind: string;
  status: string;
  occurred_at: string;
  duration_ms?: number | null;
  facts?: Record<string, unknown>;
  evidence_refs?: string[];
  trust?: 'deterministic' | 'derived' | 'hypothesis' | string;
};

function isTelemetryEvent(value: unknown): value is GraphTelemetryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<GraphTelemetryEvent>;
  return typeof event.event_id === 'string'
    && typeof event.run_id === 'string'
    && typeof event.kind === 'string'
    && typeof event.status === 'string';
}

export function useGraphTelemetry(maxAgeMs = 30_000): GraphTelemetryEvent[] {
  const [received, setReceived] = useState<GraphTelemetryEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(`${LIVE_BASE}/api/diary?channel=telemetry`);
    const onMessage = (message: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (!isTelemetryEvent(parsed)) return;
        setReceived((current) => [...current, parsed].slice(-200));
      } catch {
        // Live can contain a partial line while the NDJSON file is being written.
      }
    };
    source.addEventListener('message', onMessage);
    return () => {
      source.removeEventListener('message', onMessage);
      source.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  return received.filter((event) => {
    const timestamp = Date.parse(event.occurred_at);
    return Number.isFinite(timestamp) && now - timestamp <= maxAgeMs;
  });
}
