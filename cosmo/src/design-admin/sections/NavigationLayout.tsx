import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  IconButton,
  Drawer,
  Tabs,
  Tab,
  Button,
} from '@mui/material';
import {
  Search,
  DashboardOutlined,
  BugReport,
  Speed,
  Security,
  Storage,
  Settings,
  KeyboardCommandKey,
  ChevronLeft,
  ChevronRight,
  Dns,
  People,
  Apps,
} from '@mui/icons-material';

/** 1. Space & Team Switcher with Command+K Palette */
function SpaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const spaces = [
    { id: 'ib', name: 'Департамент ИБ', subtitle: '12 users · 5 projects', icon: <Security />, color: '#818CF8' },
    { id: 'qa', name: 'QA Отдел Розницы', subtitle: '8 users · 3 projects', icon: <Speed />, color: '#38BDF8' },
    { id: 'mobile', name: 'Команда Мобильной Платформы', subtitle: '4 users · 2 projects', icon: <Apps />, color: '#3FB27F' },
    { id: 'infra', name: 'Infrastructure Team', subtitle: '3 users · 1 project', icon: <Storage />, color: '#F59E0B' },
  ];

  const filtered = spaces.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Box>
      <Card
        onClick={() => setOpen(true)}
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <Box sx={{ width: 36, height: 36, borderRadius: 2, background: 'linear-gradient(135deg, #38BDF8, #7A1FA2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
          <Security />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>Департамент ИБ</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>12 users · 5 projects</Typography>
        </Box>
        <Chip
          size="small"
          icon={<KeyboardCommandKey sx={{ fontSize: 12 }} />}
          label="K"
          sx={{ color: 'primary.main', bgcolor: 'rgba(56,189,248,0.12)', fontSize: 10, height: 22 }}
        />
      </Card>

      {/* Command+K Palette Modal */}
      <Drawer
        anchor="top"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 540,
              mx: 'auto',
              mt: 10,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              p: 2,
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            },
          },
        }}
      >
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search space, team, project... (Esc to close)"
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary', fontSize: 18 }} /></InputAdornment>,
            },
          }}
          sx={{ mb: 1.5 }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, px: 1, mb: 0.5, display: 'block' }}>
          AVAILABLE SPACES
        </Typography>
        <List dense>
          {filtered.map((s) => (
            <ListItemButton
              key={s.id}
              onClick={() => setOpen(false)}
              sx={{ borderRadius: 1.5, mb: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <ListItemIcon sx={{ color: s.color, minWidth: 32 }}>{s.icon}</ListItemIcon>
              <ListItemText
                primary={<Typography sx={{ color: 'text.primary', fontSize: 12, fontWeight: 600 }}>{s.name}</Typography>}
                secondary={<Typography sx={{ color: 'text.secondary', fontSize: 10 }}>{s.subtitle}</Typography>}
              />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </Box>
  );
}

/** 2. Sidebar Variant Components */
function SidebarVariant({ type }: { type: 'collapsed' | 'expanded' }) {
  const [active, setActive] = useState('dash');

  const items = [
    { id: 'dash', label: 'Dashboard', icon: <DashboardOutlined /> },
    { id: 'infra', label: 'Control Panel', icon: <Dns /> },
    { id: 'secops', label: 'SecOps Blank', icon: <Security /> },
    { id: 'threats', label: 'Threat Center', icon: <BugReport /> },
    { id: 'settings', label: 'Settings', icon: <Settings /> },
  ];

  if (type === 'collapsed') {
    return (
      <Box sx={{ width: 56, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg, #38BDF8, #7A1FA2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, mb: 1 }}>
          P&lt;
        </Box>
        {items.map((it) => (
          <IconButton
            key={it.id}
            size="small"
            onClick={() => setActive(it.id)}
            sx={{
              color: active === it.id ? 'primary.main' : 'text.secondary',
              bgcolor: active === it.id ? 'rgba(56,189,248,0.12)' : 'transparent',
              borderRadius: 1.5,
              p: 1,
            }}
          >
            {it.icon}
          </IconButton>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ width: 220, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg, #38BDF8, #7A1FA2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>
          P&lt;
        </Box>
        <Box>
          <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 13 }}>PrettyK SecOps</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>Enterprise v3.2</Typography>
        </Box>
      </Box>

      <List dense sx={{ p: 0 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.id}
            onClick={() => setActive(it.id)}
            sx={{
              borderRadius: 1.5,
              mb: 0.5,
              bgcolor: active === it.id ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: active === it.id ? 'primary.main' : 'text.secondary',
            }}
          >
            <ListItemIcon sx={{ color: active === it.id ? 'primary.main' : 'text.secondary', minWidth: 32 }}>
              {it.icon}
            </ListItemIcon>
            <ListItemText
              primary={<Typography sx={{ fontSize: 12, fontWeight: active === it.id ? 700 : 500 }}>{it.label}</Typography>}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

/** 3. Header Variants */
function DashboardHeader({ variant }: { variant: 'simple' | 'stats' | 'tabs' }) {
  return (
    <Box>
      {variant === 'simple' && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 18 }}>Control Center</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>PrettyK Live Daemon Cluster</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" sx={{ fontSize: 11, textTransform: 'none' }}>Export Audit</Button>
            <Button size="small" variant="contained" sx={{ background: 'linear-gradient(135deg, #38BDF8, #7A1FA2)', color: '#fff', fontSize: 11, textTransform: 'none' }}>
              Launch Fuzzer
            </Button>
          </Box>
        </Box>
      )}

      {variant === 'stats' && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          {[
            { label: 'Active Scans', val: '12', icon: <BugReport />, color: '#EF4444' },
            { label: 'Pass Rate', val: '94%', icon: <Speed />, color: '#10B981' },
            { label: 'Experts Online', val: '5', icon: <People />, color: '#38BDF8' },
          ].map((s) => (
            <Card key={s.label} sx={{ p: 2, minWidth: 140, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ color: s.color, fontSize: 24 }}>{s.icon}</Box>
              <Box>
                <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 18 }}>{s.val}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>{s.label}</Typography>
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {variant === 'tabs' && (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 20, mb: 1.5 }}>SecOps Control Center</Typography>
          <Tabs value={0} sx={{ '& .MuiTab-root': { color: 'text.secondary', fontSize: 12, textTransform: 'none', fontWeight: 600 }, '& .Mui-selected': { color: 'primary.main' } }}>
            <Tab label="Overview" />
            <Tab label="Findings" />
            <Tab label="Demons" />
            <Tab label="Settings" />
          </Tabs>
        </Box>
      )}
    </Box>
  );
}

export default function NavigationLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 1.5 }}>
          1. Space & Team Switcher (⌘K Command Palette)
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, mb: 2 }}>
          Click the card to open the command palette — search and switch between spaces instantly.
        </Typography>
        <SpaceSwitcher />
      </Box>

      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 1.5 }}>
          2. Dashboard Header Variants
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Card sx={{ p: 3 }}><DashboardHeader variant="simple" /></Card>
          <Card sx={{ p: 3 }}><DashboardHeader variant="stats" /></Card>
          <Card sx={{ p: 3 }}><DashboardHeader variant="tabs" /></Card>
        </Box>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 1.5 }}>
          3. Sidebar & Navigation Drawer Variants
        </Typography>
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box>
            <Typography sx={{ color: 'text.secondary', fontSize: 10, mb: 1, textAlign: 'center' }}>Collapsed</Typography>
            <SidebarVariant type="collapsed" />
          </Box>
          <Box>
            <Typography sx={{ color: 'text.secondary', fontSize: 10, mb: 1, textAlign: 'center' }}>Expanded</Typography>
            <SidebarVariant type="expanded" />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
