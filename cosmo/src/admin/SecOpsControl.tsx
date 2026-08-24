import { Box, Typography, Button, Select, MenuItem, FormControl, InputLabel, Alert, Paper, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Chip, CircularProgress } from '@mui/material';
import { Security, Person, Add, Inventory } from '@mui/icons-material';
import { useState, useEffect, useCallback } from 'react';
import { MinimalThemeAdapter } from '../theme-minimal/MinimalThemeAdapter';
import { StyledEngineProvider } from '@mui/material/styles';
import {
  listDeploys,
  ensureDeploy,
  getDeploy,
} from './deployStore';
import type { BankDeploy } from './types';
import { buildWiredFromDeploy, titleFromDeploy } from './buildWiredFromDeploy';

const GATE_COLORS: Record<string, string> = { pass: '#3fb27f', watch: '#f0a830', fail: '#f85149', unknown: '#94a3b8' };

function DeployRegistryPanel() {
  const [deploys, setDeploys] = useState<BankDeploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  const [ensureOpen, setEnsureOpen] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [newEnv, setNewEnv] = useState('lab');
  const [newUrl, setNewUrl] = useState('');
  const [ensuring, setEnsuring] = useState(false);

  const [creatingBlank, setCreatingBlank] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<'success' | 'error'>('success');
  const [assignedExpert, setAssignedExpert] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    const filters: Record<string, string> = { status: 'active' };
    if (search.trim()) filters.q = search.trim();
    if (envFilter) filters.deploy_env = envFilter;
    setDeploys(listDeploys(filters as any));
    setLoading(false);
  }, [search, envFilter]);

  useEffect(() => { load(); }, [load]);

  const handleEnsure = async () => {
    if (!newProjectId.trim() || !newUrl.trim()) return;
    setEnsuring(true);
    try {
      ensureDeploy({
        project_id: newProjectId.trim(),
        application_name: newAppName.trim() || newProjectId.trim(),
        deploy_env: newEnv,
        deploy_url: newUrl.trim(),
      });
      setEnsureOpen(false);
      setNewProjectId(''); setNewAppName(''); setNewUrl('');
      load();
    } finally {
      setEnsuring(false);
    }
  };

  const handleCreateBlank = (deployId: string) => {
    const deploy = getDeploy(deployId);
    if (!deploy) return;
    setCreatingBlank(deployId);
    try {
      buildWiredFromDeploy(deploy, { assessmentPurpose: 'scheduled' });
      const title = titleFromDeploy(deploy);
      setAlertMsg(`Blank created: ${title}`);
      setAlertSeverity('success');
    } catch (e) {
      setAlertMsg(`Failed: ${e instanceof Error ? e.message : 'unknown'}`);
      setAlertSeverity('error');
    } finally {
      setCreatingBlank(null);
    }
  };

  const handleAssign = (deployId: string, expert: string) => {
    setAssignedExpert((prev) => ({ ...prev, [deployId]: expert }));
    setAlertMsg(`Assigned ${expert} to ${deployId}`);
    setAlertSeverity('success');
  };

  const experts = ['Петров А.', 'Иванова М.', 'Смирнов К.'];
  const uniqueEnvs = [...new Set(deploys.map((d) => d.deploy_env))].filter(Boolean).sort();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ color: '#f8fafc', mb: 1, fontWeight: 700 }}>📦 Deploy Registry & Blank Provisioning</Typography>
      <Typography sx={{ color: '#94a3b8', fontSize: 13, mb: 3 }}>
        Manage deploy targets, create security blanks, and assign experts.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search by name, URL, project_id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': { color: '#f8fafc', fontSize: 12 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
            minWidth: 260,
          }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ color: '#94a3b8', fontSize: 11 }}>Environment</InputLabel>
          <Select value={envFilter} onChange={(e) => setEnvFilter(e.target.value as string)} label="Environment"
            sx={{ '& .MuiSelect-select': { color: '#f8fafc', fontSize: 12 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}>
            <MenuItem value="">All</MenuItem>
            {uniqueEnvs.map((env) => <MenuItem key={env} value={env}>{env}</MenuItem>)}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          size="small"
          startIcon={<Add />}
          onClick={() => setEnsureOpen(true)}
          sx={{ fontSize: 11, fontWeight: 600, bgcolor: '#38bdf8', color: '#080c16', '&:hover': { bgcolor: '#0ea5e9' }, height: 40 }}
        >
          Register Deploy
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={32} sx={{ color: '#38bdf8' }} /></Box>
      ) : deploys.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: '#94a3b8' }}>
          <Typography sx={{ fontSize: 14 }}>No deploys found.</Typography>
          <Button variant="text" size="small" onClick={() => setEnsureOpen(true)} sx={{ color: '#38bdf8', mt: 1, fontSize: 11 }}>
            Register your first deploy
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {deploys.map((d) => (
            <Paper
              key={d.deploy_id}
              sx={{
                p: 2,
                border: '1px solid rgba(147, 51, 234, 0.15)',
                borderRadius: 2,
                background: 'rgba(18, 23, 34, 0.85)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>{d.application_name}</Typography>
                  <Chip size="small" label={d.deploy_env} sx={{ color: '#38bdf8', background: 'rgba(56,189,248,0.12)', fontSize: 9, height: 18 }} />
                  <Chip
                    size="small"
                    label={d.last_gate ?? 'unknown'}
                    sx={{
                      color: GATE_COLORS[d.last_gate ?? 'unknown'],
                      background: `${GATE_COLORS[d.last_gate ?? 'unknown']}15`,
                      border: `1px solid ${GATE_COLORS[d.last_gate ?? 'unknown']}40`,
                      fontSize: 9, fontWeight: 700, height: 18,
                    }}
                  />
                </Box>
                <Typography sx={{ color: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}>{d.deploy_url}</Typography>
                {d.project_id && (
                  <Typography sx={{ color: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono', mt: 0.3 }}>
                    {d.project_id} · {d.build_id || '—'}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select
                    value={assignedExpert[d.deploy_id] ?? ''}
                    onChange={(e) => handleAssign(d.deploy_id, e.target.value as string)}
                    displayEmpty
                    sx={{
                      '& .MuiSelect-select': { color: assignedExpert[d.deploy_id] ? '#3fb27f' : '#f85149', fontSize: 11, fontWeight: 600 },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                    }}
                  >
                    <MenuItem value=""><em>Unassigned</em></MenuItem>
                    {experts.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={creatingBlank === d.deploy_id ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Inventory />}
                  onClick={() => handleCreateBlank(d.deploy_id)}
                  disabled={creatingBlank !== null}
                  sx={{
                    fontSize: 10, fontWeight: 600,
                    background: 'linear-gradient(135deg, #38bdf8, #7a1fa2)',
                    color: '#fff', height: 32,
                    '&:hover': { opacity: 0.9 },
                  }}
                >
                  Issue Blank
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {alertMsg && (
        <Alert severity={alertSeverity} onClose={() => setAlertMsg('')}
          sx={{ mt: 2, background: alertSeverity === 'success' ? 'rgba(63, 178, 127, 0.1)' : 'rgba(248, 81, 73, 0.1)', border: `1px solid ${alertSeverity === 'success' ? 'rgba(63, 178, 127, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`, color: '#f8fafc' }}>
          {alertMsg}
        </Alert>
      )}

      <Dialog open={ensureOpen} onClose={() => setEnsureOpen(false)} sx={{ '& .MuiDialog-paper': { bgcolor: '#111827', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 3, minWidth: 400 } }}>
        <DialogTitle sx={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>Register New Deploy</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField size="small" label="Project ID" required value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', fontSize: 12 }, '& .MuiInputLabel-root': { color: '#94a3b8' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField size="small" label="Application Name" value={newAppName} onChange={(e) => setNewAppName(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', fontSize: 12 }, '& .MuiInputLabel-root': { color: '#94a3b8' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <FormControl size="small">
              <InputLabel sx={{ color: '#94a3b8', fontSize: 11 }}>Environment</InputLabel>
              <Select value={newEnv} onChange={(e) => setNewEnv(e.target.value as string)} label="Environment"
                sx={{ '& .MuiSelect-select': { color: '#f8fafc', fontSize: 12 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}>
                <MenuItem value="lab">lab</MenuItem>
                <MenuItem value="preprod">preprod</MenuItem>
                <MenuItem value="stage">stage</MenuItem>
                <MenuItem value="uat">uat</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Deploy URL" required value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', fontSize: 12 }, '& .MuiInputLabel-root': { color: '#94a3b8' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEnsureOpen(false)} sx={{ color: '#94a3b8', fontSize: 11 }}>Cancel</Button>
          <Button onClick={handleEnsure} disabled={ensuring || !newProjectId.trim() || !newUrl.trim()}
            sx={{ fontSize: 11, fontWeight: 600, bgcolor: '#38bdf8', color: '#080c16', '&:hover': { bgcolor: '#0ea5e9' } }}>
            {ensuring ? <CircularProgress size={14} sx={{ color: '#080c16', mr: 1 }} /> : null}
            Register
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function SecOpsControl() {
  return (
    <StyledEngineProvider injectFirst>
      <MinimalThemeAdapter>
        <Box sx={{ height: '100vh', overflow: 'auto', bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(11,16,28,0.95)' }}>
            <Box component="img" src="/brand/prettyk-logo-temp.png" alt="pretty<" sx={{ height: 20, objectFit: 'contain' }} />
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'text.secondary' }}>
              SECOPS CONTROL
            </Typography>
          </Box>
          <DeployRegistryPanel />
        </Box>
      </MinimalThemeAdapter>
    </StyledEngineProvider>
  );
}