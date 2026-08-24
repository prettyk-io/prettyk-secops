/**
 * VN-FBR-1: EvidencePanel — карточки доказательств (pack ID, severity, тип, скрин).
 * GET /api/evidence. Down → «Нет данных».
 */
import { useEffect, useState } from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import { fetchEvidence, type EvidenceCard } from './adminApi';
import { LocatorHealthPanel } from './LocatorHealthPanel';
import { LogAnomalyStrip } from './LogAnomalyStrip';

function sevTag(v?: string): React.JSX.Element {
  const s = (v || '').toLowerCase();
  const color =
    s === 'critical' ? 'error'
    : s === 'high' ? 'volcano'
    : s === 'medium' ? 'gold'
    : s === 'low' ? 'green'
    : 'default';
  return <Tag color={color}>{v || '—'}</Tag>;
}

export function EvidencePanel(): React.JSX.Element {
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [down, setDown] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEvidence().then((res) => {
      if (cancelled) return;
      setCards(res.items);
      setDown(!res.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (down && cards.length === 0) {
    return (
      <Typography.Text type="secondary" data-testid="evidence-empty">
        Нет данных
      </Typography.Text>
    );
  }

  return (
    <div data-testid="evidence-panel" className="pk-admin-page">
      <Row gutter={[16, 16]}>
        {cards.length === 0 ? (
          <Col span={24}>
            <Typography.Text type="secondary" data-testid="evidence-empty">
              Нет данных
            </Typography.Text>
          </Col>
        ) : (
          cards.map((card, i) => (
            <Col xs={24} sm={12} lg={8} key={card.check_id ?? i}>
              <Card size="small" className="pk-admin-card" data-testid={`evidence-${i}`}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text code>pack: {card.check_id ?? '—'}</Typography.Text>
                  <Space size={6}>
                    {sevTag(card.severity)}
                    {card.finding_type ? <Tag>{card.finding_type}</Tag> : null}
                  </Space>
                  {card.screenshot ? (
                    <img
                      src={card.screenshot}
                      alt="screenshot"
                      style={{ width: '100%', borderRadius: 4, border: '1px solid var(--pk-border)' }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {card.source || 'source: —'}
                  </Typography.Text>
                </Space>
              </Card>
            </Col>
          ))
        )}
      </Row>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <LocatorHealthPanel locators={[]} />
        <LogAnomalyStrip anomalies={[]} />
      </div>
    </div>
  );
}
