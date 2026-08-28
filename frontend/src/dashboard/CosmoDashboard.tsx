/**
 * COS-F3: CosmoDashboard — верхнеуровневый дашборд домена.
 *
 * Карточки: Apps всего, Runs сегодня, Findings открытые, Admission-статус.
 * График: Runs за неделю (passed/failed/blocked).
 */
import { Card, Col, Row, Statistic, Typography, Tag, Progress, Space } from 'antd';
import {
  AppstoreOutlined, PlayCircleOutlined, BugOutlined, SafetyOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';

const MOCK_STATS = {
  totalApps: 12,
  runsToday: 8,
  openFindings: 23,
  admissionStatus: 'pass' as const,
  runsThisWeek: [
    { day: 'Пн', passed: 5, failed: 1, blocked: 1 },
    { day: 'Вт', passed: 7, failed: 0, blocked: 0 },
    { day: 'Ср', passed: 4, failed: 2, blocked: 1 },
    { day: 'Чт', passed: 6, failed: 1, blocked: 0 },
    { day: 'Пт', passed: 8, failed: 0, blocked: 0 },
    { day: 'Сб', passed: 3, failed: 0, blocked: 0 },
    { day: 'Вс', passed: 2, failed: 0, blocked: 0 },
  ],
};

export function CosmoDashboard() {
  const stats = MOCK_STATS;
  const maxRun = Math.max(...stats.runsThisWeek.map((d) => d.passed + d.failed + d.blocked), 1);

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto', background: '#070B14' }}>
      {/* KPI cards */}
      <Row gutter={[12, 12]}>
        <Col span={6}>
          <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 12 }}>Apps</span>}
              value={stats.totalApps}
              prefix={<AppstoreOutlined style={{ color: '#a855f7' }} />}
              valueStyle={{ color: '#e2e8f0', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 12 }}>Runs Today</span>}
              value={stats.runsToday}
              prefix={<PlayCircleOutlined style={{ color: '#3b82f6' }} />}
              valueStyle={{ color: '#e2e8f0', fontSize: 24 }}
              suffix={<ArrowUpOutlined style={{ color: '#22c55e', fontSize: 14 }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 12 }}>Open Findings</span>}
              value={stats.openFindings}
              prefix={<BugOutlined style={{ color: '#f59e0b' }} />}
              valueStyle={{ color: '#e2e8f0', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 12 }}>Admission</span>}
              value={stats.admissionStatus === 'pass' ? 'Pass' : 'Block'}
              prefix={<SafetyOutlined style={{ color: stats.admissionStatus === 'pass' ? '#22c55e' : '#ef4444' }} />}
              valueStyle={{ color: stats.admissionStatus === 'pass' ? '#22c55e' : '#ef4444', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Weekly chart */}
      <Card
        title={<span style={{ color: '#e2e8f0', fontSize: 14 }}>Runs — Last 7 Days</span>}
        size="small"
        style={{ marginTop: 12, background: '#0f172a', borderColor: '#1e293b' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 120 }}>
          {stats.runsThisWeek.map((d) => {
            const total = d.passed + d.failed + d.blocked;
            const h = Math.max((total / maxRun) * 100, 4);
            return (
              <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: `${h}%`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ flex: d.passed / (total || 1), background: '#22c55e', borderRadius: '3px 3px 0 0', minHeight: total > 0 ? 0 : 2 }} />
                  <div style={{ flex: d.failed / (total || 1), background: '#ef4444', minHeight: 0 }} />
                  <div style={{ flex: d.blocked / (total || 1), background: '#f59e0b', borderRadius: '0 0 3px 3px', minHeight: 0 }} />
                </div>
                <Typography.Text style={{ fontSize: 10, color: '#64748b' }}>{d.day}</Typography.Text>
              </div>
            );
          })}
        </div>
        <Space style={{ marginTop: 8 }}>
          <Tag color="green">Passed</Tag>
          <Tag color="red">Failed</Tag>
          <Tag color="orange">Blocked</Tag>
        </Space>
      </Card>
    </div>
  );
}