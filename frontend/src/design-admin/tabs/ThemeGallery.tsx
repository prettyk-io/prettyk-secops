import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Slider,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Snackbar,
} from '@mui/material';
import {
  Palette,
  CheckCircle,
  ContentCopy,
  Shield,
  Storage,
  Speed,
} from '@mui/icons-material';
import { type AdminThemeId, ADMIN_THEMES } from '../AdminShowcase';

const THEME_META: Record<AdminThemeId, { label: string; panel: string; color: string; desc: string }> = {
  'meta-dark': { label: 'Meta Dark (Cyan + Violet)', panel: 'Dark Mode Canon', color: '#38bdf8', desc: 'Electric Cyan #38BDF8 · Cyber Violet #818CF8 / #7A1FA2 · Deep Space Obsidian #080D1A · Golos UI + JetBrains Mono.' },
  'meta-light': { label: 'Meta Light (Cyan + Violet)', panel: 'Day Mode Canon', color: '#0284C7', desc: 'Accessible Cyan #0284C7 · Cyber Violet #6366F1 / #7A1FA2 · Crisp Slate #F8FAFC · Charcoal Text #0F172A.' },
};

// Live demo data — changes appearance with each theme
function DemoCard({ themeId }: { themeId: AdminThemeId }) {
  const isDark = themeId === 'meta-dark';
  const theme = ADMIN_THEMES[themeId];
  const prim = theme.palette.primary.main;
  const sec = theme.palette.secondary.main;

  return (
    <Paper sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>juice-shop-e2e</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>QA Retail · 12 runs</Typography>
        </Box>
        <Chip
          size="small"
          icon={<Shield sx={{ fontSize: '14px !important' }} />}
          label="Security"
          sx={{ color: prim, background: `${prim}15`, border: `1px solid ${prim}40`, fontSize: 10, fontWeight: 700 }}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircle sx={{ color: '#3fb27f', fontSize: 14 }} />
        <Typography sx={{ color: '#3fb27f', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>passing</Typography>
        <Chip size="small" label="5 steps" sx={{ color: 'text.secondary', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', ml: 'auto', fontSize: 10 }} />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
          <Speed sx={{ fontSize: 10, mr: 0.5, verticalAlign: 'middle', color: sec }} />
          4m 12s
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
          2026-08-23 14:22
        </Typography>
      </Box>
    </Paper>
  );
}

function DemoTable({ themeId }: { themeId: AdminThemeId }) {
  const items = [
    { name: 'juice-shop', risk: 'Critical', count: 3, status: 'Active' },
    { name: 'bank-gateway', risk: 'High', count: 1, status: 'Active' },
    { name: 'mobile-auth', risk: 'Medium', count: 2, status: 'Resolved' },
    { name: 'intranet', risk: 'Low', count: 0, status: 'Clean' },
  ];
  const theme = ADMIN_THEMES[themeId];
  const prim = theme.palette.primary.main;

  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 100px', p: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,0.03)' }}>
        {['Target', 'Risk', 'Findings', 'Status'].map(h => (
          <Typography key={h} sx={{ fontWeight: 700, fontSize: 10, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</Typography>
        ))}
      </Box>
      {items.map((item, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 100px', p: 1.5, borderBottom: i < items.length - 1 ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: `${prim}08` } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.name}</Typography>
          <Box><Chip size="small" label={item.risk} sx={{ color: item.risk === 'Critical' ? '#f85149' : item.risk === 'High' ? '#f0a830' : '#38bdf8', background: item.risk === 'Critical' ? 'rgba(248,81,73,0.12)' : 'rgba(240,168,48,0.12)', fontSize: 9, fontWeight: 700 }} /></Box>
          <Typography sx={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'text.secondary' }}>{item.count}</Typography>
          <Typography sx={{ fontSize: 11, color: item.status === 'Clean' ? '#3fb27f' : item.status === 'Active' ? '#f0a830' : '#38bdf8' }}>{item.status}</Typography>
        </Box>
      ))}
    </Paper>
  );
}

function DemoForm({ themeId }: { themeId: AdminThemeId }) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>Issue Blank Template</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField fullWidth size="small" label="Target App" defaultValue="juice-shop" />
        <FormControl fullWidth size="small">
          <InputLabel>Policy</InputLabel>
          <Select defaultValue="pci-dss">
            <MenuItem value="pci-dss">PCI-DSS Strict</MenuItem>
            <MenuItem value="owasp">OWASP Top-10</MenuItem>
            <MenuItem value="custom">Custom Policy</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small">
          <InputLabel>Assign Expert</InputLabel>
          <Select defaultValue="petrov">
            <MenuItem value="petrov">Petrov A.</MenuItem>
            <MenuItem value="ivanova">Ivanova M.</MenuItem>
          </Select>
        </FormControl>
        <TextField fullWidth size="small" type="date" label="Deadline" defaultValue="2026-09-01" slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" sx={{ fontSize: 10 }}>Cancel</Button>
        <Button size="small" variant="contained" sx={{ fontSize: 10, bgcolor: 'primary.main', color: themeId === 'meta-light' ? '#fff' : '#080c16' }}>
          Issue Blank
        </Button>
      </Box>
    </Paper>
  );
}

