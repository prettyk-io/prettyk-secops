import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Paper,
  TextField,
  InputAdornment,
  useTheme,
} from '@mui/material';
import {
  AutoAwesome,
  BugReport,
  Speed,
  Shield,
  Refresh,
  DesignServices,
  Layers,
  Search,
  Tune,
} from '@mui/icons-material';

export default function ThemeOverview() {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';

  const [triageStatus, setTriageStatus] = useState<Record<string, string>>({
    'CVE-2026-8842': 'active',
    'CVE-2026-7719': 'resolved',
    'CVE-2026-5587': 'active',
  });
  const [btnLoading, setBtnLoading] = useState(false);
  const [demoInput, setDemoInput] = useState('https://juice-shop.prettyk.io/api/v1/auth');

  const prim = theme.palette.primary.main;
  const sec = theme.palette.secondary.main;
  const bgCard = theme.palette.background.paper;
  const borderCol = theme.palette.divider;

  const designerFeatures = [
    {
      icon: <DesignServices sx={{ color: '#ec4899', fontSize: 22 }} />,
      title: '1. 1-to-1 Figma Token Parity (Plus Pack)',
      desc: 'Minimal UI v7.7 master kit includes all Figma components. Colors, spacing steps (4px/8px), and typography map directly 1-to-1 to MUI theme tokens without translation overhead.',
      tag: 'FIGMA 1:1',
      tagColor: '#ec4899',
    },
    {
      icon: <Layers sx={{ color: prim, fontSize: 22 }} />,
      title: '2. Soft Elevation & Alpha Channels (varAlpha)',
      desc: 'Zero harsh black borders. Dividers, surface layers, and card insets use custom alpha-channel math (varAlpha) for comfortable, glare-free dark contrast during long audit sessions.',
      tag: 'ZERO-GLARE',
      tagColor: prim,
    },
    {
      icon: <AutoAwesome sx={{ color: sec, fontSize: 22 }} />,
      title: '3. Dual Cyan + Violet Brand Glow',
      desc: 'Floating cards, active nodes, and severity alerts emit electric cyan (#38BDF8) and violet (#818CF8 / #7A1FA2) neon glow matching the signature Pretty< master identity.',
      tag: 'CYAN + VIOLET',
      tagColor: sec,
    },
    {
      icon: <Speed sx={{ color: '#2ee6a8', fontSize: 22 }} />,
      title: '4. Dense Enterprise Information Architecture',
      desc: 'High-density DataGrid tables, multi-metric KPI cards, sparklines, and live telemetry pulse grids designed for deep data visualization without visual clutter.',
      tag: 'DATA DENSE',
      tagColor: '#2ee6a8',
    },
    {
      icon: <Tune sx={{ color: '#f59e0b', fontSize: 22 }} />,
      title: '5. 40+ Pre-Styled Enterprise Components',
      desc: 'Complete commercial component suite: 3-step Provisioning Wizards, Accordion forms, Select dropdowns, Toggle switches, Drawers, and Dialog modals.',
      tag: '40+ OVERRIDES',
      tagColor: '#f59e0b',
    },
    {
      icon: <Shield sx={{ color: '#06b6d4', fontSize: 22 }} />,
      title: '6. Scoped CSS Isolation (<ScopedCssBaseline>)',
      desc: 'MUI is isolated within <ScopedCssBaseline> and StyledEngineProvider injectFirst — guarantees MUI never leaks into or conflicts with Studio shadcn/ui + Tailwind v4.',
      tag: 'ISOLATED',
      tagColor: '#06b6d4',
    },
  ];

  const stackPills = [
    { label: 'UI Framework', val: 'Material UI v5/v6', color: prim },
    { label: 'Admin Engine', val: 'React Admin 5.15 (Marmelab)', color: sec },
    { label: 'Color Canon', val: 'Cyan (#38BDF8) + Violet (#818CF8)', color: '#38BDF8' },
    { label: 'Theme Foundation', val: 'Minimal UI v7.7 Plus Pack', color: '#2ee6a8' },
    { label: 'Data Tables', val: '@mui/x-data-grid 9.12', color: '#f59e0b' },
    { label: 'Isolation', val: 'ScopedCssBaseline + injectFirst', color: '#06b6d4' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5, maxWidth: 1100, mx: 'auto' }}>
      {/* 1. Master Hero Banner */}
      <Paper
        sx={{
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 3,
          background: isLight
            ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(99, 102, 241, 0.08) 50%, #FFFFFF 100%)'
            : `linear-gradient(135deg, ${prim}20 0%, ${sec}18 50%, ${theme.palette.background.default} 100%)`,
          border: `1.5px solid ${prim}50`,
          boxShadow: isLight ? '0 4px 20px rgba(0,0,0,0.06)' : `0 8px 32px rgba(0, 0, 0, 0.45), 0 0 20px ${prim}15`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box component="img" src="/brand/prettyk-logo-temp.png" alt="pretty<" sx={{ height: 26, objectFit: 'contain' }} />
            <Typography
              sx={{
                fontFamily: '"Golos UI", sans-serif',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: prim,
              }}
            >
              ADMIN DESIGN SYSTEM & CYBER MINIMAL THEME
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label="CYAN + VIOLET CANON"
              size="small"
              sx={{
                background: `${prim}20`,
                color: prim,
                border: `1px solid ${prim}50`,
                fontWeight: 700,
                fontSize: 10,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            />
            <Chip
              label="FIGMA DESIGN SYSTEM"
              size="small"
              sx={{
                background: 'rgba(236, 72, 153, 0.15)',
                color: '#f472b6',
                border: '1px solid rgba(236, 72, 153, 0.4)',
                fontWeight: 700,
                fontSize: 10,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            />
          </Box>
        </Box>

        <Typography
          variant="h4"
          sx={{
            color: 'text.primary',
            fontWeight: 800,
            fontSize: { xs: 20, md: 26 },
            lineHeight: 1.3,
            mb: 1,
            letterSpacing: '-0.02em',
          }}
        >
          Frontend Stack & Minimal UI Architecture
        </Typography>

        <Typography sx={{ color: 'text.secondary', fontSize: 13, lineHeight: 1.6, maxWidth: 880, mb: 2 }}>
          The foundation of the PrettyK Admin system is built on the commercial <strong>Minimal UI v7.7 Plus</strong> package adapted for SecOps Control, Control Panel, and Dashboard.
          The frontend stack utilizes <strong>React 18 + React Admin 5.15 (Marmelab) + Material UI v5/v6 + @mui/x-data-grid + ScopedCssBaseline</strong> with the canonical <strong>Cyan + Violet</strong> duo across both Dark and Light modes.
        </Typography>

        {/* Stack Pills Matrix */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {stackPills.map((pill) => (
            <Box
              key={pill.label}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                background: isLight ? '#FFFFFF' : 'rgba(11, 16, 28, 0.7)',
                border: `1px solid ${pill.color}50`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 600 }}>{pill.label}:</Typography>
              <Typography sx={{ color: pill.color, fontSize: 11, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                {pill.val}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* 2. Official High-Resolution Minimal UI Showcase Image (proper.webp, 700x385 rendered, 16px radius, MUI Store shadow) */}
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
        <Paper
          elevation={0}
          sx={{
            maxWidth: 700,
            width: '100%',
            aspectRatio: '20 / 11',
            borderRadius: '16px',
            overflow: 'hidden',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: isLight
              ? '0 0 2px 0 rgba(145, 158, 171, 0.2), 0 20px 40px -4px rgba(145, 158, 171, 0.12)'
              : '0 0 2px 0 rgba(0, 0, 0, 0.4), 0 24px 48px -8px rgba(0, 0, 0, 0.56)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: isLight
                ? '0 0 2px 0 rgba(145, 158, 171, 0.24), 0 24px 48px -4px rgba(145, 158, 171, 0.18)'
                : `0 0 2px 0 rgba(0, 0, 0, 0.4), 0 28px 56px -8px rgba(0, 0, 0, 0.65), 0 0 20px ${prim}20`,
            },
          }}
        >
          <Box
            component="img"
            src="/brand/proper.webp"
            alt="Minimal UI v7.7 Store Showcase"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </Paper>
      </Box>

      {/* 3. Core Features */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          🎨 Core Design System Features
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {designerFeatures.map((feat) => (
            <Paper
              key={feat.title}
              sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: bgCard,
                border: `1px solid ${borderCol}`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: `${feat.tagColor}80`,
                  boxShadow: `0 4px 20px ${feat.tagColor}20`,
                },
              }}
            >
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  {feat.icon}
                  <Chip
                    label={feat.tag}
                    size="small"
                    sx={{
                      color: feat.tagColor,
                      background: `${feat.tagColor}15`,
                      border: `1px solid ${feat.tagColor}40`,
                      fontWeight: 700,
                      fontSize: 9,
                      height: 20,
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  />
                </Box>
                <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 13, mb: 0.5 }}>
                  {feat.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.5 }}>
                  {feat.desc}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>

      {/* 4. Live Interactive Component Demos */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          ⚡ Live Interactive Feature Demos
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          {/* Demo 1: Real-time SecOps Threat Triage */}
          <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: bgCard, border: `1px solid ${borderCol}`, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BugReport sx={{ color: '#f85149', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>
                    Live Vulnerability Triage Action Bar
                  </Typography>
                </Box>
                <Chip size="small" label="INTERACTIVE" sx={{ bgcolor: 'rgba(248,81,73,0.15)', color: '#f85149', fontSize: 9, fontWeight: 700 }} />
              </Box>
              <Typography sx={{ color: 'text.secondary', fontSize: 11, mb: 2 }}>
                Click status buttons to test immediate state transitions and triage actions.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[
                  { cve: 'CVE-2026-8842', title: 'SQL Injection on /api/v1/auth', severity: 'CRITICAL', color: '#f85149' },
                  { cve: 'CVE-2026-7719', title: 'Reflected XSS on /search?q=', severity: 'HIGH', color: '#ff4d6d' },
                  { cve: 'CVE-2026-5587', title: 'IDOR / BOLA on /profile', severity: 'MEDIUM', color: '#f0a830' },
                ].map((row) => (
                  <Box
                    key={row.cve}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: isLight ? '#f1f5f9' : '#080c16',
                      border: `1px solid ${borderCol}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ color: row.color, fontWeight: 700, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>{row.cve}</Typography>
                        <Typography sx={{ color: 'text.primary', fontSize: 12, fontWeight: 600 }}>{row.title}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button
                        size="small"
                        variant={triageStatus[row.cve] === 'active' ? 'contained' : 'outlined'}
                        onClick={() => setTriageStatus({ ...triageStatus, [row.cve]: 'active' })}
                        sx={{ fontSize: 9, height: 22, minWidth: 44, bgcolor: triageStatus[row.cve] === 'active' ? '#f85149' : 'transparent', color: '#fff' }}
                      >
                        Alert
                      </Button>
                      <Button
                        size="small"
                        variant={triageStatus[row.cve] === 'resolved' ? 'contained' : 'outlined'}
                        onClick={() => setTriageStatus({ ...triageStatus, [row.cve]: 'resolved' })}
                        sx={{ fontSize: 9, height: 22, minWidth: 44, bgcolor: triageStatus[row.cve] === 'resolved' ? '#3fb27f' : 'transparent', color: '#fff' }}
                      >
                        Fixed
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>

          {/* Demo 2: Button Variants & Elevation */}
          <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: bgCard, border: `1px solid ${borderCol}`, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AutoAwesome sx={{ color: prim, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>
                    Button Variants & Cyan/Violet Duo
                  </Typography>
                </Box>
                <Chip size="small" label="MUI OVERRIDES" sx={{ bgcolor: `${prim}15`, color: prim, fontSize: 9, fontWeight: 700 }} />
              </Box>
              <Typography sx={{ color: 'text.secondary', fontSize: 11, mb: 2 }}>
                Pre-styled Minimal UI button classes with cyan/violet duo glow and smooth transitions.
              </Typography>

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => { setBtnLoading(true); setTimeout(() => setBtnLoading(false), 700); }}
                  sx={{
                    background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 50%, #7A1FA2 100%)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 12,
                    boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)',
                    textTransform: 'none',
                  }}
                >
                  {btnLoading ? <Refresh className="animate-spin" sx={{ fontSize: 16 }} /> : 'Brand Gradient CTA'}
                </Button>
                <Button
                  variant="contained"
                  sx={{ bgcolor: `${sec}25`, color: sec, border: `1px solid ${sec}50`, fontWeight: 600, fontSize: 12, textTransform: 'none' }}
                >
                  Violet Accent
                </Button>
                <Button
                  variant="outlined"
                  sx={{ borderColor: prim, color: prim, fontWeight: 600, fontSize: 12, textTransform: 'none' }}
                >
                  Cyan Outlined
                </Button>
                <Button
                  variant="contained"
                  sx={{ bgcolor: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 600, fontSize: 12, textTransform: 'none' }}
                >
                  Soft Danger
                </Button>
              </Box>

              {/* Input Demo */}
              <TextField
                fullWidth
                size="small"
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                placeholder="https://target/api"
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start"><Search sx={{ color: prim, fontSize: 16 }} /></InputAdornment>,
                    sx: { color: 'text.primary', fontSize: 12, bgcolor: isLight ? '#ffffff' : '#080c16' },
                  },
                }}
                sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: `${prim}50` } } }}
              />
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
