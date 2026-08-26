import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
} from '@mui/material/styles';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Build,
  Science,
  TrackChanges,
  Dns,
  Security,
  Dashboard as DashIcon,
  Palette,
  GridView,
  History,
  FileUpload,
  Add,
  ArrowForward,
  ArrowBack,
} from '@mui/icons-material';
import { fitFontSizeToWidth, titleTargetWidth } from './homeTitleFit';
import { ShellChrome } from './ShellChrome';
import { PrettyKMark } from '../components/PrettyKMark';
import { importWiredErrorMessage, importWiredJson } from '../utils/importWired';
import { auditAndClampFormDataForRoleCaps, formatRoleCapsThreat, writeRoleCapsThreat } from '../utils/applyRoleCaps';
import { capsForUser, readSession } from './auth';
import { useLocale } from '../locales';

const BROWSER_OPTIONS = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'chrome-headless', label: 'Chrome (headless)' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'firefox-headless', label: 'Firefox (headless)' },
];

export type HomePageProps = {
  onOpenHistory?: () => void;
  onOpenAdmin: () => void;
  onOpenLab?: () => void;
  onOpenControl?: () => void;
  onOpenDashboard?: () => void;
  onStartFresh?: (title: string, url: string, browserType: string) => void;
  onStartSetup?: () => void;
  onStartImported?: (formData: unknown, title: string) => void;
  onStartFromDeploy?: (deployId: string, title: string) => void;
  onLogout?: () => void;
  playEnter?: boolean;
  onEnterPlayed?: () => void;
  canAccessAdmin?: boolean;
  canimportWired?: boolean;
  roleLabel?: string | null;
};

const homeTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#38bdf8' },
    secondary: { main: '#a855f7' },
    background: { default: 'transparent', paper: '#0f172a' },
    text: { primary: '#f8fafc', secondary: '#94a3b8' },
    divider: 'rgba(56, 189, 248, 0.12)',
  },
  typography: { fontFamily: '"Golos UI", "Golos Text", "Segoe UI", system-ui, sans-serif' },
});

