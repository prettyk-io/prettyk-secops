/**
 * W3.8: Live Log Anomaly Strip — компактная лента аномалий из потока логов.
 *
 * Показывает только HTTP 5xx, Errors, Timeouts, Connection Refused.
 * Нормальные строки не показываются.
 */
import { useMemo } from 'react';
import { Card, Space, Tag, Typography } from 'antd';
import { AlertOutlined, ClockCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface LogAnomalyItem {
  category: string;
  detail: string;
  line?: string;
  log_index?: number;
}

interface LogAnomalyStripProps {
  anomalies: LogAnomalyItem[];
  maxItems?: number;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  TIMEOUT: <ClockCircleOutlined style={{ color: '#F59E0B', fontSize: 11 }} />,
  CONNECTION_REFUSED: <CloseCircleOutlined style={{ color: '#EF4444', fontSize: 11 }} />,
  DUMP: <AlertOutlined style={{ color: '#A855F7', fontSize: 11 }} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  TIMEOUT: 'orange',
  CONNECTION_REFUSED: 'red',
  DUMP: 'purple',
  ERROR: 'volcano',
};

export function LogAnomalyStrip({ anomalies, maxItems = 12 }: LogAnomalyStripProps) {
  const visible = useMemo(() => anomalies.slice(0, maxItems), [anomalies, maxItems]);

  if (anomalies.length === 0) return null;

  return (
    <Card
      size="small"
      title={
        <Space size={4}>
          <AlertOutlined style={{ color: '#EF4444' }} />
          <Text strong style={{ color: '#F8FAFC', fontSize: 12 }}>Log Anomalies</Text>
          <Tag color="#EF4444" style={{ fontSize: 9, margin: 0 }}>{anomalies.length}</Tag>
        </Space>
      }
      style={{
        background: 'rgba(239,68,68,0.04)',
        borderColor: 'rgba(239,68,68,0.12)',
        borderRadius: 6,
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      {visible.map((a, i) => {
        const cat = a.category.split(':')[0] || a.category;
        const icon = CATEGORY_ICONS[cat] || <WarningOutlined style={{ color: '#EF4444', fontSize: 11 }} />;
        const color = CATEGORY_COLORS[cat] || 'red';
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 6,
              padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            <span style={{ marginTop: 2 }}>{icon}</span>
            <Tag color={color} style={{ fontSize: 9, margin: 0, lineHeight: '14px', fontFamily: 'JetBrains Mono' }}>
              {cat}
            </Tag>
            <Text
              style={{
                color: '#94A3B8', fontSize: 10, lineHeight: '15px',
                fontFamily: 'JetBrains Mono, monospace',
                wordBreak: 'break-all',
              }}
            >
              {a.detail || a.line?.slice(0, 120)}
            </Text>
          </div>
        );
      })}
    </Card>
  );
}