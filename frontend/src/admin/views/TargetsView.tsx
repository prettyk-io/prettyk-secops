/** F-2 + F-3: TargetsView — app & target registry, launch checks, gate policies. */
import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
} from '@mui/material';
import {
  Add, OpenInNew, History, PlayArrow, Settings, Shield, Public,
} from '@mui/icons-material';
import { useSecopsStore, gateVerdictColor, type GatePolicy } from '../useSecopsStore';

// ── URL validation (RFC-3986) ──
const URL_RE = /^https?:\/\/[\w.-]+(:\d+)?(\/[\w./\-_?#&=]*)?$/i;

function isValidUrl(u: string): boolean {
  return URL_RE.test(u.trim());
}

// ── Target card ──
function TargetCard({ appName, target, onNewCheck, onHistory }: { appName: string; target: any; onNewCheck: () => void; onHistory: () => void }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', borderTop: `3px solid ${gateVerdictColor(target.lastGate)}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{appName}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, fontFamily: 'JetBrains Mono', mt: 0.3 }}>{target.url}</Typography>
        </Box>
        <Chip label={target.status} size="small" sx={{ color: target.status === 'active' ? '#22c55e' : '#f59e0b', background: target.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 'auto' }}>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>
          <BugReportIcon /> {target.findingsCount} findings · {target.lastGate.toUpperCase()}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
          <Tooltip title="New Check"><IconButton size="small" onClick={onNewCheck} sx={{ color: '#38bdf8' }}><PlayArrow sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          <Tooltip title="History"><IconButton size="small" onClick={onHistory} sx={{ color: '#94a3b8' }}><History sx={{ fontSize: 18 }} /></IconButton></Tooltip>
        </Box>
      </Box>
    </Paper>
  );
}

function BugReportIcon() {
  return <Box component="span" sx={{ display: 'inline', verticalAlign: 'middle', mr: 0.3 }}>🐛</Box>;
}

// ── Policy card ──
function PolicyCard({ p, onToggle, onEdit }: { p: GatePolicy; onToggle: () => void; onEdit: () => void }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, opacity: p.enabled ? 1 : 0.55 }}>
      <Shield sx={{ color: p.enabled ? '#38bdf8' : '#64748b', fontSize: 24 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{p.name}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
          Max: C:{p.maxCritical} H:{p.maxHigh} M:{p.maxMedium} L:{p.maxLow}
        </Typography>
      </Box>
      <Chip label={p.enabled ? 'Active' : 'Disabled'} size="small" onClick={onToggle} sx={{ color: p.enabled ? '#22c55e' : '#64748b', background: p.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.1)', cursor: 'pointer', fontWeight: 600, fontSize: 10 }} />
      <Tooltip title="Edit"><IconButton size="small" onClick={onEdit} sx={{ color: '#94a3b8' }}><Settings sx={{ fontSize: 16 }} /></IconButton></Tooltip>
    </Paper>
  );
}

export default function TargetsView() {
  const secopsApps = useSecopsStore((s) => s.apps);
  const policies = useSecopsStore((s) => s.policies);
  const addApp = useSecopsStore((s) => s.addApp);
  const setPolicies = useSecopsStore((s) => s.setPolicies);

  const [showNewApp, setShowNewApp] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchTargetId, setLaunchTargetId] = useState('');
  const [launchPolicy, setLaunchPolicy] = useState('pol-owasp');
  const [editPolId, setEditPolId] = useState<string | null>(null);
  const [polName, setPolName] = useState('');
  const [maxC, setMaxC] = useState(0);
  const [maxH, setMaxH] = useState(3);

  const handleCreateApp = () => {
    const trimmed = newAppName.trim();
    const url = newTargetUrl.trim();
    if (!trimmed || !url) return;
    if (!isValidUrl(url)) { setUrlError('Invalid URL (RFC-3986). Must start with http:// or https://.'); return; }
    setUrlError('');
    addApp({
      id: `app-${Date.now()}`, name: trimmed, createdAt: new Date().toISOString(),
      targets: [{ id: `tgt-${Date.now()}`, url, status: 'active', lastCheckAt: null, findingsCount: 0, lastGate: 'unknown' }],
    });
    setShowNewApp(false); setNewAppName(''); setNewTargetUrl('');
  };

  const handleLaunch = () => {
    setShowLaunch(false);
    // Production: fire check creation API
  };

  const handleEditPol = (p: GatePolicy) => {
    setEditPolId(p.id); setPolName(p.name); setMaxC(p.maxCritical); setMaxH(p.maxHigh);
  };

  const handleSavePol = () => {
    if (!editPolId) return;
    setPolicies(policies.map((p) => p.id === editPolId ? { ...p, name: polName, maxCritical: maxC, maxHigh: maxH } : p));
    setEditPolId(null);
  };

  const handleTogglePol = (id: string) => {
    setPolicies(policies.map((p) => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  return (
    <Box sx={{ px: 3, py: 4, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Targets section ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Applications & Targets</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>Register targets and launch security checks.</Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setShowNewApp(true)} sx={{ fontSize: 11, bgcolor: 'primary.main', color: '#080c16', fontWeight: 600 }}>
          New Application
        </Button>
      </Box>

      {secopsApps.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Public sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.2, mb: 1 }} />
          <Typography sx={{ color: 'text.secondary', fontSize: 14, fontWeight: 600 }}>No applications registered yet.</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, mt: 0.5 }}>Create your first application and target to start scanning.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {secopsApps.flatMap((app) => app.targets.map((tgt) => (
            <Grid key={tgt.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <TargetCard
                appName={app.name}
                target={tgt}
                onNewCheck={() => { setLaunchTargetId(tgt.id); setLaunchPolicy('pol-owasp'); setShowLaunch(true); }}
                onHistory={() => {}}
              />
            </Grid>
          )))}
        </Grid>
      )}

      {/* ── Policies section ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Gate Policies</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>Define acceptance criteria. Changes do not rewrite historical verdicts.</Typography>
        </Box>
        <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => {
          setPolicies([...policies, { id: `pol-${Date.now()}`, name: 'New Policy', enabled: true, maxCritical: 0, maxHigh: 3, maxMedium: 5, maxLow: 10 }]);
        }} sx={{ fontSize: 11 }}>
          Create Policy
        </Button>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {policies.map((p) => (
          <PolicyCard key={p.id} p={p} onToggle={() => handleTogglePol(p.id)} onEdit={() => handleEditPol(p)} />
        ))}
      </Box>

      {/* ── Dialog: New Application ── */}
      <Dialog open={showNewApp} onClose={() => setShowNewApp(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Application</DialogTitle>
        <DialogContent>
          <TextField label="Application Name" fullWidth size="small" value={newAppName} onChange={(e) => setNewAppName(e.target.value)} sx={{ mb: 2, mt: 1 }} />
          <TextField label="Target URL" fullWidth size="small" value={newTargetUrl} onChange={(e) => { setNewTargetUrl(e.target.value); setUrlError(''); }} error={!!urlError} helperText={urlError || 'e.g. http://juice-shop:3000'} placeholder="http://juice-shop:3000" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewApp(false)} size="small">Cancel</Button>
          <Button onClick={handleCreateApp} variant="contained" size="small" disabled={!newAppName.trim() || !newTargetUrl.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Launch Check ── */}
      <Dialog open={showLaunch} onClose={() => setShowLaunch(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Launch Check</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Gate Policy</InputLabel>
            <Select value={launchPolicy} label="Gate Policy" onChange={(e) => setLaunchPolicy(e.target.value)}>
              {policies.filter((p) => p.enabled).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLaunch(false)} size="small">Cancel</Button>
          <Button onClick={handleLaunch} variant="contained" size="small" startIcon={<PlayArrow />}>Launch</Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Edit Policy ── */}
      <Dialog open={!!editPolId} onClose={() => setEditPolId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Policy</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth size="small" value={polName} onChange={(e) => setPolName(e.target.value)} sx={{ mb: 2, mt: 1 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Max Critical" type="number" size="small" value={maxC} onChange={(e) => setMaxC(Number(e.target.value))} sx={{ width: '50%' }} />
            <TextField label="Max High" type="number" size="small" value={maxH} onChange={(e) => setMaxH(Number(e.target.value))} sx={{ width: '50%' }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPolId(null)} size="small">Cancel</Button>
          <Button onClick={handleSavePol} variant="contained" size="small">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}