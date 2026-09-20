import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paper, Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Alert } from '@mui/material';
import { listChecks } from '../../checks/checksStore';
import { readLastDojoProgramStatus } from '../applyDojoProgram';
import { listDeploys, syncDeployGatesFromChecks } from '../deployStore';
import { resolveDeployEvidencePack } from '../evidenceRegistry';
import { loadLiveProgramKpi } from '../loadLiveProgramKpi';
import { pickPrimaryEvidencePack } from '../pickPrimaryEvidencePack';
import { syncAdminDojoFromLive } from '../syncAdminDojo';
import { IntegrationEvidence } from './IntegrationEvidence';
import { PassRateLine, SeverityDonut, SeverityTrendChart } from './EvidenceCharts';
import { DojoFindingsTable } from './DojoFindingsTable';

export type EvidencePanelProps = { onOpenDeploy?: (deployId: string) => void; };

const chip = (text: string, bg: string, color: string) => `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${bg};color:${color};border:1px solid ${color}40">${text}</span>`;

const statCard = (title: string, value: string | number) => (
  <Paper sx={{ p: 1.5, flex: 1, minWidth: 120, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 2 }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{title}</Typography>
    <Typography variant="h6" color="#E2E8F0" sx={{ fontWeight: 600 }}>{value}</Typography>
  </Paper>
);

export function EvidencePanel({ onOpenDeploy }: EvidencePanelProps): React.JSX.Element {
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => { syncDeployGatesFromChecks(); void syncAdminDojoFromLive().finally(() => setTick((n) => n + 1)); }, []);

  const checks = useMemo(() => listChecks(), [tick]);
  const deploys = useMemo(() => listDeploys(), [tick]);
  const kpi = useMemo(() => loadLiveProgramKpi(), [tick]);
  const dojoStatus = useMemo(() => readLastDojoProgramStatus(), [tick]);
  const showcase = useMemo(() => resolveDeployEvidencePack('dep_ib_web_2401', 'Интернет-банк Web', 'ib-web'), [tick]);
  const primary = useMemo(() => pickPrimaryEvidencePack(deploys, checks, showcase), [tick, deploys, checks, showcase]);

  const onSyncLive = useCallback(async () => {
    setSyncing(true);
    try { const r = await syncAdminDojoFromLive(); syncDeployGatesFromChecks(); if (!r.evidenceOk && r.dojoStatus === 'down') setSnack(r.evidenceError || r.dojoError || 'Live/Dojo недоступны'); else setSnack(`Evidence +${r.evidenceUpserted} · Dojo ${r.dojoStatus} (+${r.dojoApplied})`); setTick((n) => n + 1); } finally { setSyncing(false); }
  }, []);

  const rows = deploys.map((d) => { const p = resolveDeployEvidencePack(d.deploy_id, d.application_name, d.project_id); return { key: d.deploy_id, app: d.application_name, gate: d.last_gate ?? 'unknown', allure_id: p.allure?.allure_project_id ?? '—', crit: p.dojo?.stats?.critical ?? 0, high: p.dojo?.stats?.high ?? 0, n: p.history.length, allure_u: p.allure?.report_url, dojo_u: p.dojo?.engagement_url }; });

  const hasCharts = primary.pack.severity_trend.length > 0 || primary.pack.pass_rate_trend.length > 0;
  const [tab, setTab] = useState(0);

  const portfolioTab = (
    <Paper sx={{ p: 2, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 2 }}>
      <Typography variant="subtitle2" color="#E2E8F0" sx={{ mb: 1 }}>Портфель</Typography>
      {rows.length === 0 ? <Typography color="text.secondary">Нет деплоев</Typography> : (
        <TableContainer><Table size="small"><TableHead><TableRow>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>Приложение</TableCell>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>Gate</TableCell>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>Allure</TableCell>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>C/H</TableCell>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>N</TableCell>
          <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>Links</TableCell>
        </TableRow></TableHead><TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} hover onClick={() => onOpenDeploy?.(r.key)} sx={{ cursor: onOpenDeploy ? 'pointer' : undefined }}>
              <TableCell sx={{ color: '#E2E8F0', fontSize: 12 }}>{r.app}</TableCell>
              <TableCell><span dangerouslySetInnerHTML={{ __html: chip(r.gate, '#33415520', '#94a3b8') }} /></TableCell>
              <TableCell sx={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 11 }}>{r.allure_id}</TableCell>
              <TableCell sx={{ color: '#E2E8F0', fontSize: 12 }}>{r.crit}/{r.high}</TableCell>
              <TableCell sx={{ color: '#94A3B8', fontSize: 12 }}>{r.n}</TableCell>
              <TableCell sx={{ fontSize: 11 }}>
                {r.allure_u ? <a href={r.allure_u} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: 10, marginRight: 4 }}>Allure</a> : '—'}
                {r.dojo_u ? <a href={r.dojo_u} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: 10 }}>Dojo</a> : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody></Table></TableContainer>
      )}
    </Paper>
  );

  const trendsTab = (
    <Paper sx={{ p: 2, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 2 }}>
      <Typography variant="subtitle2" color="#E2E8F0" sx={{ mb: 1 }}>Тренды</Typography>
      {hasCharts ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} data-testid="evidence-primary-charts" data-from-live={primary.fromLive ? '1' : '0'}>
          <div><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{primary.caption} {primary.fromLive ? '· Live' : ''}: Severity</Typography><SeverityTrendChart points={primary.pack.severity_trend} /></div>
          <div><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{primary.caption} {primary.fromLive ? '· Live' : ''}: Pass-rate</Typography><PassRateLine points={primary.pack.pass_rate_trend} /></div>
          {primary.pack.dojo?.stats ? <div><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{primary.caption} {primary.fromLive ? '· Live' : ''}: Уязвимости</Typography><SeverityDonut stats={primary.pack.dojo.stats} /></div> : null}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Typography color="text.secondary" sx={{ mb: 1 }}>Нет точек тренда</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Подтяни данные с Live</Typography>
          <button onClick={() => void onSyncLive()} disabled={syncing} style={{ padding: '6px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', cursor: syncing ? 'wait' : 'pointer', fontSize: 13 }}>{syncing ? '…' : 'Подтянуть с Live'}</button>
        </div>
      )}
    </Paper>
  );

  return (
    <div data-testid="admin-evidence" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: primary.fromLive ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.1)', color: primary.fromLive ? '#22c55e' : '#94a3b8' }}>{primary.fromLive ? 'Live' : 'Showcase'}</span>
        {dojoStatus ? <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: dojoStatus.status === 'ok' ? 'rgba(34,197,94,0.15)' : dojoStatus.status === 'unconfigured' ? 'rgba(148,163,184,0.1)' : 'rgba(245,158,11,0.15)', color: dojoStatus.status === 'ok' ? '#22c55e' : dojoStatus.status === 'unconfigured' ? '#94a3b8' : '#f59e0b' }}>Dojo: {dojoStatus.status}</span> : null}
        <button onClick={() => void onSyncLive()} disabled={syncing} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)', cursor: syncing ? 'wait' : 'pointer', fontSize: 11 }}>{syncing ? '…' : 'Подтянуть с Live'}</button>
      </div>
      {dojoStatus && (dojoStatus.status === 'down' || dojoStatus.status === 'unconfigured') ? (
        <Alert severity={dojoStatus.status === 'down' ? 'error' : 'info'} data-testid="evidence-dojo-honesty">
          {dojoStatus.status === 'unconfigured' ? 'DefectDojo не сконфигурирован' : 'DefectDojo недоступен (down)'}
        </Alert>
      ) : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {statCard('Проверки (local)', checks.length)}
        {statCard('Проход по гейтам', Math.round(kpi.gate_pass_rate * 100) + '%')}
        {statCard('Проверки · 7д', kpi.checks_last_7d)}
        {statCard('Открытые критические', kpi.open_critical)}
      </div>

      <Tabs value={tab} onChange={(_, v) => setTab(v as number)} data-testid="evidence-tabs"
        sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Портфель" />
        <Tab label="Тренды" />
        <Tab label="Находки" />
        <Tab label="Ссылки" />
      </Tabs>
      <div role="tabpanel" hidden={tab !== 0}>{tab === 0 && portfolioTab}</div>
      <div role="tabpanel" hidden={tab !== 1}>{tab === 1 && trendsTab}</div>
      <div role="tabpanel" hidden={tab !== 2}>{tab === 2 && <DojoFindingsTable deploys={deploys} onOpenDeploy={onOpenDeploy} />}</div>
      <div role="tabpanel" hidden={tab !== 3}>{tab === 3 && <IntegrationEvidence pack={primary.pack} />}</div>

      {snack && <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '8px 20px', background: '#22c55e', color: '#fff', borderRadius: 8, fontSize: 12, zIndex: 9999 }}>{snack}</div>}
    </div>
  );
}
