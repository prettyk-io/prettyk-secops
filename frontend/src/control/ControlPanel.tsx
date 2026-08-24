import { Box, Typography, Card, LinearProgress, Slider, Button, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress } from '@mui/material';
import { Dns, Settings, Dashboard as DashIcon, Storage, Article, Delete, Refresh } from '@mui/icons-material';
import { useState, useEffect, useCallback } from 'react';
import { MinimalThemeAdapter } from '../theme-minimal/MinimalThemeAdapter';
import { StyledEngineProvider } from '@mui/material/styles';
import { fetchRetentionStatus, postRetentionClean, type RetentionStatus, type RetentionCleanResult, type StorageCategory } from '../admin/adminApi';

const MyAppBar = () => null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function RetentionPanel() {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanDays, setCleanDays] = useState(7);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<RetentionCleanResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const s = await fetchRetentionStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClean = async () => {
    setCleaning(true);
    setResult(null);
    const r = await postRetentionClean({ days: cleanDays });
    setResult(r);
    setCleaning(false);
    load();
  };

  const handleTempClean = async () => {
    setCleaning(true);
    setResult(null);
    const r = await postRetentionClean({ clean_temp_only: true });
    setResult(r);
    setCleaning(false);
    load();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ color: '#f8fafc', fontWeight: 700, mb: 1 }}>🗑 Retention & Storage</Typography>
      <Typography sx={{ color: '#94a3b8', fontSize: 13, mb: 3 }}>
        Manage disk usage, artifact lifecycle, and cleanup policies. Runs index is protected and cannot be deleted.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={32} sx={{ color: '#38bdf8' }} /></Box>
      ) : status ? (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Used', value: formatBytes(status.total_bytes), testid: 'ret-total-space', color: '#38bdf8' },
              { label: 'Total Runs', value: String(status.total_runs), testid: 'ret-total-runs', color: '#a855f7' },
              { label: 'Protected Runs', value: String(status.protected_runs), testid: 'ret-protected-runs', color: '#3fb27f' },
            ].map((kpi) => (
              <Card key={kpi.label} sx={{ p: 2.5, minWidth: 160, border: `1px solid ${kpi.color}30`, background: 'rgba(18,23,34,0.85)' }} data-testid={kpi.testid}>
                <Typography sx={{ color: '#94a3b8', fontSize: 11, mb: 0.5 }}>{kpi.label}</Typography>
                <Typography sx={{ color: kpi.color, fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{kpi.value}</Typography>
              </Card>
            ))}
          </Box>

          {status.categories.length > 0 && (
            <TableContainer component={Paper} sx={{ mb: 3, background: 'rgba(18,23,34,0.85)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-root': { color: '#94a3b8', fontWeight: 600, fontSize: 11, borderColor: 'rgba(255,255,255,0.06)' } }}>
                    <TableCell>Category</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {status.categories.map((cat: StorageCategory) => (
                    <TableRow key={cat.key} sx={{ '& .MuiTableCell-root': { color: '#f8fafc', fontSize: 12, borderColor: 'rgba(255,255,255,0.04)' } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Storage sx={{ color: cat.protected ? '#3fb27f' : '#f0a830', fontSize: 16 }} />
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{cat.label}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'JetBrains Mono' }}>{cat.items_count}</TableCell>
                      <TableCell sx={{ fontFamily: 'JetBrains Mono' }}>{formatBytes(cat.bytes)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={cat.protected ? 'PROTECTED' : 'CLEANABLE'}
                          sx={{
                            color: cat.protected ? '#3fb27f' : '#f0a830',
                            background: cat.protected ? 'rgba(63,178,127,0.12)' : 'rgba(240,168,48,0.12)',
                            border: `1px solid ${cat.protected ? 'rgba(63,178,127,0.3)' : 'rgba(240,168,48,0.3)'}`,
                            fontSize: 10, fontWeight: 700,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Paper sx={{ p: 2.5, background: 'rgba(18,23,34,0.85)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, mb: 3 }}>
            <Typography sx={{ color: '#f8fafc', fontWeight: 600, fontSize: 14, mb: 2 }}>Cleanup Actions</Typography>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>Delete artifacts older than</Typography>
                <Typography sx={{ color: '#38bdf8', fontWeight: 700, fontSize: 14, fontFamily: 'JetBrains Mono', minWidth: 40 }}>{cleanDays}d</Typography>
              </Box>
              <Slider value={cleanDays} onChange={(_e, v) => setCleanDays(v as number)} min={1} max={90} step={1} sx={{ width: '60%', color: '#38bdf8', mb: 1 }} />
              <Button
                variant="contained" size="small"
                startIcon={cleaning ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Delete />}
                onClick={handleClean} disabled={cleaning || !status.ok}
                data-testid="clean-by-days-btn"
                sx={{ fontSize: 11, fontWeight: 600, bgcolor: '#38bdf8', color: '#080c16', '&:hover': { bgcolor: '#0ea5e9' } }}
              >
                Clean Older Than {cleanDays}d
              </Button>
            </Box>
            <Box>
              <Typography sx={{ color: '#94a3b8', fontSize: 12, mb: 1 }}>Deep clean: remove all temporary dumps and interim scan artifacts</Typography>
              <Button
                variant="outlined" size="small"
                startIcon={cleaning ? <CircularProgress size={14} /> : <Refresh />}
                onClick={handleTempClean} disabled={cleaning}
                data-testid="clean-temp-btn"
                sx={{ fontSize: 11, fontWeight: 600, color: '#f0a830', borderColor: 'rgba(240,168,48,0.4)', '&:hover': { borderColor: '#f0a830', bgcolor: 'rgba(240,168,48,0.08)' } }}
              >
                Deep Clean Temp Dumps
              </Button>
            </Box>
          </Paper>

          {result && (
            <Alert severity={result.ok ? 'success' : 'error'} onClose={() => setResult(null)}
              sx={{ background: result.ok ? 'rgba(63,178,127,0.1)' : 'rgba(248,81,73,0.1)', border: `1px solid ${result.ok ? 'rgba(63,178,127,0.3)' : 'rgba(248,81,73,0.3)'}`, color: '#f8fafc' }}>
              {result.ok ? `Cleaned ${formatBytes(result.freed_bytes)} across ${result.deleted_items} items.` : `Cleanup failed: ${result.error || 'unknown error'}`}
            </Alert>
          )}

          {status.error && (
            <Alert severity="warning" sx={{ mt: 2, background: 'rgba(240,168,48,0.1)', border: '1px solid rgba(240,168,48,0.3)', color: '#f8fafc' }}>
              Live backend unreachable — showing cached/fallback data.
            </Alert>
          )}
        </>
      ) : null}
    </Box>
  );
}

export function ControlPanel() {
  return (
    <StyledEngineProvider injectFirst>
      <MinimalThemeAdapter>
        <Box sx={{ height: '100vh', overflow: 'auto', bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(11,16,28,0.95)' }}>
            <Box component="img" src="/brand/prettyk-logo-temp.png" alt="pretty<" sx={{ height: 20, objectFit: 'contain' }} />
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'text.secondary' }}>
              CONTROL PANEL
            </Typography>
          </Box>

          <Box sx={{ p: 4 }}>
            <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 700, mb: 1 }}>🏢 Organization: Cosmo</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 4 }}>
              Control Panel — system services, domains, daemons, and box-level settings.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2, mb: 4 }}>
              {[
                { icon: <Dns />, label: 'Demons & Runners', desc: 'ZAP demon, Browser Cores, background workers', color: '#38bdf8' },
                { icon: <Article />, label: 'Audit Logs', desc: 'Structured audit trail placeholder', color: '#a855f7' },
                { icon: <Settings />, label: 'Box Configuration', desc: 'Platform tuning and infrastructure settings', color: '#3fb27f' },
                { icon: <DashIcon />, label: 'Licensing & Quotas', desc: 'Service profile and workspace allocation', color: '#f0a830' },
              ].map((c) => (
                <Box key={c.label} sx={{ p: 2.5, border: '1px solid rgba(92, 136, 245, 0.2)', borderRadius: 2, background: 'rgba(18, 23, 34, 0.85)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ color: c.color, fontSize: 24 }}>{c.icon}</Box>
                  <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{c.label}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{c.desc}</Typography>
                </Box>
              ))}
            </Box>

            <RetentionPanel />
          </Box>
        </Box>
      </MinimalThemeAdapter>
    </StyledEngineProvider>
  );
}