import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
} from '@mui/material';
import {
  BugReport,
  Shield,
  PlayArrow,
  Speed,
  CheckCircle,
  KeyboardArrowDown,
  KeyboardArrowUp,
  TrendingUp,
  TrendingDown,
  Dns,
  Memory,
  NetworkCheck,
  Timeline,
} from '@mui/icons-material';

/** 1. Sparkline micro-chart component */
function Sparkline({ color, data }: { color: string; data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <svg width="80" height="24" style={{ display: 'block' }}>
      <polyline
        points={data.map((v, i) => `${(i / (data.length - 1)) * 80},${24 - (v / max) * 22}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 2. KPI Card with Sparkline */
function KpiCard({ label, value, change, changeUp, sparkData, icon, color }: {
  label: string; value: string; change: string; changeUp: boolean; sparkData: number[]; icon: React.ReactNode; color: string;
}) {
  return (
    <Card sx={{ p: 2.5, minWidth: 180 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 500 }}>{label}</Typography>
        <Box sx={{ color, fontSize: 18 }}>{icon}</Box>
      </Box>
      <Typography sx={{ color: 'text.primary', fontSize: 22, fontWeight: 700, mb: 0.5 }}>{value}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ color: changeUp ? '#10B981' : '#EF4444', fontSize: 11, fontWeight: 600 }}>
          {changeUp ? <TrendingUp sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} /> : <TrendingDown sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />}
          {change}
        </Typography>
        <Sparkline color={color} data={sparkData} />
      </Box>
    </Card>
  );
}

/** 3. Telemetry Pulse Grid — live daemon cards */
function TelemetryPulseCard({ name, port, status, uptime, rps, icon, color }: {
  name: string; port: string; status: 'live' | 'idle' | 'error'; uptime: string; rps: number; icon: React.ReactNode; color: string;
}) {
  return (
    <Card sx={{ p: 2.5, borderColor: `${color}30`, border: `1px solid ${color}20` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: status === 'live' ? '#10B981' : status === 'error' ? '#EF4444' : 'text.secondary',
            boxShadow: status === 'live' ? `0 0 8px #10B981` : 'none',
          }} />
          <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{name}</Typography>
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>:{port}</Typography>
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: 11, mb: 1.5 }}>Uptime: {uptime} · RPS: {rps}</Typography>
      <Chip
        size="small"
        label={status === 'live' ? 'LIVE' : status === 'error' ? 'DOWN' : 'IDLE'}
        sx={{
          color, bgcolor: `${color}15`,
          border: `1px solid ${color}40`,
          fontSize: 10, fontWeight: 700, height: 20,
        }}
      />
    </Card>
  );
}

