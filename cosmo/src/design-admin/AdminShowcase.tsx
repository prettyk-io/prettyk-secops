import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  ThemeProvider,
  createTheme,
} from '@mui/material/styles';
import { ScopedCssBaseline } from '@mui/material';
import { AppBar, Toolbar, Typography, Box, Tabs, Tab, Button, Chip } from '@mui/material';
import {
  GridView,
  DynamicForm,
  Navigation as NavIcon,
  OpenInNew,
  AutoAwesome,
  Home as HomeIcon,
  TextFields,
  Layers,
} from '@mui/icons-material';

// Lazy-loaded tabs
const LivePreviews = lazy(() => import('./tabs/LivePreviews'));

import ThemeOverview from './sections/ThemeOverview';
import DataGallery from './sections/DataGallery';
import FormPatterns from './sections/FormPatterns';
import NavigationLayout from './sections/NavigationLayout';
import {
  DESIGN_FONTS,
  type DesignFontId,
  getStoredFontId,
  setStoredFontId,
  applyFontToDocument,
} from '../design-playground/data/fontSystem';

// ---------------------------------------------------------------------------
// 2 Canon Meta Themes: Meta Dark & Meta Light (Cyan + Violet) with Dynamic Typography
// ---------------------------------------------------------------------------
export type AdminThemeId = 'meta-dark' | 'meta-light';

