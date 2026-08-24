import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Collapse, Space, Tag, Typography } from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  CaretRightOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useLabSession } from '../LabSessionProvider';
import type { LabResultItem, LabDetailItem } from '../labApi';
import { fetchLabDetail } from '../labApi';
import { ResultsTable } from '../components/ResultsTable';
import { ResultsInspector } from '../components/ResultsInspector';

const { Text, Title } = Typography;

export interface SuiteResultsProps {
  allResults: LabResultItem[];
  totalRequests: number;
  doneRequests: number;
  attackSummaries: Array<{
    attackIndex: number;
    attackId: string;
    mode: string;
    completed: number;
    total: number;
    results: LabResultItem[];
  }>;
  onRepeat: () => void;
  onNew: () => void;
}

export function SuiteResults({
  allResults,
  totalRequests,
  doneRequests,
  attackSummaries,
  onRepeat,
  onNew,
}: SuiteResultsProps) {
  const { session } = useLabSession();
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<LabDetailItem | null>(null);
  const [expandedAttack, setExpandedAttack] = useState<number | null>(null);

  const handleClickAttack = useCallback((_idx: number, attackId: string, id: number) => {
    setSelectedResultId(id);
    if (!attackId) return;
    fetchLabDetail(attackId, id).then((res) => {
      if (res.ok && res.detail) setSelectedDetail(res.detail);
    });
  }, []);

  const stats2xx = allResults.filter((r) => r.status >= 200 && r.status < 300).length;
  const stats4xx = allResults.filter((r) => r.status >= 400 && r.status < 500).length;
  const stats5xx = allResults.filter((r) => r.status >= 500 || r.error).length;
  const matchCount = allResults.filter((r) => Object.values(r.grep_matches || {}).some(Boolean)).length;

  const handleSaveJSON = useCallback(() => {
    const dump = {
      suite: {
        totalRequests,
        completedRequests: doneRequests,
        summary: { success2xx: stats2xx, error4xx: stats4xx, error5xx: stats5xx, grepMatches: matchCount },
        attacks: attackSummaries.map((a) => ({
          mode: a.mode,
          completed: a.completed,
          total: a.total,
          results: a.results.map((r) => ({
            id: r.id,
            payloads: r.payloads,
            status: r.status,
            length: r.length,
            elapsed_ms: r.elapsed_ms,
            grep_matches: r.grep_matches,
            grep_extracts: r.grep_extracts,
          })),
        })),
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suite-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [totalRequests, doneRequests, stats2xx, stats4xx, stats5xx, matchCount, attackSummaries]);

  const findings = allResults.filter((r) => Object.values(r.grep_matches || {}).some(Boolean));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary */}
      <Card
        size="small"
        title={<Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>Сводка Suite</Text>}
        style={{
          background: '#111827', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
        }}
      >
        <Space size={24} wrap>
          <StatBlock label="Всего запросов" value={totalRequests} color="#F8FAFC" />
          <StatBlock label="Успешно (2xx)" value={stats2xx} color="#22C55E" />
          <StatBlock label="Ошибки (4xx)" value={stats4xx} color="#EAB308" />
          <StatBlock label="Ошибки (5xx/ERR)" value={stats5xx} color="#EF4444" />
          <StatBlock label="Grep Match" value={matchCount} color="#9333EA" />
        </Space>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card
          size="small"
          title={<Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>Находки</Text>}
          style={{
            background: '#111827', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
          }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {findings.map((r) => {
              const matches = Object.entries(r.grep_matches || {}).filter(([_, v]) => v);
              return (
                <Tag
                  key={r.id}
                  color="#9333EA"
                  style={{ cursor: 'pointer', margin: '2px 0' }}
                  onClick={() => handleClickAttack(
                    attackSummaries.findIndex((a) => a.results.some((ar) => ar.id === r.id)),
                     attackSummaries.find((a) => a.results.some((ar) => ar.id === r.id))?.attackId || '',
                    r.id,
                  )}
                >
                  #{r.id} | {r.payloads.join(' | ')} → {r.status} ({r.elapsed_ms}ms)
                  {matches.length > 0 && (
                    <span style={{ marginLeft: 6, fontWeight: 600 }}>
                      {matches.map(([k]) => k).join(', ')}
                    </span>
                  )}
                </Tag>
              );
            })}
          </Space>
        </Card>
      )}

      {/* Per-attack results */}
      <Card
        size="small"
        title={<Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>Результаты по атакам</Text>}
        style={{
          background: '#111827', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
        }}
      >
        {attackSummaries.map((atk, ai) => {
          const a2xx = atk.results.filter((r) => r.status >= 200 && r.status < 300).length;
          const aMatch = atk.results.filter((r) => Object.values(r.grep_matches || {}).some(Boolean)).length;
          return (
            <Card
              key={ai}
              size="small"
              style={{
                background: '#0B0F17',
                borderColor: 'rgba(255,255,255,0.06)',
                borderRadius: 4,
                marginBottom: 8,
              }}
              title={
                <Space>
                  <Text strong style={{ color: '#F8FAFC', fontSize: 13 }}>Атака {ai + 1}</Text>
                  <Tag color="#9333EA" style={{ fontSize: 10, margin: 0 }}>{atk.mode}</Tag>
                  <Text style={{ color: '#64748B', fontSize: 11 }}>
                    {atk.completed}/{atk.total} запр.
                  </Text>
                  <Text style={{ color: '#22C55E', fontSize: 11 }}>{a2xx} ✓</Text>
                  {aMatch > 0 && <Tag color="#9333EA" style={{ fontSize: 9, margin: 0 }}>MATCH</Tag>}
                </Space>
              }
            >
              {atk.results.length > 0 && (
                <ResultsTable
                  results={atk.results}
                  progress={{ completed: atk.completed, total: atk.total }}
                  selectedResultId={selectedResultId}
                   onSelectResult={(id) => handleClickAttack(ai, atk.attackId, id)}
                />
              )}
            </Card>
          );
        })}
      </Card>

      {/* Inspector */}
      {selectedDetail && (
        <Card
          size="small"
          style={{
            background: '#111827', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
          }}
        >
          <ResultsInspector detail={selectedDetail} />
        </Card>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingBottom: 16 }}>
        <Button
          icon={<DownloadOutlined />} onClick={handleSaveJSON}
          style={{
            borderRadius: 5, background: 'rgba(147,51,234,0.15)',
            borderColor: 'rgba(147,51,234,0.3)', color: '#A78BFA',
          }}>
          Save Results & Evidence
        </Button>
        <Button
          icon={<ReloadOutlined />} onClick={onRepeat}
          style={{ borderRadius: 5, background: 'rgba(56,189,248,0.1)', color: '#38BDF8' }}>
          Repeat Suite
        </Button>
        <Button
          icon={<ClearOutlined />} onClick={onNew}
          style={{ borderRadius: 5, color: '#94A3B8' }}>
          New Suite
        </Button>
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>{label}</Text>
      <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