/* ── Menu Entry Button ── */
function MenuEntry({
  icon,
  iconColor,
  label,
  subtitle,
  testid,
  onClick,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  subtitle?: string;
  testid: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      data-testid={testid}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        width: '100%',
        p: 1.15,
        px: 1.75,
        border: '1px solid rgba(255, 255, 255, 0.04)',
        borderRadius: 2.5,
        bgcolor: 'rgba(255, 255, 255, 0.02)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        '&:hover': {
          bgcolor: 'rgba(56, 189, 248, 0.08)',
          borderColor: 'rgba(56, 189, 248, 0.25)',
          transform: 'translateX(4px)',
        },
        '&:active': { transform: 'translateX(2px)' },
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `${iconColor}18`,
          border: `1px solid ${iconColor}35`,
          color: iconColor,
          flexShrink: 0,
        }}
      >
        <Box sx={{ fontSize: 20, display: 'flex' }}>{icon}</Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: '#f8fafc', fontWeight: 600, fontSize: 13.5 }}>
          {label}
        </Typography>
        {subtitle && (
          <Typography sx={{ color: '#94a3b8', fontSize: 11, mt: 0.2 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <ArrowForward sx={{ color: '#64748b', fontSize: 16, opacity: 0.5, flexShrink: 0 }} />
    </Box>
  );
}

function MenuDivider() {
  return (
    <Box sx={{ my: 0.5, mx: 1, borderTop: '1px solid rgba(56, 189, 248, 0.08)' }} />
  );
}

function MenuLabel({ text }: { text: string }) {
  return (
    <Typography
      sx={{
        color: '#64748b',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        px: 1,
        pt: 0.6,
        pb: 0.25,
      }}
    >
      {text}
    </Typography>
  );
}

/* ── Main Component ── */
export function HomePage({
  onOpenHistory,
  onOpenAdmin,
  onOpenLab,
  onOpenControl,
  onOpenDashboard,
  onStartFresh,
  onStartSetup,
  onStartImported,
  onLogout,
  playEnter = false,
  onEnterPlayed,
  canAccessAdmin = true,
  canimportWired = true,
  roleLabel = null,
}: HomePageProps): React.JSX.Element {
  const { dict } = useLocale();
  const [step, setStep] = useState<'menu' | 'initiate'>('menu');
  const [createOpen, setCreateOpen] = useState(false);
  const [checkTitle, setCheckTitle] = useState('');
  const [checkUrl, setCheckUrl] = useState('https://');
  const [checkBrowser, setCheckBrowser] = useState('chrome-headless');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entering, setEntering] = useState(playEnter);
  const enterActiveRef = useRef(playEnter);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const handleCreateFreshConfirm = () => {
    if (!checkTitle.trim()) return;
    setCreateOpen(false);
    if (onStartFresh) {
      onStartFresh(checkTitle.trim(), checkUrl.trim(), checkBrowser);
    }
  };

  const handleImportFile = (file: File, customTitle?: string) => {
    void file.text().then((text) => {
      const result = importWiredJson(text);
      if (!result.ok) {
        alert(importWiredErrorMessage(file.name, result));
        return;
      }
      const caps = capsForUser(readSession());
      const { formData, violations } = auditAndClampFormDataForRoleCaps(result.formData, caps);
      if (violations.length > 0) {
        const threat = formatRoleCapsThreat(violations, caps);
        writeRoleCapsThreat(threat);
      }
      setPendingFile(null);
      if (onStartImported) {
        onStartImported(formData, customTitle || file.name.replace(/\.[^/.]+$/, ''));
      }
    }).catch(() => {
      alert(`${file.name}: не удалось прочитать файл`);
    });
  };

  useEffect(() => {
    if (!playEnter || !onEnterPlayed) return;
    enterActiveRef.current = true;
    setEntering(true);
  }, [playEnter, onEnterPlayed]);

  useEffect(() => {
    if (!entering) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq?.matches) return;
    enterActiveRef.current = false;
    setEntering(false);
    onEnterPlayed?.();
  }, [entering, onEnterPlayed]);

  useLayoutEffect(() => {
    if (!titleRef.current) return;
  }, [step]);

  const finishEnter = () => {
    if (!enterActiveRef.current) return;
    enterActiveRef.current = false;
    setEntering(false);
    onEnterPlayed?.();
  };

  /* ── Icons & colors mapping — Canon Cyber Minimal (Cyan + Violet + Blue) ── */
  const CYAN = '#38bdf8';
  const PURPLE = '#818cf8';
  const BLUE = '#60a5fa';
  const AMBER = '#f59e0b';
  const ROSE = '#fb7185';

  return (
    <ThemeProvider theme={homeTheme}>
      <Box
        sx={{
          minHeight: '100vh',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'transparent',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <ShellChrome
          roleLabel={roleLabel}
          onLogout={onLogout}
          showThemeToggle={false}
          showBrand={false}
        />

        {/* Center Container pulled slightly towards header with zero scrollbar */}
        <Box
          data-testid="home-stage"
          className={`pk-home-stage ${entering ? 'pk-home-stage--enter' : ''}`}
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pt: { xs: 1.5, sm: 2, md: 2.5 },
            pb: { xs: 2.5, sm: 3.5, md: 4 },
            px: { xs: 2, sm: 3 },
          }}
        >
          <Box
            onAnimationEnd={finishEnter}
            data-testid="home-panel"
            sx={{
              width: '100%',
              maxWidth: 510,
              p: { xs: 2.5, sm: 3 },
              borderRadius: 4,
              background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.08) 0%, rgba(12, 18, 34, 0.68) 25%, rgba(8, 13, 26, 0.82) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(56, 189, 248, 0.15), inset 0 1px 0 0 rgba(125, 211, 252, 0.3), 0 0 32px rgba(56, 189, 248, 0.08)',
            }}
          >
            {step === 'menu' ? (
              <>
                {/* PrettyK SecOps Masterbrand Lockup inside form */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: -1, mb: 1.2 }}>
                  <PrettyKMark variant="secops" />
                </Box>

                {/* Primary actions */}
                <MenuLabel text={dict.homeMenu.groupChecks} />

                <MenuEntry
                  icon={<Build />}
                  iconColor={CYAN}
                  label={dict.homeMenu.newCheck}
                  subtitle={dict.homeMenu.newCheckSubtitle}
                  testid="home-initiate"
                  onClick={() => setStep('initiate')}
                />
                {onOpenHistory && (
                  <MenuEntry
                    icon={<History />}
                    iconColor={CYAN}
                    label={dict.homeMenu.checkHistory}
                    subtitle={dict.homeMenu.checkHistorySubtitle}
                    testid="studio-modal-history"
                    onClick={onOpenHistory}
                  />
                )}
                <MenuEntry
                  icon={<TrackChanges />}
                  iconColor={AMBER}
                  label={dict.homeMenu.burpKiller}
                  subtitle={dict.homeMenu.burpKillerSubtitle}
                  testid="home-lab"
                  onClick={() => {
                    if (onOpenLab) {
                      onOpenLab();
                    } else {
                      window.location.hash = '#/lab';
                    }
                  }}
                />

                <MenuDivider />

                {/* Admin panels */}
                <MenuLabel text={dict.homeMenu.groupAdmin} />

                <MenuEntry
                  icon={<Dns />}
                  iconColor={BLUE}
                  label={dict.homeMenu.controlPanel}
                  subtitle={dict.homeMenu.controlPanelSubtitle}
                  testid="home-control-panel"
                  onClick={() => onOpenControl?.() ?? void (window.location.hash = '#/control')}
                />

                {canAccessAdmin && (
                  <MenuEntry
                    icon={<Security />}
                    iconColor={PURPLE}
                    label={dict.homeMenu.secOpsControl}
                    subtitle={dict.homeMenu.secOpsControlSubtitle}
                    testid="home-policies"
                    onClick={onOpenAdmin}
                  />
                )}

                <MenuEntry
                  icon={<DashIcon />}
                  iconColor={AMBER}
                  label={dict.homeMenu.dashboard}
                  subtitle={dict.homeMenu.dashboardSubtitle}
                  testid="home-dashboard"
                  onClick={() => onOpenDashboard?.() ?? void (window.location.hash = '#/dashboard')}
                />

                <MenuDivider />

                {/* Tools */}
                <MenuLabel text={dict.homeMenu.groupTools} />

                <MenuEntry
                  icon={<Palette />}
                  iconColor={ROSE}
                  label={dict.homeMenu.designPlayground}
                  subtitle={dict.homeMenu.designPlaygroundSubtitle}
                  testid="home-design-playground"
                  onClick={() => { window.location.hash = '#/design-playground'; }}
                />

                <MenuEntry
                  icon={<GridView />}
                  iconColor={CYAN}
                  label={dict.homeMenu.adminShowcase}
                  subtitle={dict.homeMenu.adminShowcaseSubtitle}
                  testid="home-design-admin"
                  onClick={() => { window.location.hash = '#/design-admin'; }}
                />
              </>
            ) : (
              <Box data-testid="home-initiate-view">
                {/* Initiate screen */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                  <IconButton size="small" onClick={() => { setStep('menu'); setPendingFile(null); }} sx={{ color: '#94a3b8' }}>
                    <ArrowBack fontSize="small" />
                  </IconButton>
                  <Typography sx={{ color: '#f8fafc', fontWeight: 700, fontSize: 16 }}>
                    {dict.homeMenu.freshCheckTitle}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<Add />}
                    onClick={() => {
                      setCreateOpen(true);
                      setCheckTitle('');
                      setCheckUrl('https://');
                      setCheckBrowser('chrome-headless');
                    }}
                    data-testid="studio-modal-fresh"
                    sx={{
                      py: 1.5,
                      bgcolor: CYAN,
                      color: '#080c16',
                      fontWeight: 700,
                      fontSize: 13,
                      '&:hover': { bgcolor: '#0ea5e9' },
                    }}
                  >
                    {dict.homeMenu.newCheck}
                  </Button>

                  {onOpenHistory && (
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<History />}
                      onClick={onOpenHistory}
                      data-testid="studio-modal-history"
                      sx={{ py: 1.25, color: '#f8fafc', borderColor: 'rgba(56, 189, 248, 0.2)', fontWeight: 600, fontSize: 12, '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.4)' } }}
                    >
                      {dict.homeMenu.checkHistory}
                    </Button>
                  )}

                  {canimportWired && (
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<FileUpload />}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="studio-modal-import"
                      sx={{ py: 1.25, color: '#f8fafc', borderColor: 'rgba(56, 189, 248, 0.2)', fontWeight: 600, fontSize: 12, '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.4)' } }}
                    >
                      {pendingFile ? pendingFile.name : dict.homeMenu.importCheck}
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPendingFile(file);
              handleImportFile(file);
            }
            e.target.value = '';
          }}
        />

        {/* Create Fresh Modal */}
        <Dialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          sx={{
            '& .MuiDialog-paper': {
              bgcolor: '#0f172a',
              borderRadius: 3,
              minWidth: 380,
              border: '1px solid rgba(56, 189, 248, 0.2)',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
              p: 1,
              color: '#f8fafc',
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, fontSize: 15, color: '#f8fafc' }}>
            {dict.homeMenu.freshCheckTitle}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Название проверки"
                size="small"
                value={checkTitle}
                onChange={(e) => setCheckTitle(e.target.value)}
                autoFocus
                fullWidth
                placeholder="Моя проверка безопасности"
                sx={{
                  '& .MuiInputLabel-root': { color: '#94a3b8' },
                  '& .MuiOutlinedInput-root': {
                    color: '#f8fafc',
                    '& fieldset': { borderColor: 'rgba(56, 189, 248, 0.2)' },
                    '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                    '&.Mui-focused fieldset': { borderColor: CYAN },
                  },
                }}
              />
              <TextField
                label="URL цели"
                size="small"
                value={checkUrl}
                onChange={(e) => setCheckUrl(e.target.value)}
                fullWidth
                placeholder="https://"
                sx={{
                  '& .MuiInputLabel-root': { color: '#94a3b8' },
                  '& .MuiOutlinedInput-root': {
                    color: '#f8fafc',
                    '& fieldset': { borderColor: 'rgba(56, 189, 248, 0.2)' },
                    '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                    '&.Mui-focused fieldset': { borderColor: CYAN },
                  },
                }}
              />
              <FormControl size="small" fullWidth sx={{
                '& .MuiInputLabel-root': { color: '#94a3b8' },
                '& .MuiOutlinedInput-root': {
                  color: '#f8fafc',
                  '& fieldset': { borderColor: 'rgba(56, 189, 248, 0.2)' },
                  '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                  '&.Mui-focused fieldset': { borderColor: CYAN },
                },
              }}>
                <InputLabel>Браузер</InputLabel>
                <Select
                  value={checkBrowser}
                  label="Браузер"
                  onChange={(e) => setCheckBrowser(e.target.value)}
                  sx={{ color: '#f8fafc' }}
                >
                  {BROWSER_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateOpen(false)} sx={{ color: '#94a3b8' }}>
              Отмена
            </Button>
            <Button
              onClick={handleCreateFreshConfirm}
              variant="contained"
              disabled={!checkTitle.trim()}
              sx={{ bgcolor: CYAN, color: '#080c16', fontWeight: 600, '&:hover': { bgcolor: '#0ea5e9' } }}
            >
              {dict.studio.launchPipeline}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}