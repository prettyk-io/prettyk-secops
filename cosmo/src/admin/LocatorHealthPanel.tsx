/**
 * W3.7: Locator Health Panel — показывает degraded/broken локаторы.
 */
import { useMemo } from 'react';
import { Card, Space, Tag, Typography } from 'antd';
import { BugOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface LocatorHealthRow {
  locator: string;
  page_id: string;
  health: 'ok' | 'warn' | 'degraded' | 'broken';
  fails: number;
  successes: number;
  consecutive_fails: number;
  last_fail_reason: string;
}

interface LocatorHealthPanelProps {
  locators: LocatorHealthRow[];
}

const HEALTH_COLORS: Record<string, string> = {
  ok: '#10B981',
  warn: '#F59E0B',
  degraded: '#F97316',
  broken: '#EF4444',
};

const HEALTH_LABELS: Record<string, string> = {
  ok: 'OK',
  warn: 'Warn',
  degraded: 'Degr',
  broken: 'Broken',
};

export function LocatorHealthPanel({ locators }: LocatorHealthPanelProps) {
  const broken = useMemo(() => locators.filter((l) => l.health !== 'ok'), [locators]);
  if (broken.length === 0) return null;

  return (
    <Card
      size="small"
      title={
        <Space size={4}>
          <BugOutlined style={{ color: '#EF4444' }} />
          <Text strong style={{ color: '#F8FAFC', fontSize: 13 }}>Locator Health</Text>
          <Tag color="#EF4444" style={{ fontSize: 10, margin: 0 }}>{broken.length}</Tag>
        </Space>
      }
      style={{
        background: 'rgba(239,68,68,0.06)',
        borderColor: 'rgba(239,68,68,0.15)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {broken.map((l, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4,
          }}>
            <Space size={6}>
              {l.health === 'broken' ? <BugOutlined style={{ color: '#EF4444', fontSize: 11 }} /> : <WarningOutlined style={{ color: '#F59E0B', fontSize: 11 }} />}
              <Text style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#94A3B8' }}>
                {l.locator}
              </Text>
              {l.page_id && <Text style={{ color: '#64748B', fontSize: 9 }}>({l.page_id})</Text>}
            </Space>
            <Space size={4}>
              <Tag color={HEALTH_COLORS[l.health]} style={{ fontSize: 9, margin: 0 }}>
                {HEALTH_LABELS[l.health]} ×{l.consecutive_fails}
              </Tag>
            </Space>
          </div>
        ))}
      </div>
    </Card>
  );
}