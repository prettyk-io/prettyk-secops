/** AUTH-PROF F-1: Profile Drawer — Cyber Dark Glass with 3 tabs. */
import { useState, useEffect } from 'react';
import {
  Drawer, Box, Typography, TextField, Button, Chip, IconButton,
  Tabs, Tab, FormControl, Select, MenuItem, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Snackbar,
} from '@mui/material';
import {
  Close, Person, Palette, Key, ContentCopy, Add, Delete, Check, Shield,
} from '@mui/icons-material';
import { useProfileStore, type UserCapability, type PersonalAccessToken } from './useProfileStore';
import { authClient } from './betterAuthClient';

const CAPABILITY_LABELS: Record<UserCapability, string> = {
  'admin:access': 'Admin Access', 'control:access': 'Control Panel', 'checks:create': 'Create Checks',
  'checks:import': 'Import Checks', 'checks:delete': 'Delete Checks', 'fuzzer:execute': 'Fuzzer Execute',
  'policies:manage': 'Manage Policies', 'retention:clean': 'Retention Clean', 'tokens:manage': 'Manage Tokens',
  'dojo:sync': 'Dojo Sync', 'studio:edit': 'Studio Edit',
};

const ALL_CAPABILITIES: UserCapability[] = [
  'admin:access', 'control:access', 'checks:create', 'checks:import', 'checks:delete',
  'fuzzer:execute', 'policies:manage', 'retention:clean', 'tokens:manage', 'dojo:sync', 'studio:edit',
];

const THEME_OPTIONS = [
  { value: 'dark' as const, label: 'Meta Dark' },
  { value: 'light' as const, label: 'Meta Light' },
  { value: 'system' as const, label: 'System' },
];
const FONT_OPTIONS = [
  { value: 'golos' as const, label: 'Golos UI (CANON)' },
  { value: 'astra' as const, label: 'PT Astra Sans (ГОСТ)' },
  { value: 'inter' as const, label: 'Inter (DEFAULT)' },
];
const LOCALE_OPTIONS = [
  { value: 'ru' as const, label: 'Русский' },
  { value: 'en' as const, label: 'English' },
];
const EXPIRY_OPTIONS = [
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 0, label: 'Бессрочно' },
];

function TokenRow({ token, onRevoke }: { token: PersonalAccessToken; onRevoke: () => void }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 12 }}>{token.name}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>{token.tokenMasked}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
          {token.scopes.map((scope) => (
            <Chip key={scope} label={CAPABILITY_LABELS[scope]} size="small" sx={{ fontSize: 8, height: 18, color: '#22c55e', background: 'rgba(34,197,94,0.1)' }} />
          ))}
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: 9, mt: 0.5 }}>
          Created {new Date(token.createdAt).toLocaleDateString('ru-RU')}
          {token.lastUsedAt && ` · Used ${new Date(token.lastUsedAt).toLocaleDateString('ru-RU')}`}
          {token.expiresAt && ` · Expires ${new Date(token.expiresAt).toLocaleDateString('ru-RU')}`}
          {!token.expiresAt && ' · Never expires'}
        </Typography>
      </Box>
      <Tooltip title="Revoke">
        <IconButton size="small" onClick={onRevoke} sx={{ color: '#ef4444' }}><Delete sx={{ fontSize: 16 }} /></IconButton>
      </Tooltip>
    </Box>
  );
}

