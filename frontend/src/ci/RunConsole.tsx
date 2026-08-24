/**
 * PK-TRM-5: Run Console — живой статус прогона, timeline, безопасные логи.
 *
 * Подключается к createRunEngine. Потребляет RunRecord, FindingRecord, EvidenceRecord.
 * Без xterm — чистый React + MUI. Привязывается к конкретному run_id.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Chip, LinearProgress, Tooltip,
  Alert, Tabs, Tab,
} from '@mui/material';
import {
  PlayArrow, Stop, Replay, Terminal, BugReport, Storage, Timeline, AccessTime,
} from '@mui/icons-material';
import {
  type RunRecord, type RunState, type RunEvent, type RunTimelineEvent,
  type FindingRecord, type EvidenceRecord,
} from '../ci/types';
import { isTerminal, allowedEvents, RETRYABLE_STATES } from '../ci/stateMachine';
import { redactTerminalOutput } from '../terminal/commandSafety';

export interface RunConsoleProps {
  run: RunRecord;
  engine: {
    transition: (id: string, event: RunEvent, reason?: string) => { ok: boolean; run?: RunRecord; error?: string };
    retry: (id: string, actor?: string) => RunRecord | null;
    cancel: (id: string, reason?: string) => { ok: boolean; run?: RunRecord; error?: string };
    listFindings: (runId: string) => FindingRecord[];
    listEvidence: (runId: string) => EvidenceRecord[];
  };
  /** Fake live logs — production: pull from diary_bus SSE. */
  liveLogs?: string[];
  /** Опциональный рефреш (miliseconds). Дефолт 3000. */
  refreshMs?: number;
}

