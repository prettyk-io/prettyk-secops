/** F-4: FindingsView — unified findings registry with filters, CVSS, triage. */
import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, IconButton, Tooltip,
} from '@mui/material';
import { BugReport, FilterList, Code, Search } from '@mui/icons-material';
import {
  useSecopsStore, severityColor,
  type SeverityKey, type FindingStatus, type SecOpsFinding,
} from '../useSecopsStore';

function FindingRow({ f }: { f: SecOpsFinding }) {
  const [expanded, setExpanded] = useState(false);
  const findings = useSecopsStore((s) => s.findings);
  const setFindings = useSecopsStore((s) => s.setFindings);

  const cycleStatus = () => {
    const order: FindingStatus[] = ['active', 'mitigated', 'false_positive', 'risk_accepted'];
    const idx = order.indexOf(f.status);
    const next = order[(idx + 1) % order.length]!;
    setFindings(findings.map((x) => x.id === f.id ? { ...x, status: next } : x));
  };

  const statusChip = (s: FindingStatus) => {
    const colors: Record<FindingStatus, string> = { active: '#ef4444', mitigated: '#22c55e', false_positive: '#94a3b8', risk_accepted: '#f59e0b', out_of_scope: '#64748b' };
    return <Chip label={s.replace('_', ' ')} size="small" onClick={cycleStatus} sx={{ color: colors[s], background: `${colors[s]}15`, border: `1px solid ${colors[s]}40`, cursor: 'pointer', fontWeight: 600, fontSize: 9 }} />;
  };

  return (
    <Paper sx={{ p: 2, borderRadius: 2, '&:hover': { borderColor: severityColor(f.severity) } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Chip label={f.severity.toUpperCase()} size="small" sx={{ color: '#080c16', background: severityColor(f.severity), fontWeight: 700, fontSize: 9 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{f.title}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            {f.cwe && <Chip label={f.cwe} size="small" sx={{ color: '#94a3b8', background: 'rgba(148,163,184,0.1)', fontSize: 9, fontFamily: 'JetBrains Mono' }} />}
            {f.cvss !== null && <Chip label={`CVSS ${f.cvss.toFixed(1)}`} size="small" sx={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 700 }} />}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {statusChip(f.status)}
          {f.curlPoc && (
            <Tooltip title="Show PoC"><IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ color: '#38bdf8' }}><Code sx={{ fontSize: 14 }} /></IconButton></Tooltip>
          )}
        </Box>
      </Box>
      {expanded && f.curlPoc && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, background: '#0f172a', border: '1px solid #1e293b' }}>
          <Typography sx={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{f.curlPoc}</Typography>
        </Box>
      )}
      <Typography sx={{ color: 'text.secondary', fontSize: 10, mt: 1 }}>{new Date(f.changedAt).toLocaleString('ru-RU')}</Typography>
    </Paper>
  );
}

export default function FindingsView() {
  const findings = useSecopsStore((s) => s.findings);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<SeverityKey | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('all');

  const filtered = useMemo(() => findings.filter((f) => {
    if (search && !f.title.toLowerCase().includes(search.toLowerCase()) && !(f.cwe ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    return true;
  }), [findings, search, sevFilter, statusFilter]);

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Findings Registry</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>Unified view across all targets and runs. Triage statuses directly.</Typography>
        </Box>
        <Chip icon={<BugReport sx={{ fontSize: '14px !important' }} />} label={`${filtered.length} findings`} sx={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }} />
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search title, CWE..." value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <Search sx={{ fontSize: 16, mr: 0.5, color: '#64748b' }} /> } }}
          sx={{ minWidth: 240, '& .MuiOutlinedInput-root': { fontSize: 12 } }} />
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Severity</InputLabel>
          <Select value={sevFilter} label="Severity" onChange={(e) => setSevFilter(e.target.value as any)} sx={{ fontSize: 12 }}>
            <MenuItem value="all">All</MenuItem>
            {(['critical', 'high', 'medium', 'low', 'info'] as SeverityKey[]).map((s) => <MenuItem key={s} value={s}>{s.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value as any)} sx={{ fontSize: 12 }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="mitigated">Mitigated</MenuItem>
            <MenuItem value="false_positive">False Positive</MenuItem>
            <MenuItem value="risk_accepted">Risk Accepted</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <BugReport sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.2, mb: 1 }} />
          <Typography sx={{ color: 'text.secondary', fontSize: 14, fontWeight: 600 }}>No findings match these filters.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filtered.map((f) => <FindingRow key={f.id} f={f} />)}
        </Box>
      )}
    </Box>
  );
}