/** 4. Cyber Threat DataGrid — expandable threat rows */
function ThreatDataGrid() {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const threats = [
    { id: 1, cve: 'CVE-2026-8842', severity: 'CRITICAL', type: 'SQL Injection', endpoint: '/api/v1/auth', payload: "admin' OR '1'='1", status: 'active', cvss: 9.8, poc: 'HTTP/1.1 200 OK\nSet-Cookie: admin_session=...', response: '<html><div>Welcome admin</div>' },
    { id: 2, cve: 'CVE-2026-7719', severity: 'HIGH', type: 'Reflected XSS', endpoint: '/search?q=<script>', payload: '<img src=x onerror=alert(1)>', status: 'active', cvss: 7.5, poc: 'HTTP/1.1 200 OK\n<script>alert(1)</script>', response: '<div>Results for <script>alert(1)</script>' },
    { id: 3, cve: 'CVE-2026-6621', severity: 'MEDIUM', type: 'SSRF Cloud Meta', endpoint: '/api/proxy', payload: 'http://169.254.169.254/latest/', status: 'mitigated', cvss: 5.3, poc: 'HTTP/1.1 200 OK\nami-id: ami-abc123', response: '{ "status": "ok" }' },
    { id: 4, cve: 'CVE-2026-5587', severity: 'HIGH', type: 'IDOR / BOLA', endpoint: '/api/users/42/profile', payload: 'Change user_id=42 → 41', status: 'active', cvss: 8.1, poc: 'HTTP/1.1 200 OK\n{"email":"ceo@bank.ru"}', response: '{"email":"other@bank.ru","role":"admin"}' },
    { id: 5, cve: 'CVE-2026-4403', severity: 'LOW', type: 'CORS Wildcard', endpoint: '/api/config', payload: 'Origin: evil.com', status: 'acknowledged', cvss: 3.7, poc: 'Access-Control-Allow-Origin: *', response: '{"debug": true, "version": "3.2.1"}' },
  ];

  const severityColors: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#FF4D6D', MEDIUM: '#F59E0B', LOW: '#38BDF8' };

  return (
    <Card sx={{ p: 0 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.paper' }}>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>CVE</TableCell>
              <TableCell sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>Severity</TableCell>
              <TableCell sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>Type / Endpoint</TableCell>
              <TableCell sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>CVSS</TableCell>
              <TableCell sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>Triage</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {threats.map((t) => (
              <React.Fragment key={t.id}>
                <TableRow
                  hover
                  onClick={() => setExpandedRow(expandedRow === t.id ? null : t.id)}
                  sx={{ cursor: 'pointer', bgcolor: expandedRow === t.id ? 'rgba(56, 189, 248, 0.05)' : 'transparent' }}
                >
                  <TableCell>
                    <IconButton size="small" sx={{ color: 'primary.main' }}>
                      {expandedRow === t.id ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ color: 'text.primary', fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {t.cve}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.severity}
                      sx={{
                        bgcolor: `${severityColors[t.severity]}15`,
                        color: severityColors[t.severity],
                        border: `1px solid ${severityColors[t.severity]}40`,
                        fontSize: 9,
                        fontWeight: 700,
                        height: 20,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ color: 'text.primary', fontSize: 12, fontWeight: 500 }}>{t.type}</Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>{t.endpoint}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ color: 'text.primary', fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>
                      {t.cvss}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.status}
                      sx={{
                        bgcolor: t.status === 'active' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                        color: t.status === 'active' ? '#EF4444' : '#10B981',
                        fontSize: 10,
                        height: 20,
                      }}
                    />
                  </TableCell>
                </TableRow>

                {/* Expandable Details */}
                {expandedRow === t.id && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>
                            ATTACK PAYLOAD / EXPLOIT STRING
                          </Typography>
                          <Box component="pre" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid', borderColor: 'divider', color: 'primary.main', fontSize: 11, fontFamily: '"JetBrains Mono", monospace', m: 0 }}>
                            {t.payload}
                          </Box>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>
                            PROOF OF CONCEPT (POC) RESPONSE
                          </Typography>
                          <Box component="pre" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid', borderColor: 'divider', color: 'text.secondary', fontSize: 11, fontFamily: '"JetBrains Mono", monospace', m: 0 }}>
                            {t.poc}
                          </Box>
                        </Box>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

/** 5. Polymorphic Run Card Component */
function RunCardPolymorphic({ run }: { run: { id: string; project: string; type: 'automation' | 'security'; status: 'success' | 'critical' | 'failed'; duration: string; steps: number } }) {
  const isSec = run.type === 'security';
  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isSec ? <Shield sx={{ color: '#818CF8', fontSize: 18 }} /> : <Speed sx={{ color: '#38BDF8', fontSize: 18 }} />}
          <Typography sx={{ color: 'text.primary', fontWeight: 700, fontSize: 13 }}>{run.project}</Typography>
        </Box>
        <Chip
          size="small"
          label={run.type.toUpperCase()}
          sx={{
            bgcolor: isSec ? 'rgba(129,140,248,0.12)' : 'rgba(56,189,248,0.12)',
            color: isSec ? '#818CF8' : '#38BDF8',
            fontSize: 9,
            fontWeight: 700,
            height: 18,
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{run.steps} steps · {run.duration}</Typography>
        <Chip
          size="small"
          label={run.status.toUpperCase()}
          sx={{
            bgcolor: run.status === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            color: run.status === 'success' ? '#10B981' : '#EF4444',
            fontSize: 9,
            fontWeight: 700,
            height: 18,
          }}
        />
      </Box>
    </Card>
  );
}

export default function DataGallery() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5, maxWidth: 1400, mx: 'auto' }}>
      {/* Section A: KPI Cards */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          1. Enterprise KPI Summary Cards with Live Sparklines
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {[
            { label: 'Total Scans', value: '2,847', change: '+12.3%', up: true, spark: [30, 45, 38, 52, 48, 60, 55, 72], icon: <PlayArrow />, color: '#38BDF8' },
            { label: 'Critical Bugs', value: '48', change: '-5.1%', up: false, spark: [12, 15, 10, 18, 14, 11, 9, 7], icon: <BugReport />, color: '#EF4444' },
            { label: 'Pass Rate', value: '94.2%', change: '+2.1%', up: true, spark: [91, 93, 90, 94, 92, 95, 93, 96], icon: <CheckCircle />, color: '#10B981' },
            { label: 'Avg Duration', value: '4m 12s', change: '-18s', up: false, spark: [300, 280, 310, 290, 270, 260, 250, 252], icon: <Speed />, color: '#F59E0B' },
          ].map((k, i) => (
            <KpiCard key={i} {...k} changeUp={k.up} sparkData={k.spark} />
          ))}
        </Box>
      </Box>

      {/* Section B: Telemetry Live Pulse Grid */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          2. Telemetry Live Pulse Grid — Daemon Health Monitor
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
          {[
            { name: 'scanner Demon', port: '8080', status: 'live' as const, uptime: '14d 7h', rps: 48, icon: <NetworkCheck />, color: '#38BDF8' },
            { name: 'PK Live', port: '8767', status: 'live' as const, uptime: '14d 7h', rps: 112, icon: <Timeline />, color: '#38BDF8' },
            { name: 'Allure3', port: '5050', status: 'live' as const, uptime: '14d 7h', rps: 6, icon: <Memory />, color: '#818CF8' },
            { name: 'Browser Core', port: '9222', status: 'live' as const, uptime: '14d 6h', rps: 24, icon: <Dns />, color: '#10B981' },
            { name: 'DefectDojo', port: '8081', status: 'idle' as const, uptime: '14d 7h', rps: 0, icon: <BugReport />, color: '#94A3B8' },
            { name: 'Juice Shop', port: '3000', status: 'live' as const, uptime: '14d 7h', rps: 15, icon: <Dns />, color: '#F59E0B' },
          ].map((d, i) => (
            <TelemetryPulseCard key={i} {...d} />
          ))}
        </Box>
      </Box>

      {/* Section C: Cyber Threat DataGrid */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          3. Cyber Threat Expandable DataGrid — CVE Triage Workbench
        </Typography>
        <ThreatDataGrid />
      </Box>

      {/* Section D: Polymorphic Run Cards */}
      <Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, fontSize: 16, mb: 2 }}>
          4. Polymorphic Run Cards — Automation vs Security Results
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {[
            { id: 'r1', project: 'juice-shop-e2e', type: 'automation' as const, status: 'success' as const, duration: '4m 12s', steps: 5 },
            { id: 'r2', project: 'bank-api-sqli', type: 'security' as const, status: 'critical' as const, duration: '18m 45s', steps: 12 },
            { id: 'r3', project: 'mobile-auth-check', type: 'automation' as const, status: 'failed' as const, duration: '2m 01s', steps: 3 },
            { id: 'r4', project: 'intranet-xss-probe', type: 'security' as const, status: 'success' as const, duration: '9m 30s', steps: 8 },
          ].map((r) => (
            <RunCardPolymorphic key={r.id} run={r} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