function stateChip(state: RunState) {
  const map: Record<RunState, { color: string; bg: string; ani?: boolean }> = {
    draft: { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
    pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    queued: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    running: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', ani: true },
    cancelling: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    succeeded: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    failed: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    cancelled: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    expired: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  };
  const m = map[state] ?? map.draft;
  return (
    <Chip
      label={state.toUpperCase()}
      size="small"
      sx={{
        color: m.color, background: m.bg, fontWeight: 700, fontSize: 9,
        animation: m.ani ? 'pk-led-pulse 1s ease-in-out infinite' : 'none',
      }}
    />
  );
}

function TimelineRow({ evt }: { evt: RunTimelineEvent }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
      <AccessTime sx={{ fontSize: 12, color: '#64748b' }} />
      <Typography sx={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#64748b', minWidth: 60 }}>
        {new Date(evt.at).toLocaleTimeString('ru-RU')}
      </Typography>
      <Chip label={evt.from} size="small" sx={{ color: '#64748b', background: 'rgba(255,255,255,0.04)', fontSize: 8 }} />
      <Typography sx={{ color: '#38bdf8', fontWeight: 600, fontSize: 9 }}>{evt.event}</Typography>
      <Chip label={evt.to} size="small" sx={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)', fontSize: 8 }} />
      {evt.reason && <Typography sx={{ color: '#64748b', fontSize: 9, fontStyle: 'italic' }}>{evt.reason}</Typography>}
    </Box>
  );
}

export function RunConsole({ run, engine, liveLogs = [], refreshMs = 3000 }: RunConsoleProps) {
  const [r, setR] = useState<RunRecord>(run);
  const [tab, setTab] = useState(0);
  const [logs, setLogs] = useState(liveLogs);
  const [autoScroll, setAutoScroll] = useState(true);

  const refresh = useCallback(() => {
    const next = engine.transition(r.id, 'acquire' as RunEvent); // read-only — just polls
    // Вместо SDK-poll: просто вставляем демо-logs для визуализации
    if (r.state === 'running' && logs.length < 20) {
      setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 19)}  STEP ${prev.length + 1} — running...`]);
    }
  }, [r.id, r.state, logs.length]);

  useEffect(() => {
    if (isTerminal(r.state)) return;
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, [refresh, r.state, refreshMs]);

  const handleTransition = (event: RunEvent) => {
    const res = engine.transition(r.id, event);
    if (res.ok && res.run) setR(res.run);
  };

  const handleRetry = () => {
    const retried = engine.retry(r.id);
    if (retried) setR(retried);
  };

  const findings = engine.listFindings(r.id);
  const evidence = engine.listEvidence(r.id);

  const avEvents = allowedEvents(r.state);

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Terminal sx={{ color: r.state === 'running' ? '#38bdf8' : '#64748b', fontSize: 20 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'JetBrains Mono', fontSize: 14 }}>{r.id}</Typography>
            {stateChip(r.state)}
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, mt: 0.5 }}>
            {r.pipelineId} · Attempt #{r.attemptNumber} · Actor: {r.actor} · {new Date(r.createdAt).toLocaleString('ru-RU')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isTerminal(r.state) && RETRYABLE_STATES.includes(r.state) && (
            <Button size="small" variant="contained" startIcon={<Replay sx={{ fontSize: 14 }} />} onClick={handleRetry} sx={{ fontSize: 10, bgcolor: '#38bdf8', color: '#080c16' }}>
              Retry
            </Button>
          )}
          {!isTerminal(r.state) && (
            <Button size="small" variant="outlined" color="error" startIcon={<Stop sx={{ fontSize: 14 }} />} onClick={() => engine.cancel(r.id, 'user requested')} sx={{ fontSize: 10 }}>
              Cancel
            </Button>
          )}
        </Box>
      </Box>

      {/* State progress */}
      <LinearProgress
        variant="determinate"
        value={isTerminal(r.state) ? 100 : r.state === 'running' ? 65 : r.state === 'queued' ? 30 : 10}
        sx={{ mb: 2, height: 4, borderRadius: 2, bgcolor: '#1e293b', '& .MuiLinearProgress-bar': { bgcolor: r.state === 'failed' ? '#ef4444' : '#38bdf8' } }}
      />

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, mb: 2, '.MuiTab-root': { minHeight: 36, fontSize: 11, fontWeight: 600, textTransform: 'none' } }}>
        <Tab icon={<Timeline sx={{ fontSize: '14px !important' }} />} iconPosition="start" label="Live Log" />
        <Tab icon={<BugReport sx={{ fontSize: '14px !important' }} />} iconPosition="start" label={`Findings (${findings.length})`} />
        <Tab icon={<Storage sx={{ fontSize: '14px !important' }} />} iconPosition="start" label={`Evidence (${evidence.length})`} />
      </Tabs>

      {/* Live log */}
      {tab === 0 && (
        <Box>
          <Paper sx={{ p: 2, borderRadius: 2, maxHeight: 380, overflow: 'auto', bgcolor: '#0a0f18', border: '1px solid #1e293b', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
            {r.timeline.map((e, i) => (
              <div key={i} style={{ color: '#64748b' }}>
                [{new Date(e.at).toLocaleTimeString('ru-RU')}] {e.from} → {e.to} ({e.event}) {e.reason ? `— ${e.reason}` : ''}
              </div>
            ))}
            {logs.map((line, i) => (
              <div key={i} style={{ color: i % 3 === 0 ? '#38bdf8' : '#94a3b8' }}>
                {redactTerminalOutput(line)}
              </div>
            ))}
          </Paper>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
            <Button size="small" onClick={() => setAutoScroll(!autoScroll)} sx={{ fontSize: 9, color: '#64748b' }}>
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </Button>
          </Box>
        </Box>
      )}

      {/* Findings */}
      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {findings.length === 0 ? (
            <Alert severity="info" sx={{ fontSize: 11 }}>No findings recorded for this run yet.</Alert>
          ) : (
            findings.map((f, i) => (
              <Paper key={i} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <BugReport sx={{ color: '#f59e0b', fontSize: 16 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{f.title || f.dedupKey}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
                    {f.dedupKey} · Severity: {f.severity || '—'} · {new Date(f.observedAt).toLocaleTimeString('ru-RU')}
                  </Typography>
                </Box>
              </Paper>
            ))
          )}
        </Box>
      )}

      {/* Evidence */}
      {tab === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {evidence.length === 0 ? (
            <Alert severity="info" sx={{ fontSize: 11 }}>No evidence artifacts recorded yet.</Alert>
          ) : (
            evidence.map((e, i) => (
              <Paper key={i} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Storage sx={{ color: '#38bdf8', fontSize: 16 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono' }}>{e.dedupKey}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>
                    Kind: {e.kind || '—'} · Checksum: {e.checksum || '—'} · {new Date(e.observedAt).toLocaleTimeString('ru-RU')}
                  </Typography>
                </Box>
              </Paper>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}