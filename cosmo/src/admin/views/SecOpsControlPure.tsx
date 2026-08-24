/** F-6: SecOpsControlPure — ADM-PURE container with 5 tabs + Meta Dark / Meta Light. */
import { useState, lazy, Suspense } from 'react';
import {
  ThemeProvider, createTheme,
} from '@mui/material/styles';
import { Box, Typography, AppBar, Toolbar, Tabs, Tab, Chip, IconButton } from '@mui/material';
import {
  Dashboard, Language, Gavel, BugReport, History, ArrowBack,
} from '@mui/icons-material';

const OverviewView = lazy(() => import('./OverviewView'));
const TargetsView = lazy(() => import('./TargetsView'));
const FindingsView = lazy(() => import('./FindingsView'));
const RunsHistoryView = lazy(() => import('./RunsHistoryView'));

function PoliciesViewLazy() {
  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Gate Policies</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
        Policies are managed in the Targets tab. Policy ID selector available during check launch.
      </Typography>
    </Box>
  );
}

const TAB_ICONS = [<Dashboard />, <Language />, <Gavel />, <BugReport />, <History />];
const TAB_LABELS = ['Overview', 'Targets', 'Policies', 'Findings', 'Run History'];

function darkTheme() {
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#38bdf8' },
      secondary: { main: '#6366f1' },
      background: { default: '#080c16', paper: '#0f172a' },
      text: { primary: '#f8fafc', secondary: '#94a3b8' },
      divider: 'rgba(56, 189, 248, 0.15)',
    },
    typography: { fontFamily: '"Golos UI", "Golos Text", "Segoe UI", system-ui, sans-serif', fontSize: 13 },
    components: {
      MuiPaper: { styleOverrides: { root: { border: '1px solid rgba(56, 189, 248, 0.12)', boxShadow: 'none' } } },
      MuiAppBar: { styleOverrides: { root: { background: '#0b101c', borderBottom: '1px solid rgba(56, 189, 248, 0.15)', boxShadow: 'none' } } },
    },
  });
}

function lightTheme() {
  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#0f172a' },
      secondary: { main: '#6366f1' },
      background: { default: '#f8fafc', paper: '#ffffff' },
      text: { primary: '#0f172a', secondary: '#475569' },
      divider: 'rgba(15, 23, 42, 0.08)',
    },
    typography: { fontFamily: '"Golos UI", "Golos Text", "Segoe UI", system-ui, sans-serif', fontSize: 13 },
    components: {
      MuiPaper: { styleOverrides: { root: { border: '1px solid rgba(15, 23, 42, 0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } } },
      MuiAppBar: { styleOverrides: { root: { background: '#fff', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', boxShadow: 'none' } } },
    },
  });
}

function PlaceholderTab() {
  return (
    <Box sx={{ p: 8, textAlign: 'center' }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Loading…</Typography>
    </Box>
  );
}

export function SecOpsControlPure() {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const [tab, setTab] = useState(0);
  const theme = mode === 'dark' ? darkTheme() : lightTheme();

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
        {/* AppBar */}
        <AppBar position="static" sx={{ zIndex: 30 }}>
          <Toolbar variant="dense" sx={{ minHeight: 44, px: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              <IconButton size="small" onClick={() => { window.location.hash = '#/home'; }} sx={{ color: 'text.secondary' }}>
                <ArrowBack sx={{ fontSize: 18 }} />
              </IconButton>
              <Box component="img" src={mode === 'light' ? '/brand/prettyk-logo-black.png' : '/brand/prettyk-logo-temp.png'} alt="pretty<" sx={{ height: 20, objectFit: 'contain' }} />
              <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'primary.main' }}>
                SECOPS CONTROL
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="ADM-PURE" size="small" sx={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', fontWeight: 600, fontSize: 10 }} />
              <IconButton size="small" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} sx={{ color: 'text.secondary' }}>
                <Box component="span" sx={{ fontSize: 14, fontWeight: 700 }}>{mode === 'dark' ? '☀' : '☾'}</Box>
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, minHeight: 40, '.MuiTab-root': { minHeight: 40, fontSize: 11, fontWeight: 600, textTransform: 'none' } }}
        >
          {TAB_LABELS.map((label, i) => (
            <Tab key={label} icon={TAB_ICONS[i]} iconPosition="start" label={label} />
          ))}
        </Tabs>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Suspense fallback={<PlaceholderTab />}>
            {tab === 0 && <OverviewView />}
            {tab === 1 && <TargetsView />}
            {tab === 2 && <PoliciesViewLazy />}
            {tab === 3 && <FindingsView />}
            {tab === 4 && <RunsHistoryView />}
          </Suspense>
        </Box>

        {/* Footer */}
        <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>prettyk.io · ADM-PURE</Typography>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>SecOps Control v2 · MUI</Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}