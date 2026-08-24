/** F-5: RunsHistoryView — chronological scan run history. */
import { useMemo } from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { History, OpenInNew, VerifiedUser, GppBad, Cancel, AccessTime, PlayArrow } from '@mui/icons-material';
import { useSecopsStore, runStatusColor, gateVerdictColor, type SecOpsRun, type RunStatus } from '../useSecopsStore';

function statusIcon(s: RunStatus) {
  const sx = { fontSize: 16, color: runStatusColor(s) };
  if (s === 'running') return <PlayArrow sx={sx} />;
  if (s === 'passed') return <VerifiedUser sx={sx} />;
  if (s === 'failed') return <Cancel sx={sx} />;
  if (s === 'cancelled') return <AccessTime sx={sx} />;
  return <GppBad sx={sx} />;
}

function RunRow({ r }: { r: SecOpsRun }) {
  const isRunning = r.status === 'running';
  const sc = runStatusColor(r.status);
  const gc = gateVerdictColor(r.gate);

  return (
    <Paper
      sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', '&:hover': { borderColor: sc } }}
      onClick={() => { window.location.hash = `#/checks/${r.targetId}/results`; }}
    >
      <Box sx={{
        width: 10, height: 10, borderRadius: '50%', background: sc, flexShrink: 0,
        boxShadow: isRunning ? `0 0 8px ${sc}` : 'none',
        animation: isRunning ? 'pk-led-pulse 1s ease-in-out infinite' : 'none',
      }} />
      {statusIcon(r.status)}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{r.appName}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, fontFamily: 'JetBrains Mono' }}>{r.targetUrl}</Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 0.3 }}>
          <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{r.policyName}</Typography>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>{new Date(r.startedAt).toLocaleString('ru-RU')}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {r.findingsCount > 0 && <Chip label={`${r.findingsCount} findings`} size="small" sx={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)', fontSize: 9 }} />}
        <Chip label={r.status.toUpperCase()} size="small" sx={{ color: sc, background: `${sc}15`, fontWeight: 700, fontSize: 9 }} />
        {r.gate !== 'unknown' && <Chip label={`GATE ${r.gate.toUpperCase()}`} size="small" sx={{ color: gc, background: `${gc}15`, fontWeight: 700, fontSize: 9 }} />}
        <OpenInNew sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.4 }} />
      </Box>
    </Paper>
  );
}

const STATUS_ORDER: Record<RunStatus, number> = { running: 0, failed: 1, passed: 2, cancelled: 3, unavailable: 4 };

export default function RunsHistoryView() {
  const runs = useSecopsStore((s) => s.runs);

  const sorted = useMemo(() =>
    [...runs].sort((a, b) =>
      (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5) ||
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    ),
  [runs]);

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Run History</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>Chronological scan executions. Click to open results.</Typography>
        </Box>
        <Chip icon={<History sx={{ fontSize: '14px !important' }} />} label={`${runs.length} runs`} sx={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }} />
      </Box>

      {sorted.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <History sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.2, mb: 1 }} />
          <Typography sx={{ color: 'text.secondary', fontSize: 14, fontWeight: 600 }}>No runs yet.</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, mt: 0.5 }}>Launch a check from Targets tab to see results here.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sorted.map((r) => <RunRow key={r.id} r={r} />)}
        </Box>
      )}
    </Box>
  );
}