export function buildAdminTheme(themeId: AdminThemeId, fontId: DesignFontId) {
  const fontOpt = DESIGN_FONTS.find((f) => f.id === fontId) ?? DESIGN_FONTS[0]!;
  const isLight = themeId === 'meta-light';

  return createTheme({
    palette: isLight
      ? {
          mode: 'light',
          primary: { main: '#0284C7', light: '#38BDF8', dark: '#0369A1', contrastText: '#FFFFFF' },
          secondary: { main: '#6366F1', light: '#818CF8', dark: '#4F46E5', contrastText: '#FFFFFF' },
          background: { default: '#F8FAFC', paper: '#FFFFFF' },
          text: { primary: '#0F172A', secondary: '#475569' },
          divider: 'rgba(99, 102, 241, 0.18)',
          error: { main: '#DC2626' },
          warning: { main: '#D97706' },
          success: { main: '#16A34A' },
          info: { main: '#0284C7' },
        }
      : {
          mode: 'dark',
          primary: { main: '#38BDF8', light: '#7DD3FC', dark: '#0284C7', contrastText: '#080C16' },
          secondary: { main: '#818CF8', light: '#A5B4FC', dark: '#6366F1', contrastText: '#FFFFFF' },
          background: { default: '#080D1A', paper: '#0C1220' },
          text: { primary: '#F8FAFC', secondary: '#94A3B8' },
          divider: 'rgba(56, 189, 248, 0.18)',
          error: { main: '#EF4444' },
          warning: { main: '#F59E0B' },
          success: { main: '#10B981' },
          info: { main: '#38BDF8' },
        },
    typography: {
      fontFamily: fontOpt.fontFamily,
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: isLight
      ? {
          MuiCard: { styleOverrides: { root: { background: '#FFFFFF', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 12, boxShadow: '0 2px 12px rgba(15, 23, 42, 0.06)' } } },
          MuiAppBar: { styleOverrides: { root: { background: '#FFFFFF', color: '#0F172A', borderBottom: '1px solid #CBD5E1', boxShadow: 'none' } } },
          MuiPaper: { styleOverrides: { root: { background: '#FFFFFF', border: '1px solid #CBD5E1' } } },
        }
      : {
          MuiCard: { styleOverrides: { root: { background: '#0C1220', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 12, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)' } } },
          MuiAppBar: { styleOverrides: { root: { background: '#080D1A', borderBottom: '1px solid rgba(56, 189, 248, 0.18)', boxShadow: 'none' } } },
          MuiPaper: { styleOverrides: { root: { background: '#0C1220', border: '1px solid rgba(255,255,255,0.08)' } } },
        },
  });
}

export const ADMIN_THEMES: Record<AdminThemeId, ReturnType<typeof createTheme>> = {
  'meta-dark': buildAdminTheme('meta-dark', 'golos'),
  'meta-light': buildAdminTheme('meta-light', 'golos'),
};

const THEME_OPTIONS: { id: AdminThemeId; label: string; color: string; gradient: string; badge: string }[] = [
  { id: 'meta-dark', label: 'Meta Dark', color: '#38BDF8', gradient: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)', badge: 'DARK CANON' },
  { id: 'meta-light', label: 'Meta Light', color: '#0284C7', gradient: 'linear-gradient(135deg, #0284C7 0%, #6366F1 100%)', badge: 'LIGHT CANON' },
];

function PlaceholderTab({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Box sx={{ p: 8, textAlign: 'center' }}>
      <Box sx={{ fontSize: 48, mb: 2, opacity: 0.3 }}>{icon}</Box>
      <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 1 }}>{title}</Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Admin Showcase SPA
// ---------------------------------------------------------------------------
export function AdminShowcase() {
  const [activeTheme, setActiveTheme] = useState<AdminThemeId>('meta-dark');
  const [activeFont, setActiveFont] = useState<DesignFontId>(getStoredFontId);
  const [activeTab, setActiveTab] = useState(0);

  // Dynamically compute the theme with active font family
  const theme = useMemo(() => buildAdminTheme(activeTheme, activeFont), [activeTheme, activeFont]);
  const isLight = theme.palette.mode === 'light';

  useEffect(() => {
    document.title = 'prettyK Admin Design Playground';
    applyFontToDocument(activeFont);
  }, [activeFont]);

  return (
    <ThemeProvider theme={theme}>
      <ScopedCssBaseline>
        <Box
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: 'background.default',
            color: 'text.primary',
            fontFamily: theme.typography.fontFamily,
            transition: 'background-color 0.25s ease, color 0.25s ease',
          }}
        >
          {/* Global AppBar with Symmetrical Header & Controls */}
          <AppBar
            position="static"
            elevation={0}
            sx={{
              zIndex: 30,
              background: isLight ? '#ffffff' : '#080D1A',
              borderBottom: isLight ? '1px solid #cbd5e1' : '1px solid rgba(56, 189, 248, 0.18)',
              boxShadow: 'none',
              py: 0.5,
            }}
          >
            <Toolbar
              variant="dense"
              sx={{
                minHeight: '48px !important',
                px: { xs: 2, md: 3 },
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Home Button */}
                <Button
                  size="small"
                  variant="text"
                  onClick={() => { window.location.hash = '#/home'; }}
                  sx={{
                    color: isLight ? '#475569' : '#94a3b8',
                    height: 32,
                    px: 1.2,
                    minWidth: 'auto',
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: 'none',
                    '&:hover': { color: isLight ? '#0f172a' : '#ffffff', bgcolor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' },
                  }}
                >
                  <HomeIcon sx={{ fontSize: 16, mr: 0.8 }} />
                  Home
                </Button>

                {/* Masterbrand Logo Asset */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <Box
                    component="img"
                    src={isLight ? '/brand/prettyk-logo-black.png' : '/brand/prettyk-logo-temp.png'}
                    alt="pretty<"
                    sx={{ height: 24, objectFit: 'contain' }}
                  />
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      color: isLight ? '#64748b' : '#94a3b8',
                    }}
                  >
                    ADMIN SHOWCASE
                  </Typography>
                </Box>

                {/* Symmetrical Cross-linking Button to Studio Playground */}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { window.location.hash = '#/design-playground'; }}
                  sx={{
                    height: 32,
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'none',
                    borderColor: isLight ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.4)',
                    color: isLight ? '#4f46e5' : '#a5b4fc',
                    bgcolor: isLight ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.15)',
                    ml: 0.5,
                    px: 1.5,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    '&:hover': {
                      bgcolor: isLight ? 'rgba(79, 70, 229, 0.15)' : 'rgba(99, 102, 241, 0.25)',
                      color: isLight ? '#4338ca' : '#ffffff',
                    },
                  }}
                >
                  <AutoAwesome sx={{ fontSize: 14, mr: 0.5, color: isLight ? '#4f46e5' : '#818cf8' }} />
                  Studio Playground (shadcn) →
                </Button>
              </Box>

              {/* Right-hand Controls: Font Switcher + Theme Selector */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                {/* 1. Global Font Switcher */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextFields sx={{ fontSize: 14, color: isLight ? '#0284C7' : '#38BDF8' }} />
                    Font:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.6, p: 0.3, borderRadius: 1.5, bgcolor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid', borderColor: 'divider' }}>
                    {DESIGN_FONTS.map((f) => {
                      const isAct = f.id === activeFont;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setActiveFont(f.id);
                            setStoredFontId(f.id);
                          }}
                          style={{
                            padding: '4px 9px',
                            borderRadius: 5,
                            border: 'none',
                            background: isAct ? (isLight ? '#0284C7' : '#38BDF8') : 'transparent',
                            color: isAct ? (isLight ? '#FFFFFF' : '#080C16') : (isLight ? '#475569' : '#94A3B8'),
                            fontWeight: isAct ? 700 : 500,
                            fontSize: 11,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: isAct ? '0 1px 6px rgba(56,189,248,0.3)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          title={`${f.name} (${f.sublabel})\n${f.description}`}
                        >
                          <span>{f.name}</span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 3px',
                              borderRadius: 3,
                              background: isAct ? 'rgba(0,0,0,0.2)' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'),
                              color: isAct ? '#FFFFFF' : 'inherit',
                            }}
                          >
                            {f.badge}
                          </span>
                        </button>
                      );
                    })}
                  </Box>
                </Box>

                {/* 2. Top Theme Selector (Meta Dark & Meta Light) */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary' }}>
                    Theme:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.6 }}>
                    {THEME_OPTIONS.map((opt) => {
                      const isAct = opt.id === activeTheme;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setActiveTheme(opt.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: `1.5px solid ${isAct ? opt.color : 'rgba(128,128,128,0.2)'}`,
                            background: isAct ? `${opt.color}25` : 'transparent',
                            color: isAct ? opt.color : 'inherit',
                            fontWeight: isAct ? 800 : 500,
                            fontSize: 11,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: isAct ? `0 0 12px ${opt.color}40` : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.gradient, boxShadow: isAct ? `0 0 8px ${opt.color}` : 'none' }} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            </Toolbar>
          </AppBar>

          {/* Navigation Tabs (4 Flagship Labs) */}
          <Tabs
            value={activeTab}
            onChange={(_e, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              px: 2,
              minHeight: 42,
              bgcolor: 'background.paper',
              '.MuiTab-root': { minHeight: 42, fontSize: 12, fontWeight: 600, textTransform: 'none' },
            }}
          >
            <Tab icon={<AutoAwesome sx={{ fontSize: '16px !important', color: 'primary.main' }} />} iconPosition="start" label="✨ Overview & Tokens" />
            <Tab icon={<DynamicForm sx={{ fontSize: '16px !important' }} />} iconPosition="start" label="Forms & State Matrix" />
            <Tab icon={<GridView sx={{ fontSize: '16px !important' }} />} iconPosition="start" label="Data Grid & Telemetry" />
            <Tab icon={<NavIcon sx={{ fontSize: '16px !important' }} />} iconPosition="start" label="Navigation & Live RBAC" />
          </Tabs>

          {/* Tab Content */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: 'background.default' }}>
            {activeTab === 0 && <ThemeOverview />}
            {activeTab === 1 && <FormPatterns />}
            {activeTab === 2 && <DataGallery />}
            {activeTab === 3 && <NavigationLayout />}
          </Box>

          {/* Footer */}
          <Box sx={{ px: 2, py: 0.8, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', bgcolor: 'background.paper' }}>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>
              MUI v9 · React Admin · Minimal UI v7.7 Plus · Active Font: {DESIGN_FONTS.find(f => f.id === activeFont)?.name}
            </Typography>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'JetBrains Mono' }}>
              PrettyK Design Workbench · prettyk.io
            </Typography>
          </Box>
        </Box>
      </ScopedCssBaseline>
    </ThemeProvider>
  );
}

export default AdminShowcase;
