import { useCallback } from 'react';
import { Button, Card, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import {
  SwapOutlined,
  KeyOutlined,
  CodeOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useLabSession, type AttackConfig } from '../LabSessionProvider';

const { Text } = Typography;
const { Option } = Select;

export type TransferKind = 'cookie' | 'extract' | 'condition';

export interface InterAttackTransfer {
  id: string;
  kind: TransferKind;
  fromAttackIdx: number;
  toAttackIdx: number;
  cookieName?: string;
  extractSource?: string;
  targetParam?: string;
  targetHeader?: string;
  conditionStatus?: string;
}

function uid(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface InterAttackTransferProps {
  index: number;
  suiteAttacks: AttackConfig[];
  transfers: InterAttackTransfer[];
  onChange: (transfers: InterAttackTransfer[]) => void;
}

export function InterAttackTransfer({ index, suiteAttacks, transfers, onChange }: InterAttackTransferProps) {
  const fromAttack = suiteAttacks[index];
  const toAttack = suiteAttacks[index + 1];
  const thisTransfers = transfers.filter((t) => t.fromAttackIdx === index);

  const addTransfer = useCallback((kind: TransferKind) => {
    const next: InterAttackTransfer = {
      id: uid(),
      kind,
      fromAttackIdx: index,
      toAttackIdx: index + 1,
      cookieName: kind === 'cookie' ? 'Set-Cookie' : undefined,
      extractSource: kind === 'extract' ? 'token' : undefined,
      targetParam: kind === 'extract' ? 'auth' : undefined,
      targetHeader: kind === 'cookie' ? 'Cookie' : undefined,
      conditionStatus: kind === 'condition' ? '2xx' : undefined,
    };
    onChange([...transfers, next]);
  }, [index, transfers, onChange]);

  const updateTransfer = useCallback((id: string, patch: Partial<InterAttackTransfer>) => {
    onChange(transfers.map((t) => t.id === id ? { ...t, ...patch } : t));
  }, [transfers, onChange]);

  const removeTransfer = useCallback((id: string) => {
    onChange(transfers.filter((t) => t.id !== id));
  }, [transfers, onChange]);

  if (!fromAttack || !toAttack) return null;

  const fromMethod = fromAttack.parsedTarget?.method || '?';
  const fromUrl = fromAttack.parsedTarget?.url || '?';
  const toMethod = toAttack.parsedTarget?.method || '?';
  const toUrl = toAttack.parsedTarget?.url || '?';

  return (
    <Card
      size="small"
      style={{
        background: 'rgba(147,51,234,0.05)',
        borderColor: 'rgba(147,51,234,0.15)',
        borderRadius: 6,
        borderStyle: 'dashed',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: thisTransfers.length > 0 ? 8 : 0 }}>
        <SwapOutlined style={{ color: '#A78BFA', fontSize: 14 }} />
        <Text style={{ color: '#A78BFA', fontSize: 12, fontWeight: 600 }}>
          Передача данных: Атака {index + 1} → Атака {index + 2}
        </Text>
        <Text style={{ color: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
          {fromMethod} {fromUrl.substring(0, 25)}... → {toMethod} {toUrl.substring(0, 25)}...
        </Text>
        <div style={{ flex: 1 }} />
        <Space size={4}>
          <Button
            size="small" type="text"
            icon={<KeyOutlined />}
            onClick={() => addTransfer('cookie')}
            style={{ color: '#A78BFA', fontSize: 11 }}
          >
            Cookie
          </Button>
          <Button
            size="small" type="text"
            icon={<CodeOutlined />}
            onClick={() => addTransfer('extract')}
            style={{ color: '#38BDF8', fontSize: 11 }}
          >
            Extract
          </Button>
          <Button
            size="small" type="text"
            onClick={() => addTransfer('condition')}
            style={{ color: '#94A3B8', fontSize: 11 }}
          >
            Condition
          </Button>
        </Space>
      </div>

      {thisTransfers.map((tr) => (
        <div
          key={tr.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4,
          }}
        >
          {tr.kind === 'cookie' && (
            <>
              <Tag color="#9333EA" style={{ margin: 0, fontSize: 10 }}>Cookie</Tag>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Взять</Text>
              <Input
                size="small"
                value={tr.cookieName}
                onChange={(e) => updateTransfer(tr.id, { cookieName: e.target.value })}
                style={{ width: 90, background: '#0B0F17', color: '#38BDF8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                placeholder="Set-Cookie"
              />
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>из ответа Атаки {index + 1} → в заголовок</Text>
              <Input
                size="small"
                value={tr.targetHeader}
                onChange={(e) => updateTransfer(tr.id, { targetHeader: e.target.value })}
                style={{ width: 70, background: '#0B0F17', color: '#38BDF8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                placeholder="Cookie"
              />
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Атаки {index + 2}</Text>
            </>
          )}

          {tr.kind === 'extract' && (
            <>
              <Tag color="#38BDF8" style={{ margin: 0, fontSize: 10 }}>Extract</Tag>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Взять</Text>
              <Input
                size="small"
                value={tr.extractSource}
                onChange={(e) => updateTransfer(tr.id, { extractSource: e.target.value })}
                style={{ width: 60, background: '#0B0F17', color: '#38BDF8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                placeholder="token"
              />
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>из Extract Атаки {index + 1} → в параметр</Text>
              <Input
                size="small"
                value={tr.targetParam}
                onChange={(e) => updateTransfer(tr.id, { targetParam: e.target.value })}
                style={{ width: 60, background: '#0B0F17', color: '#38BDF8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                placeholder="auth"
              />
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Атаки {index + 2}</Text>
            </>
          )}

          {tr.kind === 'condition' && (
            <>
              <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>Cond</Tag>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Продолжать только если status Атаки {index + 1}</Text>
              <Select
                size="small"
                value={tr.conditionStatus}
                onChange={(v) => updateTransfer(tr.id, { conditionStatus: v })}
                style={{ width: 70, fontFamily: 'JetBrains Mono' }}
                dropdownStyle={{ background: '#111827' }}
              >
                <Option value="2xx">2xx</Option>
                <Option value="200">200</Option>
                <Option value="3xx">3xx</Option>
                <Option value="!4xx">!4xx</Option>
                <Option value="!5xx">!5xx</Option>
              </Select>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>→ пропустить Атаку {index + 2}</Text>
            </>
          )}

          <Button
            size="small" type="text" danger
            icon={<DeleteOutlined />}
            onClick={() => removeTransfer(tr.id)}
            style={{ marginLeft: 'auto', padding: '0 4px' }}
          />
        </div>
      ))}
    </Card>
  );
}