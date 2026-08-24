import { Box, Typography, Chip, Grid, Paper } from '@mui/material';
import { BugReport, PlayArrow, Shield, CheckCircle, Cancel } from '@mui/icons-material';
import { MinimalThemeAdapter } from '../theme-minimal/MinimalThemeAdapter';
import { StyledEngineProvider } from '@mui/material/styles';

function RunCard({ run }: { run: { id: string; project: string; type: 'automation' | 'security'; status: 'success' | 'failed' | 'critical'; duration: string; steps: number } }) {
  const isSecurity = run.type === 'security';
  const accentColor = isSecurity ? '#a855f7' : '#38bdf8';
  const statusColor = run.status === 'success' ? '#3fb27f' : run.status === 'critical' ? '#f85149' : '#f0a830';

  return (
    <Paper sx={{ p: 2.5, border: `1px solid ${accentColor}30`, borderRadius: 3, background: `linear-gradient(135deg, ${accentColor}08, rgba(8,12,22,0.95))`, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography sx={{ color: '#f8fafc', fontWeight: 600, fontSize: 13 }}>{run.project}</Typography>
        <Chip size="small" icon={isSecurity ? <Shield sx={{ fontSize: '13px !important' }} /> : <PlayArrow sx={{ fontSize: '13px !important' }} />} label={isSecurity ? 'Security' : 'Automation'}
          sx={{ color: accentColor, background: `${accentColor}15`, border: `1px solid ${accentColor}40`, fontSize: 10, fontWeight: 700, height: 22 }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', pt: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <Typography sx={{ color: statusColor, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{run.status}</Typography>
        </Box>
        <Typography sx={{ color: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}>{run.steps} steps · {run.duration}</Typography>
      </Box>
    </Paper>
  );
}

const SAMPLE_RUNS = [
  { id: 'r1', project: 'juice-shop-e2e', type: 'automation' as const, status: 'success' as const, duration: '4m 12s', steps: 5 },
  { id: 'r2', project: 'bank-api-sqli', type: 'security' as const, status: 'critical' as const, duration: '18m 45s', steps: 12 },
  { id: 'r3', project: 'mobile-auth-check', type: 'automation' as const, status: 'failed' as const, duration: '2m 01s', steps: 3 },
  { id: 'r4', project: 'onboarding-flow', type: 'automation' as const, status: 'success' as const, duration: '3m 55s', steps: 6 },
  { id: 'r5', project: 'intranet-xss-probe', type: 'security' as const, status: 'success' as const, duration: '9m 30s', steps: 8 },
];

export function DashboardPage() {
  return (
    <StyledEngineProvider injectFirst>
      <MinimalThemeAdapter>
        <Box sx={{ height: '100vh', overflow: 'auto', bgcolor: 'background.default', p: 4 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box component="img" src="/brand/prettyk-logo-temp.png" alt="pretty<" sx={{ height: 22, objectFit: 'contain' }} />
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'text.secondary' }}>
              DASHBOARD
            </Typography>
          </Box>

          <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 700, mb: 1 }}>📊 Unified Dashboard — Automation & Security</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 4 }}>Cross-domain run results. Automation (blue) + Security (purple).</Typography>

          {/* KPI cards */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
            {[
              { label: 'Automation', val: 3, color: '#38bdf8', icon: <PlayArrow /> },
              { label: 'Security', val: 2, color: '#a855f7', icon: <Shield /> },
              { label: 'Passing', val: 3, color: '#3fb27f', icon: <CheckCircle /> },
              { label: 'At Risk', val: 1, color: '#f85149', icon: <BugReport /> },
            ].map((c) => (
              <Box key={c.label} sx={{ flex: '1 1 0', minWidth: 140, p: 2.5, border: `1px solid ${c.color}30`, borderRadius: 2, background: `${c.color}10`, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ color: c.color, fontSize: 20 }}>{c.icon}</Box>
                <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 18 }}>{c.val}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{c.label}</Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 600, mb: 2 }}>Recent Runs</Typography>
          <Grid container spacing={2}>
            {SAMPLE_RUNS.map((run) => (
              <Grid key={run.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <RunCard run={run} />
              </Grid>
            ))}
          </Grid>
        </Box>
      </MinimalThemeAdapter>
    </StyledEngineProvider>
  );
}