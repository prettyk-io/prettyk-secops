/**
 * VN-FBR-3: PoliciesPanel — gate-политики, read-only карточками.
 * waiver / min_severity / min_confidence / rules. GET /api/gate/policy.
 */
import { useEffect, useState } from 'react';
import { Card, Col, List, Row, Space, Tag, Typography } from 'antd';
import { fetchGatePolicy, type GatePolicy, type GateWaiver } from './adminApi';

function ruleLine(p: GatePolicy | undefined): string {
  if (!p) return '';
  const f = p.filter ?? {};
  const parts: string[] = [];
  if (f.min_severity) parts.push(`min_severity=${f.min_severity}`);
  if (typeof f.min_confidence === 'number') parts.push(`min_confidence=${f.min_confidence}`);
  if (f.require_active === false) parts.push('active не требуется');
  if (f.exclude_false_positive) parts.push('искл. false-positive');
  if (f.exclude_duplicate) parts.push('искл. дубли');
  if (f.verified_only) parts.push('verified only');
  return parts.join(' · ') || 'дефолтные правила';
}

export function PoliciesPanel(): React.JSX.Element {
  const [policy, setPolicy] = useState<GatePolicy | undefined>();
  const [down, setDown] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchGatePolicy().then((res) => {
      if (cancelled) return;
      setPolicy(res.policy);
      setDown(res.down || !res.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (down) {
    return (
      <Typography.Text type="secondary" data-testid="policies-empty">
        Нет данных
      </Typography.Text>
    );
  }

  return (
    <div data-testid="policies-panel" className="pk-admin-page">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" className="pk-admin-card" data-testid="policies-admission">
            <Typography.Text className="pk-admin-card-title">Порог допуска</Typography.Text>
            <Space direction="vertical" size={6}>
              <div>
                Gate: <Tag color={(policy?.enabled ?? false) ? 'success' : 'default'}>
                  {policy?.enabled ? 'включён' : 'выключен'}
                </Tag>
              </div>
              <div>max_critical: <Tag>{policy?.max_critical ?? '—'}</Tag></div>
              <div>max_high: <Tag>{policy?.max_high ?? '—'}</Tag></div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" className="pk-admin-card" data-testid="policies-filter">
            <Typography.Text className="pk-admin-card-title">Фильтр findings</Typography.Text>
            <Typography.Text style={{ fontSize: 13 }}>{ruleLine(policy)}</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card size="small" className="pk-admin-card" data-testid="policies-waivers">
            <Typography.Text className="pk-admin-card-title">Waivers</Typography.Text>
            {(policy?.waivers?.length ?? 0) === 0 ? (
              <Typography.Text type="secondary">Нет waivers</Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={policy!.waivers as GateWaiver[]}
                renderItem={(w) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Typography.Text>{w.title || '—'}</Typography.Text>
                      <Space size={6}>
                        {w.severity ? <Tag>{w.severity}</Tag> : null}
                        {w.cwe ? <Tag>CWE-{w.cwe}</Tag> : null}
                        {w.expires_at ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            до {w.expires_at}
                          </Typography.Text>
                        ) : null}
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
