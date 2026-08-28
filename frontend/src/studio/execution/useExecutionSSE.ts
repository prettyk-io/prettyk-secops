/**
 * Execution SSE bridge — consumes /api/diary?channel=all
 * Buffers last 500 events, exposes raw + derived lists.
 */
import { useEffect, useMemo, useState } from 'react';
import { LIVE_BASE } from '../../api/apiBase';
import type { DiaryEvent, LogEntry, TimelineMarker } from './types';

function buildId(seq: number, ts: number): string {
  return `evt-${seq}-${Math.round(ts * 1000)}`;
}

let _globalSeq = 0;

function classifyChannel(kind: string): 'system' | 'security' {
  if (kind === 'scanner' || kind === 'HIGH' || kind === 'FUZZ' || kind === 'GATE') return 'security';
  return 'system';
}

function classifySeverity(kind: string): LogEntry['severity'] {
  if (kind === 'HIGH' || kind === 'ERROR' || kind === 'FAIL' || kind === 'FAILED') return 'high';
  if (kind === 'WARN' || kind === 'WARNING') return 'medium';
  if (kind === 'GATE') return 'critical';
  if (kind === 'FUZZ' || kind === 'SCAN') return 'low';
  return 'info';
}

export interface ExecutionEventStream {
  events: DiaryEvent[];
  logs: LogEntry[];
  markers: TimelineMarker[];
  latestTs: number;
}

export function useExecutionSSE(): ExecutionEventStream {
  const [events, setEvents] = useState<DiaryEvent[]>([]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`${LIVE_BASE}/api/diary?channel=all`);
    const onMessage = (message: MessageEvent<string>) => {
      try {
        const raw: unknown = JSON.parse(message.data);
        if (!raw || typeof raw !== 'object') return;
        const obj = raw as Record<string, unknown>;
        const event: DiaryEvent = {
          event_id: String(obj.event_id ?? `evt-${++_globalSeq}`),
          channel: (obj.channel as DiaryEvent['channel']) ?? 'diary',
          kind: (obj.kind as DiaryEvent['kind']) ?? 'INFO',
          text: String(obj.text ?? obj.pretty ?? ''),
          ts: typeof obj.ts === 'number' ? obj.ts : Date.now() / 1000,
          run_id: typeof obj.run_id === 'string' ? obj.run_id : undefined,
        };
        setEvents((prev) => [...prev, event].slice(-500));
      } catch { /* partial line */ }
    };
    source.addEventListener('message', onMessage);
    return () => { source.removeEventListener('message', onMessage); source.close(); };
  }, []);

  const logs: LogEntry[] = useMemo(() => events.map((e, i) => ({
    id: buildId(i, e.ts),
    ts: e.ts,
    kind: e.kind,
    channel: classifyChannel(e.kind),
    text: e.text,
    severity: classifySeverity(e.kind),
  })), [events]);

  const markers: TimelineMarker[] = useMemo(() => events
    .filter((e) => {
      const k = e.kind;
      return k === 'STEP' || k === 'FUZZ' || k === 'HIGH' || k === 'ERROR' || k === 'FAIL' || k === 'GATE';
    })
    .map((e) => {
      let mk: TimelineMarker['kind'] = 'step';
      if (e.kind === 'FUZZ') mk = 'fuzz';
      else if (e.kind === 'HIGH' || e.kind === 'GATE') mk = 'alert';
      else if (e.kind === 'ERROR' || e.kind === 'FAIL') mk = 'error';
      return { ts: e.ts, kind: mk, label: e.text.slice(0, 60), eventId: e.event_id };
    }), [events]);

  const latestTs = events.length > 0 ? events[events.length - 1]!.ts : 0;

  return { events, logs, markers, latestTs };
}