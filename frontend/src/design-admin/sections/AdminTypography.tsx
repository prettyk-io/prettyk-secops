import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  TextFields,
  Code as CodeIcon,
  Numbers,
  ViewHeadline,
  DensitySmall,
  DensityMedium,
  CheckCircle,
} from '@mui/icons-material';

export default function AdminTypography() {
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const isCompact = density === 'compact';

  const muiVariants = [
    { variant: 'h4', size: '24px', weight: '700', sample: 'SecOps Infrastructure & Access Control', use: 'Page titles, top-level workspace headings' },
    { variant: 'h5', size: '18px', weight: '600', sample: 'Threat Telemetry & Real-Time Probes', use: 'Card titles, modal headings, major section headers' },
    { variant: 'h6', size: '15px', weight: '600', sample: 'Resource Policy #482 (OWASP Top 10)', use: 'Accordion headers, drawer sub-titles, group headers' },
    { variant: 'subtitle1', size: '14px', weight: '600', sample: 'Target Gateway URL & Authentication Scope', use: 'Form section labels, prominent column headers' },
    { variant: 'subtitle2', size: '13px', weight: '500', sample: 'Assigned Security Expert: @v.petrov (CBR SecOps)', use: 'Secondary form headers, list item subheads' },
    { variant: 'body1', size: '13px', weight: '400', sample: 'Automated vulnerability scan triggered with 14 active probe rules across Staging VPC.', use: 'Primary administrative body, notifications, documentation' },
    { variant: 'body2', size: '12px', weight: '400', sample: 'Last sync: 2 minutes ago via agent-daemon-01 (10.240.12.8)', use: 'Grid cell values, secondary metadata, table rows' },
    { variant: 'caption', size: '11px', weight: '400', sample: 'Helper text: Must match RFC-3986 format with strict HTTPS requirement.', use: 'Form field helper text, audit timestamps, footnote hints' },
    { variant: 'overline', size: '10px', weight: '700', sample: 'SECOPS WORKSPACE // GAP-1 BANK ZONE', use: 'Status badges, category tags, uppercase telemetry pills' },
  ];

  return (
    <Box sx={{ p: isCompact ? 3 : 4, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <TextFields sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', m: 0 }}>
              MUI Typography & Dense Data Scale
            </Typography>
            <Chip
              label="GOLOS + JETBRAINS MONO"
              size="small"
              sx={{ bgcolor: 'rgba(56, 189, 248, 0.12)', color: 'primary.main', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em' }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', m: 0 }}>
            Standardized typographic hierarchy engineered specifically for dense data tables, technical payloads, and administrative forms.
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

      {/* 1. MUI Typographic Hierarchy Table */}
      <Card sx={{ p: isCompact ? 2 : 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewHeadline sx={{ fontSize: 18, color: 'primary.main' }} />
          Standard Administrative Variant Scale
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Clean hierarchical progression optimized for readability under high data density.
        </Typography>

        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'transparent' }}>
          <Table size={isCompact ? 'small' : 'medium'}>
            <TableHead sx={{ bgcolor: 'background.paper' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary', width: '15%' }}>VARIANT</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary', width: '12%' }}>SIZE / WEIGHT</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary', width: '48%' }}>LIVE SAMPLE</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary', width: '25%' }}>PRIMARY USE CASE</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {muiVariants.map((row) => (
                <TableRow key={row.variant} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', fontSize: 12 }}>
                    {row.variant}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, color: 'text.secondary', fontFamily: 'monospace' }}>
                    {row.size} / {row.weight}
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant={row.variant as any}
                      sx={{
                        color: 'text.primary',
                        fontSize: isCompact ? `calc(${row.size} - 1px)` : row.size,
                        lineHeight: 1.3,
                      }}
                    >
                      {row.sample}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {row.use}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* 2. Technical Monospace Data Scale (JetBrains Mono) */}
      <Card sx={{ p: isCompact ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, m: 0 }}>
            <CodeIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
            Technical Monospace & Payload Scale (JetBrains Mono)
          </Typography>
          <Chip label="MONO DATA FORMAT" size="small" sx={{ fontSize: 10, bgcolor: 'rgba(129, 140, 248, 0.12)', color: 'secondary.main' }} />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
          Preserves columnar alignment and zero-ambiguity character differentiation for identifiers, hashes, cryptographic tokens, and network dumps.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 1 }}>
              RUN IDENTIFIER & HASH FINGERPRINT
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Session ID:</Typography>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: 'primary.main' }}>
                  run_01j7c93a8e04b72fd
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>SHA-256 Digest:</Typography>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'text.secondary' }}>
                  e3b0c44298fc1c149afbf4c8996fb92427ae41e4...
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>IP Address & Port:</Typography>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'text.primary' }}>
                  10.240.12.8:8767 [TCP_ESTABLISHED]
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 1 }}>
              AUTHENTICATION & RBAC CLAIMS (JWT DECODE)
            </Typography>
            <Box
              component="pre"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                p: 1.5,
                m: 0,
                borderRadius: 1.5,
                bgcolor: 'rgba(0,0,0,0.2)',
                border: '1px solid',
                borderColor: 'divider',
                color: 'primary.light',
                overflowX: 'auto',
              }}
            >
{`{
  "sub": "admin-service@spaceport.cbr.ru",
  "roles": ["admin_service", "secops_lead"],
  "scope": "control:write secops:fuzz telemetry:read",
  "exp": 1787539200
}`}
            </Box>
          </Box>
        </Box>
      </Card>

      {/* 3. KPI & Telemetry Numeric Scale */}
      <Card sx={{ p: isCompact ? 2 : 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Numbers sx={{ fontSize: 18, color: 'primary.main' }} />
          KPI & Metric Number Formats
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
          Tabular numerical figures (`tnum`) ensure numbers align vertically across rows and dashboard KPI cards.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontVariantNumeric: 'tabular-nums', fontSize: isCompact ? 24 : 28, fontWeight: 800, color: 'primary.main' }}>
              99.98%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.5 }}>
              GATE PASS RATE
            </Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontVariantNumeric: 'tabular-nums', fontSize: isCompact ? 24 : 28, fontWeight: 800, color: 'secondary.main' }}>
              1,420
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.5 }}>
              ACTIVE PROBES / SEC
            </Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontVariantNumeric: 'tabular-nums', fontSize: isCompact ? 24 : 28, fontWeight: 800, color: '#10B981' }}>
              0.12 ms
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.5 }}>
              MEDIAN LATENCY
            </Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Golos UI", sans-serif', fontVariantNumeric: 'tabular-nums', fontSize: isCompact ? 24 : 28, fontWeight: 800, color: '#EF4444' }}>
              0 CRIT
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.5 }}>
              BLOCKER FINDINGS
            </Typography>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}
