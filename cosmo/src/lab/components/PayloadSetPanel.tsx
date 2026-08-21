import { useCallback, useMemo } from 'react';
import { Button, Input, InputNumber, Select, Space, Tag, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { PayloadSetConfig } from '../LabSessionProvider';

const { Text } = Typography;
const { TextArea } = Input;

const PRESETS: Record<string, string[]> = {
  sqli: ["' OR '1'='1", "' UNION SELECT NULL--", "' OR 1=1#", "admin'--", "'; DROP TABLE users--"],
  xss: ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'-alert(1)-'", '<svg onload=alert(1)>'],
  ssrf: ['http://169.254.169.254/', 'http://localhost/', 'http://127.0.0.1/', 'http://0.0.0.0/', 'file:///etc/passwd'],
  auth: ['admin:admin', 'admin:password', 'root:root', 'user:pass', 'test:test'],
  boundary: ['%00', '%0d%0a', '..%2f', '../../etc/passwd', 'A'.repeat(5000)],
};

export interface PayloadSetPanelProps {
  payloadSet: PayloadSetConfig;
  onChange: (patch: Partial<PayloadSetConfig>) => void;
}

function generateNumbers(start: number, stop: number, step: number): string[] {
  const items: string[] = [];
  for (let v = start; v <= stop; v += step) {
    items.push(String(v));
    if (items.length >= 100) { items.push('...'); break; }
  }
  return items;
}

function generateBrute(charset: string, minLen: number, maxLen: number): string[] {
  const items: string[] = [];
  const chars = charset.split('');
  const count = Math.min(300, Math.pow(chars.length, maxLen));
  let n = 0;
  const attempt = new Array(maxLen).fill(0);
  for (let len = minLen; len <= maxLen && n < count; len++) {
    const indices = new Array(len).fill(0);
    let done = false;
    while (!done && n < count) {
      items.push(indices.map((i) => chars[i]).join(''));
      n++;
      let carry = 1;
      for (let p = len - 1; p >= 0; p--) {
        indices[p] += carry;
        if (indices[p] >= chars.length) { indices[p] = 0; carry = 1; } else { carry = 0; break; }
      }
      if (carry) done = true;
    }
  }
  if (n >= count) items.push('...');
  return items;
}

export function PayloadSetPanel({ payloadSet, onChange }: PayloadSetPanelProps) {
  const handleKindChange = useCallback((kind: PayloadSetConfig['kind']) => {
    onChange({ kind });
  }, [onChange]);

  const handlePreset = useCallback((key: string) => {
    onChange({ kind: 'preset', presetKey: key, customItems: PRESETS[key] ?? [] });
  }, [onChange]);

  const preview = useMemo(() => {
    const items: string[] = [];
    if (payloadSet.kind === 'preset' && payloadSet.presetKey && PRESETS[payloadSet.presetKey]) {
      items.push(...(PRESETS[payloadSet.presetKey] ?? []));
    } else if (payloadSet.kind === 'custom') {
      items.push(...payloadSet.customItems);
    } else if (payloadSet.kind === 'numbers') {
      items.push(...generateNumbers(payloadSet.numberStart, payloadSet.numberStop, payloadSet.numberStep));
    } else if (payloadSet.kind === 'bruteforce') {
      items.push(...generateBrute(payloadSet.bruteCharset, payloadSet.bruteMinLen, payloadSet.bruteMaxLen));
    }
    const total = items.filter((i) => i !== '...').length;
    const first5 = items.filter((i) => i !== '...').slice(0, 5);
    return { first5, total };
  }, [payloadSet]);

  return (
    <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>{payloadSet.positionName}</Text>
        <Tag color="#9333EA" style={{ margin: 0 }}>
          {payloadSet.kind === 'preset' ? `Пресет ${payloadSet.presetKey?.toUpperCase()}` : payloadSet.kind === 'custom' ? 'Свой список' : payloadSet.kind === 'numbers' ? 'Числа' : 'Brute Force'}
        </Tag>
      </div>

      <Space size="small" wrap style={{ marginBottom: 12 }}>
        {Object.keys(PRESETS).map((k) => (
          <Button
            key={k}
            size="small"
            type={payloadSet.kind === 'preset' && payloadSet.presetKey === k ? 'primary' : 'default'}
            onClick={() => handlePreset(k)}
            style={{
              borderRadius: 4,
              background: payloadSet.kind === 'preset' && payloadSet.presetKey === k
                ? 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)'
                : '#1E293B',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#E2E8F0',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {k.toUpperCase()}
          </Button>
        ))}
        <Button size="small" type={payloadSet.kind === 'custom' ? 'primary' : 'default'}
          onClick={() => handleKindChange('custom')}
          style={{ borderRadius: 4, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', fontSize: 11 }}>
          Свой
        </Button>
        <Button size="small" type={payloadSet.kind === 'numbers' ? 'primary' : 'default'}
          onClick={() => handleKindChange('numbers')}
          style={{ borderRadius: 4, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', fontSize: 11 }}>
          Числа
        </Button>
        <Button size="small" type={payloadSet.kind === 'bruteforce' ? 'primary' : 'default'}
          onClick={() => handleKindChange('bruteforce')}
          style={{ borderRadius: 4, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', fontSize: 11 }}>
          Brute
        </Button>
      </Space>

      {payloadSet.kind === 'custom' && (
        <TextArea
          value={payloadSet.customItems.join('\n')}
          onChange={(e) => onChange({ customItems: e.target.value.split('\n').filter(Boolean) })}
          rows={6}
          placeholder="один пейлоад на строку"
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            background: '#0B0F17', color: '#E2E8F0',
            borderColor: 'rgba(255,255,255,0.12)', borderRadius: 6,
            marginBottom: 12,
          }}
        />
      )}

      {payloadSet.kind === 'numbers' && (
        <Space size="small" style={{ marginBottom: 12 }}>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>От</Text>
            <InputNumber size="small" value={payloadSet.numberStart}
              onChange={(v) => onChange({ numberStart: v ?? 0 })}
              style={{ width: 80, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>До</Text>
            <InputNumber size="small" value={payloadSet.numberStop}
              onChange={(v) => onChange({ numberStop: v ?? 10 })}
              style={{ width: 80, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Шаг</Text>
            <InputNumber size="small" value={payloadSet.numberStep}
              onChange={(v) => onChange({ numberStep: v ?? 1 })}
              style={{ width: 80, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
        </Space>
      )}

      {payloadSet.kind === 'bruteforce' && (
        <Space size="small" style={{ marginBottom: 12 }}>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Алфавит</Text>
            <Input size="small" value={payloadSet.bruteCharset}
              onChange={(e) => onChange({ bruteCharset: e.target.value })}
              style={{ width: 120, fontFamily: 'JetBrains Mono, monospace', background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Мин. длина</Text>
            <InputNumber size="small" value={payloadSet.bruteMinLen}
              onChange={(v) => onChange({ bruteMinLen: v ?? 1 })}
              style={{ width: 70, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Макс. длина</Text>
            <InputNumber size="small" value={payloadSet.bruteMaxLen}
              onChange={(v) => onChange({ bruteMaxLen: v ?? 3 })}
              style={{ width: 70, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
        </Space>
      )}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginBottom: 10 }}>
        <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginBottom: 6 }}>Обработка</Text>
        <Space size="small" wrap style={{ marginBottom: 8 }}>
          <Select
            mode="multiple"
            size="small"
            value={payloadSet.encoders}
            onChange={(v) => onChange({ encoders: v })}
            placeholder="Энкодеры"
            style={{ minWidth: 180, maxWidth: 280 }}
            options={[
              { value: 'url', label: 'URL' },
              { value: 'base64', label: 'Base64' },
              { value: 'hex', label: 'Hex' },
              { value: 'md5', label: 'MD5' },
            ]}
          />
        </Space>
        <Space size="small">
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Префикс</Text>
            <Input size="small" value={payloadSet.prefix}
              onChange={(e) => onChange({ prefix: e.target.value })}
              style={{ width: 100, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 11, display: 'block' }}>Суффикс</Text>
            <Input size="small" value={payloadSet.suffix}
              onChange={(e) => onChange({ suffix: e.target.value })}
              style={{ width: 100, background: '#0B0F17', color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)' }} />
          </div>
        </Space>
      </div>

      <div style={{
        background: '#0B0F17', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6, padding: 10, marginTop: 4,
      }}>
        <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 4, display: 'block' }}>
          Первые 5 пейлоадов ({preview.total} всего):
        </Text>
        {preview.first5.map((p, i) => (
          <Tag key={i} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            background: '#1E293B', border: '1px solid rgba(255,255,255,0.08)',
            color: '#38BDF8', margin: '2px 4px 2px 0',
          }}>
            {p.length > 60 ? p.substring(0, 57) + '...' : p}
          </Tag>
        ))}
        {preview.first5.length === 0 && (
          <Text style={{ color: '#475569', fontSize: 11 }}>Нет пейлоадов</Text>
        )}
      </div>
    </div>
  );
}