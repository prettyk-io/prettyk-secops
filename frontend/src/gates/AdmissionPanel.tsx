/**
 * COS-F8: Admission Gate Panel.
 *
 * Сводка: все Gates + их решения.
 * Ручное решение: Pass / Block / Request re-run.
 * Подпись: комментарий + timestamp.
 * ГОСТ-Акт: кнопка «Сформировать Акт».
 */
import { useState, useCallback } from 'react';
import { Button, Card, Tag, Typography, Space, Input, Divider, Result } from 'antd';
import {
  CheckOutlined, CloseOutlined, ReloadOutlined, FileTextOutlined,
} from '@ant-design/icons';

export interface AdmissionDecision {
  gateId: string;
  gateName: string;
  finding_type: string;
  count: number;
  maxAllowed: number;
  action: 'block' | 'warn' | 'pass';
  verdict: 'pending' | 'pass' | 'block' | 'rejected';
}

const MOCK_GATES: AdmissionDecision[] = [
  { gateId: 'g1', gateName: 'Critical Gate', finding_type: 'critical', count: 0, maxAllowed: 0, action: 'block', verdict: 'pass' },
  { gateId: 'g2', gateName: 'High Severity Gate', finding_type: 'high', count: 4, maxAllowed: 3, action: 'block', verdict: 'block' },
  { gateId: 'g3', gateName: 'Medium Severity Gate', finding_type: 'medium', count: 7, maxAllowed: 10, action: 'warn', verdict: 'pass' },
];

const VERDICT_COLORS: Record<string, string> = {
  pending: 'default', pass: 'green', block: 'red', rejected: 'orange',
};

const VERDICT_LABELS: Record<string, string> = {
  pending: 'Pending', pass: 'Pass ✓', block: 'Blocked', rejected: 'Rejected',
};

export interface AdmissionPanelProps {
  decisions?: AdmissionDecision[];
  canOverride?: boolean;   // ручной оверрайд доступен?
  onOverride?: (gateId: string, verdict: 'pass' | 'block') => void;
  onRequestRerun?: (gateId: string) => void;
  onGenerateAct?: () => void;
}

export function AdmissionPanel({
  decisions = MOCK_GATES,
  canOverride = true,
  onOverride, onRequestRerun, onGenerateAct,
}: AdmissionPanelProps) {
  const [comment, setComment] = useState('');
  const [signed, setSigned] = useState(false);

  const blockedCount = decisions.filter((d) => d.verdict === 'block').length;
  const passCount = decisions.filter((d) => d.verdict === 'pass').length;
  const hasBlocked = blockedCount > 0;

  const handleSign = useCallback(() => {
    setSigned(true);
  }, []);

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Summary */}
        <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text strong style={{ color: '#e2e8f0', fontSize: 14 }}>Admission</Typography.Text>
            <Space size="small">
              <Tag color="green">{passCount} Pass</Tag>
              {blockedCount > 0 && <Tag color="red">{blockedCount} Block</Tag>}
            </Space>
          </div>
        </Card>

        {/* Individual gates */}
        {decisions.map((d) => (
          <Card
            key={d.gateId}
            size="small"
            style={{
              background: '#0f172a',
              borderColor: d.verdict === 'block' ? '#ef4444' : d.verdict === 'pass' ? '#22c55e' : '#1e293b',
              borderLeft: `4px solid ${d.verdict === 'block' ? '#ef4444' : d.verdict === 'pass' ? '#22c55e' : '#64748b'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Typography.Text strong style={{ color: '#e2e8f0', fontSize: 13 }}>{d.gateName}</Typography.Text>
                <div style={{ marginTop: 2 }}>
                  <Tag>{d.finding_type}</Tag>
                  <Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
                    Count: {d.count} / max {d.maxAllowed}
                  </Typography.Text>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Tag color={VERDICT_COLORS[d.verdict]}>{VERDICT_LABELS[d.verdict]}</Tag>
                {canOverride && d.verdict === 'block' && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                    <Button
                      size="small"
                      icon={<CheckOutlined />}
                      type="primary"
                      style={{ background: '#22c55e', borderColor: '#22c55e', fontSize: 11 }}
                      onClick={() => onOverride?.(d.gateId, 'pass')}
                    >
                      Override Pass
                    </Button>
                    <Button
                      size="small"
                      icon={<CloseOutlined />}
                      danger
                      onClick={() => onOverride?.(d.gateId, 'block')}
                      style={{ fontSize: 11 }}
                    >
                      Block
                    </Button>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => onRequestRerun?.(d.gateId)}
                      style={{ fontSize: 11 }}
                    >
                      Re-run
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {/* Comment + sign */}
        <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
          <Typography.Text style={{ color: '#94a3b8', fontSize: 12 }}>Комментарий</Typography.Text>
          <Input.TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            size="small"
            placeholder="Причина оверрайда…"
            style={{ marginTop: 4, background: '#09090b', borderColor: '#1e293b', color: '#e2e8f0' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button
              onClick={handleSign}
              disabled={!comment.trim() || signed}
              size="small"
            >
              {signed ? 'Подписано' : 'Подписать'}
            </Button>
            {signed && (
              <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
                Operator · {new Date().toLocaleString()}
              </Typography.Text>
            )}
          </div>
        </Card>

        {/* GOST Act button */}
        <Button
          icon={<FileTextOutlined />}
          onClick={onGenerateAct}
          size="small"
          block
          style={{ borderColor: '#a855f7', color: '#a855f7' }}
        >
          Сформировать ГОСТ-Акт
        </Button>
      </Space>
    </div>
  );
}