function DemoRetention({ themeId }: { themeId: AdminThemeId }) {
  const [ttl, setTtl] = useState(30);
  const theme = ADMIN_THEMES[themeId];
  return (
    <Paper sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Storage sx={{ color: theme.palette.primary.main }} />
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>Storage & Retention</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontFamily: 'JetBrains Mono' }}>1.2 GB / 10 GB</Typography>
        <LinearProgress variant="determinate" value={12} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
        <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>12%</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>TTL: {ttl}d</Typography>
        <Slider value={ttl} onChange={(_e, v) => setTtl(v as number)} min={1} max={180} size="small" />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" variant="contained" sx={{ fontSize: 10, bgcolor: 'primary.main', color: themeId === 'meta-light' ? '#fff' : '#080c16' }}>Save TTL</Button>
        <Button size="small" variant="outlined" color="error" sx={{ fontSize: 10 }}>Force Cleanup</Button>
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Theme Gallery (DP-ADM-5)
// ---------------------------------------------------------------------------
export default function ThemeGallery({ activeTheme, onThemeChange }: { activeTheme: AdminThemeId; onThemeChange: (t: AdminThemeId) => void }) {
  const [copied, setCopied] = useState(false);
  const themeIds: AdminThemeId[] = ['meta-dark', 'meta-light'];

  const handleCopyTheme = () => {
    const theme = ADMIN_THEMES[activeTheme];
    const config = JSON.stringify({
      palette: theme.palette,
      typography: theme.typography,
    }, null, 2);
    navigator.clipboard.writeText(config).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        <Palette sx={{ fontSize: 20, mr: 0.5, verticalAlign: 'middle' }} />
        Canon Theme Studio — Live Morphing
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12, mb: 3 }}>
        Switch themes below. All demo components update instantly across the admin layout.
      </Typography>

      {/* Theme selector cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2, mb: 4 }}>
        {themeIds.map((id) => {
          const meta = THEME_META[id];
          const isActive = id === activeTheme;
          return (
            <Card
              key={id}
              onClick={() => onThemeChange(id)}
              sx={{
                cursor: 'pointer',
                transition: 'all 0.15s',
                opacity: isActive ? 1 : 0.6,
                border: `2px solid ${isActive ? meta.color : 'transparent'}`,
                '&:hover': { opacity: 1, borderColor: meta.color, transform: 'translateY(-2px)' },
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: meta.color, boxShadow: `0 0 8px ${meta.color}60` }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{meta.label}</Typography>
                </Box>
                <Typography sx={{ color: 'text.secondary', fontSize: 10, mb: 0.5 }}>{meta.panel}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 9, opacity: 0.7 }}>{meta.desc}</Typography>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Export button */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopy />}
          onClick={handleCopyTheme}
          sx={{ fontSize: 10 }}
        >
          Copy Theme Config
        </Button>
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Live preview — polymorphic components that react to theme */}
      <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 2 }}>Live Preview</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <DemoCard themeId={activeTheme} />
        <DemoForm themeId={activeTheme} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3, mt: 3 }}>
        <DemoTable themeId={activeTheme} />
        <DemoRetention themeId={activeTheme} />
      </Box>

      <Snackbar open={copied} autoHideDuration={2000} message="Theme config copied to clipboard" />
    </Box>
  );
}
