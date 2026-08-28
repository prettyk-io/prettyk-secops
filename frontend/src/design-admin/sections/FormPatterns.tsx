import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Chip,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  AlertTitle,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  ExpandMore,
  Public,
  Security,
  KeyboardArrowRight,
  KeyboardArrowLeft,
  CheckCircle as CheckIcon,
  Warning,
  Notifications,
  Search,
  Lock,
  Error as ErrorIcon,
  DensitySmall,
  DensityMedium,
} from '@mui/icons-material';

/** 1. Interactive Form State Matrix (MUI Form Controls) */
function FormStateMatrix({ isCompact }: { isCompact: boolean }) {
  return (
    <Card sx={{ p: isCompact ? 2 : 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', m: 0 }}>
            Comprehensive Form Field State Matrix
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', m: 0 }}>
            Every interaction state validated for administrative CRUD workflows, RBAC constraints, and async validation.
          </Typography>
        </Box>
        <Chip label="9 INTERACTION STATES" size="small" sx={{ bgcolor: 'rgba(56, 189, 248, 0.12)', color: 'primary.main', fontWeight: 700, fontSize: 10 }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
        {/* State 1: Default Idle */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>1. DEFAULT (IDLE)</Typography>
            <Chip label="IDLE" size="small" sx={{ height: 18, fontSize: 9 }} />
          </Box>
          <TextField
            fullWidth
            size={isCompact ? 'small' : 'medium'}
            label="Target Endpoint"
            placeholder="https://api.bank.ru/v1"
            helperText="RFC-3986 format with protocol"
          />
        </Box>

        {/* State 2: Focus / Active Glow */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'primary.main', bgcolor: 'background.paper', boxShadow: '0 0 12px rgba(56, 189, 248, 0.2)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>2. FOCUS-VISIBLE (ACTIVE)</Typography>
            <Chip label="FOCUSED" size="small" color="primary" sx={{ height: 18, fontSize: 9 }} />
          </Box>
          <TextField
            fullWidth
            focused
            size={isCompact ? 'small' : 'medium'}
            label="Authorization Scope"
            defaultValue="control:write secops:fuzz"
            helperText="Active input receiving keyboard focus"
          />
        </Box>

        {/* State 3: Filled & Validated */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>3. VALIDATED (SUCCESS)</Typography>
            <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} />
          </Box>
          <TextField
            fullWidth
            size={isCompact ? 'small' : 'medium'}
            label="OAuth2 Client ID"
            defaultValue="cbr-secops-client-9842"
            color="success"
            slotProps={{
              input: {
                endAdornment: <InputAdornment position="end"><CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /></InputAdornment>,
              },
            }}
            helperText="Verified against CBR identity authority"
          />
        </Box>

        {/* State 4: Server Validation Error (422) */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'error.main', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>4. SERVER ERROR (422)</Typography>
            <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />
          </Box>
          <TextField
            fullWidth
            error
            size={isCompact ? 'small' : 'medium'}
            label="scanner Demon Proxy Port"
            defaultValue="99999"
            helperText="Port number must be between 1024 and 65535"
          />
        </Box>

        {/* State 5: Async Submitting / Loading */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>5. ASYNC LOADING</Typography>
            <CircularProgress size={14} color="inherit" />
          </Box>
          <TextField
            fullWidth
            disabled
            size={isCompact ? 'small' : 'medium'}
            label="GOST Certificate Thumbprint"
            defaultValue="Validating thumbprint on Bank PKI..."
            slotProps={{
              input: {
                endAdornment: <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>,
              },
            }}
            helperText="Cryptographic handshake in progress"
          />
        </Box>

        {/* State 6: Warning State */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'warning.main', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main' }}>6. WARNING THRESHOLD</Typography>
            <Warning sx={{ color: 'warning.main', fontSize: 16 }} />
          </Box>
          <TextField
            fullWidth
            size={isCompact ? 'small' : 'medium'}
            label="Max Probes / Second"
            defaultValue="4,500"
            color="warning"
            helperText="High probe rate may trigger upstream rate limits"
          />
        </Box>

        {/* State 7: Disabled */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', opacity: 0.7 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>7. DISABLED FIELD</Typography>
            <Chip label="DISABLED" size="small" sx={{ height: 18, fontSize: 9 }} />
          </Box>
          <TextField
            fullWidth
            disabled
            size={isCompact ? 'small' : 'medium'}
            label="Legacy Auth Scheme"
            defaultValue="HTTP Basic Auth (Deprecated)"
            helperText="Disabled by box security policy"
          />
        </Box>

        {/* State 8: Read-Only Audit Field */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>8. READ-ONLY AUDIT</Typography>
            <Chip label="READ ONLY" size="small" variant="outlined" sx={{ height: 18, fontSize: 9 }} />
          </Box>
          <TextField
            fullWidth
            size={isCompact ? 'small' : 'medium'}
            label="Created By Operator"
            defaultValue="admin-service@spaceport.cbr.ru"
            slotProps={{ input: { readOnly: true } }}
            helperText="Immutable audit log metadata"
          />
        </Box>

        {/* State 9: Permission Denied (403 RBAC) */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px dashed', borderColor: 'error.main', bgcolor: 'rgba(239, 68, 68, 0.04)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>9. RBAC LOCKED (403)</Typography>
            <Lock sx={{ color: 'error.main', fontSize: 16 }} />
          </Box>
          <TextField
            fullWidth
            disabled
            size={isCompact ? 'small' : 'medium'}
            label="Production Wire Tap Key"
            defaultValue="••••••••••••••••••••••••"
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><Lock sx={{ fontSize: 16, color: 'error.main' }} /></InputAdornment>,
              },
            }}
            helperText="Requires 'secops_lead' privilege to edit"
          />
        </Box>
      </Box>
    </Card>
  );
}

/** 2. Provisioning Wizard */
function ProvisioningWizard({ isCompact }: { isCompact: boolean }) {
  const [step, setStep] = useState(1);
  const [targetUrl, setTargetUrl] = useState('https://juice-shop.prettyk.io');
  const [targetName, setTargetName] = useState('Интернет-банк (juice-shop)');
  const [policy, setPolicy] = useState('owasp-top10');
  const [expert, setExpert] = useState('petrov');
  const [ttl, setTtl] = useState(7);

  const handleNext = () => setStep(Math.min(3, step + 1));
  const handleBack = () => setStep(Math.max(1, step - 1));

  const apps = [
    { id: 'juice', name: 'Интернет-банк (juice-shop)', url: 'https://juice-shop.prettyk.io', env: 'Lab Stand', tags: ['OWASP', 'PCI-DSS'] },
    { id: 'api', name: 'API Шлюз (bank-gateway)', url: 'https://api-gateway.bank.ru', env: 'Staging VPC', tags: ['REST', 'JWT'] },
    { id: 'mobile', name: 'Мобильное приложение (mobile)', url: 'https://mobile.bank.ru', env: 'Production', tags: ['OAuth2', 'CBR'] },
  ];

  return (
    <Card sx={{ p: isCompact ? 2.5 : 3.5 }}>
      <Stepper
        activeStep={step - 1}
        sx={{
          mb: 3.5,
          '& .MuiStepLabel-label': { color: 'text.secondary', fontSize: 12 },
          '& .Mui-active': { color: 'primary.main !important' },
        }}
      >
        <Step><StepLabel>Target & Scope</StepLabel></Step>
        <Step><StepLabel>Policy & Gate</StepLabel></Step>
        <Step><StepLabel>Expert & Assign</StepLabel></Step>
      </Stepper>

      {/* Step 1: Target & Scope */}
      {step === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600, m: 0 }}>
            Select Target Application
          </Typography>
          {apps.map((app) => (
            <Card
              key={app.id}
              onClick={() => { setTargetName(app.name); setTargetUrl(app.url); }}
              sx={{
                p: 2, cursor: 'pointer', transition: 'all 0.15s ease',
                borderColor: targetName === app.name ? 'primary.main !important' : 'divider',
                bgcolor: targetName === app.name ? 'rgba(56, 189, 248, 0.08) !important' : 'background.paper',
                boxShadow: targetName === app.name ? '0 0 12px rgba(56, 189, 248, 0.2)' : undefined,
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Public sx={{ color: 'primary.main', fontSize: 16 }} />
                    <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{app.name}</Typography>
                  </Box>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>{app.url}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Chip size="small" label={app.env} sx={{ color: 'primary.main', bgcolor: 'rgba(56,189,248,0.12)', fontSize: 10, height: 20 }} />
                  {app.tags.map((t) => <Chip key={t} size="small" label={t} sx={{ color: 'text.secondary', bgcolor: 'action.hover', fontSize: 10, height: 20 }} />)}
                </Box>
              </Box>
            </Card>
          ))}

          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <TextField
              fullWidth
              size={isCompact ? 'small' : 'medium'}
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              label="Custom Target URL"
            />
            <TextField
              size={isCompact ? 'small' : 'medium'}
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              label="Name"
              sx={{ width: '50%' }}
            />
          </Box>
        </Box>
      )}

      {/* Step 2: Policy & Gate */}
      {step === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600, m: 0 }}>
            Select Gate Policy
          </Typography>
          {[
            { id: 'owasp-top10', name: 'OWASP Top-10 Gate', severity: 'CRITICAL', desc: 'Max 0 Critical, max 5 High findings' },
            { id: 'cbr-compliance', name: 'CBR Compliance Gate', severity: 'HIGH', desc: 'Full GOST-R and FSTEC audit report required' },
            { id: 'pci-dss', name: 'PCI-DSS Quarterly Scan', severity: 'MEDIUM', desc: 'Max 3 Medium, zero Critical on cardholder data' },
          ].map((p) => (
            <Card
              key={p.id}
              onClick={() => setPolicy(p.id)}
              sx={{
                p: 2, cursor: 'pointer', transition: 'all 0.15s ease',
                borderColor: policy === p.id ? 'secondary.main !important' : 'divider',
                bgcolor: policy === p.id ? 'rgba(129, 140, 248, 0.08) !important' : 'background.paper',
                '&:hover': { borderColor: 'secondary.main' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Security sx={{ color: 'secondary.main', fontSize: 16 }} />
                    <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{p.name}</Typography>
                    <Chip size="small" label={p.severity} sx={{ color: '#ff4d6d', bgcolor: 'rgba(255,77,109,0.15)', fontSize: 9, height: 18 }} />
                  </Box>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{p.desc}</Typography>
                </Box>
              </Box>
            </Card>
          ))}

          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>
              Time To Live (Auto-expire after N days)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={ttl}
                onChange={(_, v) => setTtl(v as number)}
                min={1}
                max={30}
                sx={{ width: '60%', color: 'primary.main' }}
              />
              <Typography sx={{ color: 'primary.main', fontWeight: 700, fontSize: 14, fontFamily: '"JetBrains Mono", monospace' }}>
                {ttl} days
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Step 3: Expert & Assign */}
      {step === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600, m: 0 }}>
            Assign SecOps Expert
          </Typography>
          {[
            { id: 'petrov', name: 'Петров А.В.', role: 'Senior SecOps Expert', workload: 3, avatar: 'PA' },
            { id: 'ivanova', name: 'Иванова М.С.', role: 'SecOps Engineer', workload: 7, avatar: 'IM' },
            { id: 'smirnov', name: 'Смирнов К.Д.', role: 'Junior AppSec Analyst', workload: 1, avatar: 'SK' },
          ].map((e) => (
            <Card
              key={e.id}
              onClick={() => setExpert(e.id)}
              sx={{
                p: 2, cursor: 'pointer', transition: 'all 0.15s ease',
                borderColor: expert === e.id ? '#10B981 !important' : 'divider',
                bgcolor: expert === e.id ? 'rgba(16, 185, 129, 0.08) !important' : 'background.paper',
                '&:hover': { borderColor: '#10B981' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                  {e.avatar}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{e.name}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{e.role}</Typography>
                </Box>
                <Chip
                  size="small"
                  label={`${e.workload} active checks`}
                  sx={{
                    color: e.workload > 5 ? '#EF4444' : '#10B981',
                    bgcolor: e.workload > 5 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                    fontSize: 10, height: 22,
                  }}
                />
              </Box>
            </Card>
          ))}

          <Alert severity="success" icon={<CheckIcon />} sx={{ mt: 1 }}>
            <AlertTitle sx={{ fontWeight: 700, fontSize: 12 }}>Check Provisioning Validated</AlertTitle>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Target: {targetUrl} · Policy: {policy} · Expert: {expert} · TTL: {ttl} days
            </Typography>
          </Alert>
        </Box>
      )}

      {/* Wizard Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={handleBack} disabled={step === 1} startIcon={<KeyboardArrowLeft />} sx={{ color: 'text.secondary', fontSize: 12 }}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={step === 3}
          endIcon={<KeyboardArrowRight />}
          variant="contained"
          sx={{
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 12,
            textTransform: 'none',
            '&:hover': { opacity: 0.9 },
          }}
        >
          {step === 3 ? 'Finish & Assign' : 'Continue'}
        </Button>
      </Box>
    </Card>
  );
}

/** 3. Accordion Form & Alert Filter Bar */
function AccordionAndFilterBar({ isCompact }: { isCompact: boolean }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
      <Card sx={{ p: isCompact ? 2 : 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
          Resource Accordion Configuration
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            { title: 'Infrastructure & Environment', icon: <Public sx={{ color: 'primary.main', fontSize: 18 }} />, content: ['Browser: Chrome (Playwright)', 'Mode: Headed w/ VNC', 'CDP Endpoint: :9222'] },
            { title: 'Authentication & Session', icon: <Security sx={{ color: 'secondary.main', fontSize: 18 }} />, content: ['Scheme: Bearer Token', 'Token TTL: 3600s', 'Re-auth on: 401'] },
            { title: 'Gate Policies & Thresholds', icon: <Warning sx={{ color: 'warning.main', fontSize: 18 }} />, content: ['Critical: 0 allowed', 'High: max 3', 'CWE-89: auto-block'] },
          ].map((section) => (
            <Accordion key={section.title} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', '&::before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {section.icon}
                  <Typography sx={{ color: 'text.primary', fontSize: 13, fontWeight: 600 }}>{section.title}</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                  {section.content.map((c, i) => (
                    <Chip key={i} size="small" label={c} sx={{ color: 'text.secondary', bgcolor: 'action.hover', fontSize: 11, justifyContent: 'flex-start', mr: 'auto' }} />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Card>

      <Card sx={{ p: isCompact ? 2 : 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Admin Filter Bar & Alerts
        </Typography>

        <Alert severity="error" icon={<Warning />}>
          <AlertTitle sx={{ fontWeight: 700, fontSize: 12 }}>Critical Finding Detected</AlertTitle>
          CVE-2026-8842: SQL Injection on /api/v1/auth (CVSS 9.8)
        </Alert>
        <Alert severity="success" icon={<CheckIcon />}>
          <AlertTitle sx={{ fontWeight: 700, fontSize: 12 }}>Gate Passed</AlertTitle>
          Zero regressions across 14 active probe suites.
        </Alert>

        {/* Filter Bar */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', p: 1.5, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            placeholder="Filter by CVE / endpoint..."
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary', fontSize: 16 }} /></InputAdornment> } }}
            sx={{ minWidth: 180, flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ fontSize: 11 }}>Severity</InputLabel>
            <Select label="Severity" defaultValue="">
              <MenuItem value="">All</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Card>
    </Box>
  );
}

export default function FormPatterns() {
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const isCompact = density === 'compact';

  return (
    <Box sx={{ p: isCompact ? 3 : 4, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', m: 0 }}>
            Forms & Interactive State Matrix
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', m: 0 }}>
            Standard administrative CRUD, multi-step wizards, state feedback, and RBAC input controls.
          </Typography>
        </Box>

        {/* Density Switcher */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Density Mode:
          </Typography>
          <ToggleButtonGroup
            value={density}
            exclusive
            onChange={(_, val) => val && setDensity(val)}
            size="small"
            sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
          >
            <ToggleButton value="comfortable" sx={{ px: 1.5, py: 0.5, fontSize: 11, textTransform: 'none', gap: 0.5 }}>
              <DensityMedium sx={{ fontSize: 14 }} /> Comfortable
            </ToggleButton>
            <ToggleButton value="compact" sx={{ px: 1.5, py: 0.5, fontSize: 11, textTransform: 'none', gap: 0.5 }}>
              <DensitySmall sx={{ fontSize: 14 }} /> Compact (SecOps)
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* 1. Form State Matrix */}
      <FormStateMatrix isCompact={isCompact} />

      {/* 2. Provisioning Wizard */}
      <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, m: 0 }}>
        Blank Provisioning Wizard — Target ➔ Policy ➔ Expert
      </Typography>
      <ProvisioningWizard isCompact={isCompact} />

      {/* 3. Accordions and Filter Bar */}
      <AccordionAndFilterBar isCompact={isCompact} />
    </Box>
  );
}