export function ProfileDrawer() {
  const profile = useProfileStore((s) => s.profile);
  const tokens = useProfileStore((s) => s.tokens);
  const drawerOpen = useProfileStore((s) => s.drawerOpen);
  const closeDrawer = useProfileStore((s) => s.closeDrawer);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const savePreferences = useProfileStore((s) => s.savePreferences);
  const syncFromServer = useProfileStore((s) => s.syncFromServer);
  const setTokens = useProfileStore((s) => s.setTokens);

  useEffect(() => {
    if (drawerOpen) syncFromServer();
  }, [drawerOpen, syncFromServer]);

  const [tab, setTab] = useState(0);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [dept, setDept] = useState(profile.department);
  const [saveMsg, setSaveMsg] = useState('');
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenScopes, setTokenScopes] = useState<UserCapability[]>(['checks:create']);
  const [tokenExpiry, setTokenExpiry] = useState(30);
  const [rawToken, setRawToken] = useState('');
  const [copied, setCopied] = useState(false);

  const initials = profile.name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
  const p = profile.preferences;

  const handleSaveProfile = async () => {
    await saveProfile({ name, email, department: dept });
    setSaveMsg('Saved');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleCreateToken = async () => {
    const result = await authClient.apiKey.create({
      name: tokenName || `Token #${tokens.length + 1}`,
      expiresIn: tokenExpiry > 0 ? tokenExpiry : null,
      scopes: tokenScopes,
    });
    if (result) {
      const updated = [...tokens, result.key];
      setTokens(updated);
      try { localStorage.setItem('pk.tokens.v1', JSON.stringify(updated)); } catch { /* ignore */ }
      setRawToken(result.rawToken);
    }
    setShowTokenDialog(false);
    setTokenName('');
    setTokenScopes(['checks:create']);
    setTokenExpiry(30);
  };

  const handleRevokeToken = async (id: string) => {
    await authClient.apiKey.delete(id);
    const updated = tokens.filter((t) => t.id !== id);
    setTokens(updated);
    try { localStorage.setItem('pk.tokens.v1', JSON.stringify(updated)); } catch { /* ignore */ }
  };

  return (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={closeDrawer}
      slotProps={{ paper: {
        sx: {
          width: 420, maxWidth: '100vw',
          background: 'linear-gradient(180deg, #0f172a 0%, #080c16 100%)',
          borderLeft: '1px solid rgba(56,189,248,0.15)',
          backdropFilter: 'blur(20px)',
        },
      }}}
    >
      {/* Header */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(56,189,248,0.12)' }}>
        <Box sx={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, #38bdf8, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Golos UI, sans-serif', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initials}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{profile.name}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{profile.email}</Typography>
          <Chip icon={<Shield sx={{ fontSize: '12px !important' }} />} label={profile.role === 'admin_sec' ? 'Администратор ИБ' : profile.role} size="small" sx={{ mt: 0.5, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', fontSize: 9, fontWeight: 600 }} />
        </Box>
        <IconButton onClick={closeDrawer} sx={{ color: '#64748b' }}><Close sx={{ fontSize: 20 }} /></IconButton>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '.MuiTab-root': { minHeight: 36, fontSize: 11, fontWeight: 600, textTransform: 'none' } }}>
        <Tab icon={<Person sx={{ fontSize: '14px !important' }} />} iconPosition="start" label="Profile" />
        <Tab icon={<Palette sx={{ fontSize: '14px !important' }} />} iconPosition="start" label="Appearance" />
        <Tab icon={<Key sx={{ fontSize: '14px !important' }} />} iconPosition="start" label="Tokens" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>

        {/* ── Tab 0: General ── */}
        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Name" fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Email" fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Department" fullWidth size="small" value={dept} onChange={(e) => setDept(e.target.value)} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {profile.capabilities.map((c) => (
                <Chip key={c} label={CAPABILITY_LABELS[c]} size="small" sx={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)', fontSize: 9, fontWeight: 600 }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="contained" size="small" onClick={handleSaveProfile} sx={{ fontSize: 11 }}>Save Changes</Button>
              {saveMsg && <Typography sx={{ color: '#22c55e', fontSize: 11 }}>{saveMsg}</Typography>}
            </Box>
          </Box>
        )}

        {/* ── Tab 1: Appearance ── */}
        {tab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Theme</InputLabel>
              <Select value={p.theme} label="Theme" onChange={(e) => savePreferences({ theme: e.target.value as any })}>
                {THEME_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Font</InputLabel>
              <Select value={p.font} label="Font" onChange={(e) => savePreferences({ font: e.target.value as any })}>
                {FONT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Language</InputLabel>
              <Select value={p.locale} label="Language" onChange={(e) => savePreferences({ locale: e.target.value as any })}>
                {LOCALE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* ── Tab 2: Tokens ── */}
        {tab === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => setShowTokenDialog(true)} sx={{ fontSize: 11, alignSelf: 'flex-start' }}>
              Create Access Token
            </Button>
            {tokens.map((t) => <TokenRow key={t.id} token={t} onRevoke={() => handleRevokeToken(t.id)} />)}
            {tokens.length === 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: 12, textAlign: 'center', py: 4 }}>No API tokens yet.</Typography>
            )}
          </Box>
        )}

      </Box>

      {/* Raw token banner */}
      <Snackbar open={!!rawToken} autoHideDuration={8000} onClose={() => setRawToken('')} message={rawToken} action={
        <Button size="small" onClick={() => { navigator.clipboard.writeText(rawToken); setCopied(true); }} sx={{ color: '#38bdf8' }}>
          {copied ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
        </Button>
      } />

      {/* Create token dialog */}
      <Dialog open={showTokenDialog} onClose={() => setShowTokenDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Access Token</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth size="small" value={tokenName} onChange={(e) => setTokenName(e.target.value)} sx={{ mb: 2, mt: 1 }} placeholder="CI/CD Pipeline" />
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Scopes</InputLabel>
            <Select multiple value={tokenScopes} label="Scopes" onChange={(e) => setTokenScopes(e.target.value as UserCapability[])}
              renderValue={(selected) => (selected as UserCapability[]).map((s) => CAPABILITY_LABELS[s]).join(', ')}>
              {ALL_CAPABILITIES.map((c) => <MenuItem key={c} value={c}>{CAPABILITY_LABELS[c]}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Expiration</InputLabel>
            <Select value={tokenExpiry} label="Expiration" onChange={(e) => setTokenExpiry(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTokenDialog(false)} size="small">Cancel</Button>
          <Button onClick={handleCreateToken} variant="contained" size="small">Create Token</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}