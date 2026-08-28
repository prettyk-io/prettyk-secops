/**
 * ADM-DOJO: Очищенная панель находок DefectDojo.
 * GET /api/dojo/findings → таблица с severity-тегами, CWE, возрастом уязвимости.
 * Стилистика: SecOps Lab Dark, скругления 5-6px, токены --pk-*, без сторонних фреймворков.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Modal, Space, Table, Tag, Tooltip, Typography, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
import { DiffOutlined, GroupOutlined, LoadingOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { fetchDojoFindings, fetchAiEnabled, requestAiClassify, requestSemanticGroup, type DojoFinding, type SemanticCluster } from './adminApi';
import { useLocale } from '../locales';

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

const SEV_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'volcano',
  medium: 'orange',
  low: 'blue',
  info: 'default',
};

function ageDays(date?: string): number {
  if (!date) return Number.NaN;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return Number.NaN;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function ageLabel(n: number, d: Record<string, string>): string {
  const { today = 'сегодня', day = 'день', days1 = 'дня', days2 = 'дней', weeks = 'нед.', months = 'мес.', years = 'лет' } = d;
  if (n < 1) return today;
  if (n < 7) {
    if (n === 1) return `1 ${day}`;
    if (n < 5) return `${n} ${days2}`;
    return `${n} ${days1}`;
  }
  if (n < 30) return `${Math.floor(n / 7)} ${weeks}`;
  if (n < 365) return `${Math.floor(n / 30)} ${months}`;
  return `${Math.floor(n / 365)} ${years}`;
}

function fpColor(v: number): string {
  if (v >= 0.7) return 'red';
  if (v >= 0.4) return 'orange';
  return 'green';
}
function fpLabel(v: number): string {
  if (v >= 0.7) return 'FP High';
  if (v >= 0.4) return 'FP Mid';
  return 'FP Low';
}

export function DojoFindingsTable(): React.JSX.Element {
  const { dict } = useLocale();
  const [rows, setRows] = useState<DojoFinding[]>([]);
  const [down, setDown] = useState(true);
  const [search, setSearch] = useState('');
  const [aiMap, setAiMap] = useState<Map<number | string, { ai_severity: string; ai_fp_confidence: number; ai_reasoning: string }>>(new Map());
  const [aiLoading, setAiLoading] = useState<Set<number | string>>(new Set());
  const [diffModal, setDiffModal] = useState<{ title: string; reasoning: string } | null>(null);
  const [classifyAllBusy, setClassifyAllBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [collapsedClusters, setCollapsedClusters] = useState<SemanticCluster[] | null>(null);
  const [collapseBusy, setCollapseBusy] = useState(false);
  const [collapseExpanded, setCollapseExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchDojoFindings().then((res) => {
      if (cancelled) return;
      setRows(res.findings);
      setDown(res.status === 'down');
    });
    fetchAiEnabled().then((enabled) => {
      if (!cancelled) setAiEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const classifyOne = async (finding: DojoFinding) => {
    const key = finding.id ?? finding.title;
    setAiLoading((prev) => new Set(prev).add(key));
    const result = await requestAiClassify(finding);
    if (result) {
      setAiMap((prev) => {
        const next = new Map(prev);
        next.set(key, { ai_severity: result.severity, ai_fp_confidence: result.fp_confidence, ai_reasoning: result.reasoning });
        return next;
      });
    }
    setAiLoading((prev) => { const s = new Set(prev); s.delete(key); return s; });
  };

  const classifyAll = async () => {
    setClassifyAllBusy(true);
    for (const f of rows) await classifyOne(f);
    setClassifyAllBusy(false);
  };

  const collapseFindings = async () => {
    setCollapseBusy(true);
    const result = await requestSemanticGroup(rows.map((r) => ({ finding_id: r.id, title: r.title, severity: r.severity, cwe: r.cwe })));
    setCollapseBusy(false);
    if (result) {
      // Never hide a finding because the model omitted it or repeated an index.
      const claimed = new Set<number>();
      const safeClusters: SemanticCluster[] = result.clusters.map((cluster) => {
        const member_indices = cluster.member_indices.filter((index) => {
          if (!Number.isInteger(index) || index < 0 || index >= rows.length || claimed.has(index)) return false;
          claimed.add(index);
          return true;
        });
        return {
          ...cluster,
          member_indices,
          member_ids: member_indices.map((index) => rows[index]?.id ?? index),
        };
      });
      rows.forEach((finding, index) => {
        if (claimed.has(index)) return;
        safeClusters.push({
          cluster_id: `unclustered-${index}`,
          title: finding.title,
          severity: finding.severity,
          member_indices: [index],
          member_ids: [finding.id ?? index],
          relationship: 'unclustered',
          root_cause_hypothesis: '',
          systemic_remediation: '',
        });
      });
      setCollapsedClusters(safeClusters);
    }
    setCollapseExpanded(new Set());
  };

  const toggleCluster = (clusterId: string) => {
    setCollapseExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId); else next.add(clusterId);
      return next;
    });
  };

  const isCollapsed = collapsedClusters !== null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.severity || '').toLowerCase().includes(q) ||
        (r.cwe != null ? String(r.cwe) : '').includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<ColumnsType<DojoFinding>>(
    () => [
      {
        title: dict.dojo.severity,
        dataIndex: 'severity',
        width: 110,
        render: (v: string | undefined) => {
          const s = (v || '').toLowerCase();
          return (
            <Tag color={SEV_COLOR[s] ?? 'default'} style={{ fontWeight: 600 }}>
              {SEV_LABEL[s] ?? v ?? '—'}
            </Tag>
          );
        },
      },
      {
        title: dict.dojo.title,
        dataIndex: 'title',
        ellipsis: true,
        render: (v: string) => (
          <Typography.Text ellipsis={{ tooltip: v }} style={{ maxWidth: '100%' }}>
            {v}
          </Typography.Text>
        ),
      },
      {
        title: dict.dojo.cwe,
        dataIndex: 'cwe',
        width: 90,
        render: (v: number | string | null | undefined) =>
          v != null ? (
            <Tag style={{ fontFamily: 'var(--pk-font)', fontWeight: 500 }}>
              CWE-{String(v)}
            </Tag>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
      },
      {
        title: dict.dojo.status,
        dataIndex: 'status',
        width: 110,
        render: (v: string | undefined) => v || '—',
      },
      {
        title: dict.dojo.age,
        dataIndex: 'date',
        width: 90,
        render: (_: unknown, r: DojoFinding) => {
          const n = r.age_days ?? ageDays(r.date);
          if (Number.isNaN(n)) return '—';
          let color: string | undefined;
          if (n > 90) { color = 'var(--pk-error)'; }
          else if (n > 30) { color = 'var(--pk-warning)'; }
          return (
            <Typography.Text style={{ color, fontSize: 12 }}>
              {ageLabel(n, dict.dojo)}
            </Typography.Text>
          );
        },
      },
      {
        title: <Tooltip title={dict.dojo.ai}><span><RobotOutlined style={{ color: '#A78BFA' }} /> {dict.dojo.ai}</span></Tooltip>,
        key: 'ai_severity',
        width: 120,
        render: (_: unknown, r: DojoFinding) => {
          const key = r.id ?? r.title;
          const ai = aiMap.get(key);
          if (aiLoading.has(key)) return <LoadingOutlined style={{ color: '#A78BFA' }} />;
          if (!ai) return (
            <Button size="small" type="dashed" icon={<RobotOutlined />}
              onClick={(e) => { e.stopPropagation(); void classifyOne(r); }}
              style={{ borderColor: 'rgba(147,51,234,0.3)', color: '#A78BFA', fontSize: 11 }}>
              AI
            </Button>
          );
          const aiS = ai.ai_severity?.toLowerCase() ?? '';
          const scannerS = r.severity.toLowerCase();
          const mismatch = aiS && scannerS && aiS !== scannerS;
          return (
            <Tooltip title={ai.ai_reasoning}>
              <Space size={2}>
                <Tag color={SEV_COLOR[aiS] ?? 'default'} style={{ fontWeight: 600, fontSize: 10, margin: 0 }}>
                  {SEV_LABEL[aiS] ?? ai.ai_severity ?? '—'}
                </Tag>
                {mismatch && <Typography.Text style={{ color: '#FACC15', fontSize: 10 }}>≠</Typography.Text>}
              </Space>
            </Tooltip>
          );
        },
      },
      {
        title: 'FP',
        key: 'ai_fp',
        width: 80,
        render: (_: unknown, r: DojoFinding) => {
          const key = r.id ?? r.title;
          const ai = aiMap.get(key);
          if (!ai) return <Typography.Text type="secondary" style={{ fontSize: 10 }}>—</Typography.Text>;
          const pct = Math.round(ai.ai_fp_confidence * 100);
          return (
            <Tooltip title={`Уверенность FP: ${pct}%`}>
              <Tag color={fpColor(ai.ai_fp_confidence)} style={{ fontSize: 10, margin: 0 }}>
                {fpLabel(ai.ai_fp_confidence)}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: '',
        key: 'ai_actions',
        width: 40,
        render: (_: unknown, r: DojoFinding) => {
          const key = r.id ?? r.title;
          const ai = aiMap.get(key);
          if (!ai) return null;
          return (
            <Tooltip title="AI Diff">
              <Button size="small" type="text" icon={<DiffOutlined style={{ color: '#A78BFA' }} />}
                onClick={(e) => { e.stopPropagation(); setDiffModal({ title: r.title, reasoning: ai.ai_reasoning || '' }); }}
                style={{ padding: '0 4px', height: 22 }} />
            </Tooltip>
          );
        },
      },
    ],
    [aiMap, aiLoading, aiEnabled, dict.dojo],
  );

  const displayColumns = useMemo(
    () => (aiEnabled ? columns : columns.filter((c) => !(c.key && (c.key as string).startsWith('ai_')))),
    [columns, aiEnabled],
  );

  return (
    <div data-testid="dojo-findings" className="pk-admin-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={dict.dojo.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 320 }}
          data-testid="dojo-findings-search"
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {down ? 'Live недоступен' : `${filtered.length} находок`}
        </Typography.Text>
        {!down && rows.length > 0 && aiEnabled && (
          <Button
            size="small"
            icon={classifyAllBusy ? <LoadingOutlined /> : <RobotOutlined />}
            onClick={classifyAll}
            loading={classifyAllBusy}
            style={{
              borderColor: 'rgba(147,51,234,0.3)',
              color: '#A78BFA',
              fontSize: 11,
              borderRadius: 4,
            }}
          >
            {dict.dojo.classifyAll}
          </Button>
        )}
        {!down && rows.length > 0 && aiEnabled && (
          <Button
            size="small"
            icon={collapseBusy ? <LoadingOutlined /> : <GroupOutlined />}
            onClick={collapseFindings}
            loading={collapseBusy}
            style={{
              borderColor: isCollapsed ? '#9333EA' : 'rgba(147,51,234,0.3)',
              color: isCollapsed ? '#A78BFA' : '#94A3B8',
              fontSize: 11,
              borderRadius: 4,
            }}
          >
            {isCollapsed ? dict.dojo.grid : dict.dojo.collapse}
          </Button>
        )}
      </div>

      {down && rows.length === 0 ? (
        <Typography.Text type="secondary" data-testid="dojo-findings-empty">
          Нет данных — DefectDojo недоступен
        </Typography.Text>
      ) : rows.length === 0 ? (
        <Empty description={dict.dojo.noFindings} data-testid="dojo-findings-empty-state" />
      ) : isCollapsed ? (
        /* Collapsed cluster view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {collapsedClusters!.map((cluster) => {
            const expanded = collapseExpanded.has(cluster.cluster_id);
            return (
              <Card
                key={cluster.cluster_id}
                size="small"
                style={{
                  background: '#111827',
                  borderColor: 'rgba(147,51,234,0.3)',
                  borderRadius: 6,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => toggleCluster(cluster.cluster_id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCluster(cluster.cluster_id); } }}
                >
                  <Space size={8}>
                    <Tag color="#9333EA" style={{ fontWeight: 600 }}>{cluster.severity.toUpperCase()}</Tag>
                    <Text strong style={{ color: '#F8FAFC', fontSize: 13 }}>{cluster.title}</Text>
                    <Tag style={{ background: 'rgba(147,51,234,0.15)', color: '#A78BFA', border: 'none', fontSize: 10 }}>
                      {cluster.member_indices.length} finding(s)
                    </Tag>
                  </Space>
                  <Text style={{ color: '#A78BFA', fontSize: 11 }}>{expanded ? '▲' : '▼'}</Text>
                </div>
                {expanded && (
                  <div style={{ marginTop: 8 }}>
                    {cluster.root_cause_hypothesis && (
                      <Tag color="#F59E0B" style={{ marginBottom: 4, fontSize: 10 }}>
                        {cluster.root_cause_hypothesis}
                      </Tag>
                    )}
                    {cluster.member_indices.map((idx) => {
                      const f = rows[idx];
                      if (!f) return null;
                      return (
                        <Tag key={idx} style={{
                          background: '#1E293B', border: '1px solid rgba(255,255,255,0.08)',
                          color: '#94A3B8', fontSize: 10, margin: '2px',
                        }}>
                          #{idx} {f.title}
                        </Tag>
                      );
                    })}
                    {cluster.systemic_remediation && (
                      <Text style={{ color: '#10B981', fontSize: 11, display: 'block', marginTop: 4 }}>
                        Fix: {cluster.systemic_remediation}
                      </Text>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Table<DojoFinding>
          rowKey={(r) => String(r.id ?? `${r.title}-${r.cwe ?? ''}`)}
          size="small"
          columns={displayColumns}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: 'Нет данных' }}
        />
      )}
      <Modal
        title="AI Diff Analysis"
        open={diffModal !== null}
        onCancel={() => setDiffModal(null)}
        footer={<Button onClick={() => setDiffModal(null)}>Закрыть</Button>}
        width={600}
        styles={{ content: { background: '#111827' }, header: { background: '#111827', color: '#F8FAFC' } }}
      >
        <Typography.Text strong style={{ color: '#A78BFA' }}>{diffModal?.title}</Typography.Text>
        <Typography.Paragraph style={{ color: '#CBD5E1', marginTop: 12, whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {diffModal?.reasoning || 'Нет данных'}
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
