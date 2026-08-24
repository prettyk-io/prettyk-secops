/**
 * W1 Baseline Whisperer — regression delta after each run.
 *
 * Deterministic cards NEWLY_OBSERVED / NOT_OBSERVED / CHANGED (always).
 * Optional AI narrative layer (Qwen3 advisory, only when AI enabled).
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import {
  AlertOutlined,
  ArrowRightOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  RobotOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  fetchAiEnabled,
  fetchDeterministicDelta,
  requestAiDelta,
  type AiDeltaResponse,
  type DeltaEntry,
  type DeterministicDelta,
} from './adminApi';

const { Text, Title } = Typography;

export interface BaselineDeltaProps {
  baselineId?: string;
  currentRunId?: string;
}

type DeltaView = 'deterministic' | 'loading_ai' | 'with_ai';

const SEV_COLOR: Record<string, string> = {
  critical: 'red', high: 'volcano', medium: 'orange', low: 'blue', info: 'default',
  informational: 'default',
};

function entryKey(entry: DeltaEntry, idx: number): string {
  return entry.finding_id || `row-${idx}`;
}

function severityTag(severity: string) {
  const s = (severity || 'info').toLowerCase();
  return <Tag color={SEV_COLOR[s] ?? 'default'} style={{ margin: 0, fontWeight: 600 }}>{severity}</Tag>;
}

function FindingCard({ entry, icon, label, color }: { entry: DeltaEntry; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Card
      size="small"
      style={{
        background: '#111827',
        borderColor: 'rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size={6}>
          {icon}
          <Tag color={color} style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>{label}</Tag>
          <Text strong style={{ color: '#F8FAFC', fontSize: 13 }}>{entry.title}</Text>
        </Space>
        <Space size={8}>
          {severityTag(entry.severity)}
          {entry.cwe && (
            <Text style={{ color: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
              CWE-{entry.cwe}
            </Text>
          )}
          {entry.method && entry.path && (
            <Text style={{ color: '#38BDF8', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
              {entry.method} {entry.path.length > 50 ? entry.path.slice(0, 47) + '...' : entry.path}
            </Text>
          )}
        </Space>
        {entry.before && entry.after && (
          <Space size={4}>
            {severityTag(entry.before.severity)}
            <ArrowRightOutlined style={{ color: '#64748B', fontSize: 11 }} />
            {severityTag(entry.after.severity)}
          </Space>
        )}
      </Space>
    </Card>
  );
}

export function BaselineDelta({ baselineId = 'exp01-baseline', currentRunId }: BaselineDeltaProps) {
  const [view, setView] = useState<DeltaView>('deterministic');
  const [delta, setDelta] = useState<DeterministicDelta | null>(null);
  const [aiNarrative, setAiNarrative] = useState<AiDeltaResponse | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (runId: string) => {
    setError(null);
    setDelta(null);
    setAiNarrative(null);
    setView('deterministic');
    const det = await fetchDeterministicDelta(baselineId, runId);
    setDelta(det || null);
    if (!det) {
      setError('Delta не загружен — проверьте Live и baseline.');
    }
  }, [baselineId]);

  useEffect(() => {
    fetchAiEnabled().then(setAiEnabled);
  }, []);

  useEffect(() => {
    const runId = currentRunId || 'exp01-current';
    void load(runId);
  }, [currentRunId, load]);

  const generateAi = useCallback(async () => {
    if (!delta || !aiEnabled) return;
    setView('loading_ai');
    const ai = await requestAiDelta(
      delta.baseline_id,
      delta.current_run_id,
      {
        comparison_status: delta.comparison_status,
        newly_observed: delta.metrics.newly_observed,
        not_observed: delta.metrics.not_observed,
        changed: delta.metrics.changed,
      },
    );
    setAiNarrative(ai || null);
    setView('with_ai');
  }, [delta, aiEnabled]);

  if (error) {
    return (
      <Card size="small" style={{ background: '#111827', borderColor: 'rgba(239,68,68,0.3)', borderRadius: 6 }}>
        <Space>
          <ExclamationCircleOutlined style={{ color: '#EF4444' }} />
          <Text style={{ color: '#94A3B8' }}>{error}</Text>
        </Space>
      </Card>
    );
  }

  if (!delta) {
    return (
      <Card size="small" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6 }}>
        <Text style={{ color: '#64748B' }}>Загрузка delta...</Text>
      </Card>
    );
  }

  const isBlocked = delta.comparison_status !== 'comparable';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={12}>
          <SwapOutlined style={{ color: '#9333EA' }} />
          <Title level={5} style={{ color: '#F8FAFC', margin: 0 }}>
            Baseline Delta
          </Title>
          <Space size={6}>
            <Tag color={isBlocked ? '#EF4444' : '#22C55E'} style={{ fontSize: 10, fontWeight: 600 }}>
              {delta.comparison_status.toUpperCase()}
            </Tag>
            <Text style={{ color: '#64748B', fontSize: 11 }}>
              {delta.baseline_id} → {delta.current_run_id}
            </Text>
          </Space>
        </Space>
        {aiEnabled && delta.comparison_status === 'comparable' && !isBlocked && (
          <Button
            size="small"
            icon={<RobotOutlined />}
            onClick={generateAi}
            loading={view === 'loading_ai'}
            style={{
              borderColor: 'rgba(147,51,234,0.3)',
              color: '#A78BFA',
              borderRadius: 5,
            }}
          >
            Generate AI Summary
          </Button>
        )}
      </div>

      {isBlocked && (
        <Card size="small" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', borderRadius: 6 }}>
          <Space>
            <ExclamationCircleOutlined style={{ color: '#EF4444' }} />
            <Text style={{ color: '#FCA5A5', fontSize: 13 }}>
              COMPARISON_BLOCKED — прогоны несовместимы ({delta.comparison_status}).
              {delta.warnings.length > 0 && ` ${delta.warnings.join('. ')}`}
            </Text>
          </Space>
        </Card>
      )}

      {/* AI Narrative */}
      {view === 'with_ai' && aiNarrative && aiNarrative.decision === 'narrative_ready' && (
        <Card
          size="small"
          style={{
            background: 'linear-gradient(135deg, rgba(147,51,234,0.1) 0%, rgba(56,189,248,0.1) 100%)',
            borderColor: 'rgba(147,51,234,0.2)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <Space>
              <RobotOutlined style={{ color: '#A78BFA' }} />
              <Text strong style={{ color: '#A78BFA', fontSize: 13 }}>AI Advisory</Text>
              <Tag color={(() => { if (aiNarrative.confidence === 'high') return '#22C55E'; if (aiNarrative.confidence === 'medium') return '#F59E0B'; return '#94A3B8'; })()} style={{ fontSize: 10, fontWeight: 600 }}>
                {aiNarrative.confidence.toUpperCase()}
              </Tag>
            </Space>
            <Tag style={{ fontSize: 9, background: 'rgba(147,51,234,0.15)', color: '#A78BFA', border: 'none' }}>
              {aiNarrative.model.name} · {aiNarrative.model.prompt_version}
            </Tag>
          </div>
          <Text style={{ color: '#CBD5E1', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {aiNarrative.narrative_ru}
          </Text>
          {aiNarrative.suggestions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {aiNarrative.suggestions.map((s) => (
                <Tag key={s.code || s.text} color="#38BDF8" style={{ margin: '2px 4px 2px 0', fontSize: 10 }}>
                  {s.code}: {s.text}
                </Tag>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'rgba(147,51,234,0.06)', borderRadius: 8, border: '1px solid rgba(147,51,234,0.12)' }}>
        <div><Text style={{ color: '#22C55E', fontSize: 20, fontWeight: 700 }}>+{delta.metrics.newly_observed}</Text><Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>NEW</Text></div>
        <div><Text style={{ color: '#EF4444', fontSize: 20, fontWeight: 700 }}>-{delta.metrics.not_observed}</Text><Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>GONE</Text></div>
        <div><Text style={{ color: '#F59E0B', fontSize: 20, fontWeight: 700 }}>~{delta.metrics.changed}</Text><Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>CHANGED</Text></div>
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 16 }}>
          <Text style={{ color: '#F8FAFC', fontSize: 13, display: 'block' }}>{delta.metrics.current_findings}</Text>
          <Text style={{ color: '#64748B', fontSize: 10 }}>current / {delta.metrics.baseline_findings} baseline</Text>
        </div>
      </div>

      {/* NEWLY_OBSERVED */}
      {delta.newly_observed.length > 0 && (
        <div>
          <Text strong style={{ color: '#22C55E', fontSize: 13, display: 'block', marginBottom: 6 }}>
            NEWLY_OBSERVED ({delta.newly_observed.length})
          </Text>
          {delta.newly_observed.map((entry, idx) => (
            <FindingCard key={entryKey(entry, idx)} entry={entry} icon={<PlusCircleOutlined style={{ color: '#22C55E' }} />} label="NEW" color="#22C55E" />
          ))}
        </div>
      )}

      {/* NOT_OBSERVED */}
      {delta.not_observed.length > 0 && (
        <div>
          <Text strong style={{ color: '#EF4444', fontSize: 13, display: 'block', marginBottom: 6 }}>
            NOT_OBSERVED_IN_CURRENT_SCOPE ({delta.not_observed.length})
          </Text>
          {delta.not_observed.map((entry, idx) => (
            <FindingCard key={entryKey(entry, idx)} entry={entry} icon={<MinusCircleOutlined style={{ color: '#EF4444' }} />} label="GONE" color="#EF4444" />
          ))}
        </div>
      )}

      {/* CHANGED */}
      {delta.changed.length > 0 && (
        <div>
          <Text strong style={{ color: '#F59E0B', fontSize: 13, display: 'block', marginBottom: 6 }}>
            CHANGED ({delta.changed.length})
          </Text>
          {delta.changed.map((entry, idx) => (
            <FindingCard key={entryKey(entry, idx)} entry={entry} icon={<SwapOutlined style={{ color: '#F59E0B' }} />} label="CHANGED" color="#F59E0B" />
          ))}
        </div>
      )}

      {/* Nothing changed */}
      {delta.newly_observed.length === 0 && delta.not_observed.length === 0 && delta.changed.length === 0 && (
        <Card size="small" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.12)', borderRadius: 6 }}>
          <Space>
            <AlertOutlined style={{ color: '#22C55E' }} />
            <Text style={{ color: '#22C55E', fontSize: 13 }}>Delta пуст — находки идентичны baseline.</Text>
          </Space>
        </Card>
      )}
    </div>
  );
}