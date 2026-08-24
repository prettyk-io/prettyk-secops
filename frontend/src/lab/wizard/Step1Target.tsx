import { useCallback, useEffect, useMemo, useState } from 'react';
import { Space, Tag, Typography, Radio, Input } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useLabSession, type ParsedTarget } from '../LabSessionProvider';

const { Text } = Typography;
const { TextArea } = Input;

function parseRawHttp(raw: string): ParsedTarget | null {
  const lines = raw.split(/\r?\n/);
  const firstLine = lines[0];
  if (!firstLine) return null;
  const requestLine = firstLine.trim();
  const parts = requestLine.split(/\s+/);
  const methodRaw = parts[0];
  const urlRaw = parts[1];
  if (!methodRaw || !urlRaw) return null;
  const method = methodRaw.toUpperCase();
  const url = urlRaw;
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) return null;

  const headers: Record<string, string> = {};
  let bodyStart = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      headers[key] = value;
    }
  }
  const body = lines.slice(bodyStart).join('\n').trim();
  return { method, url, headers, body, raw };
}

export interface Step1TargetProps {
  valid: boolean;
  onValidChange: (v: boolean) => void;
}

export function Step1Target({ valid: _valid, onValidChange }: Step1TargetProps) {
  const { session, updateAttack } = useLabSession();
  const { rawHttp } = session.singleAttack;
  const [mode, setMode] = useState<'raw' | 'form'>('raw');
  const [formUrl, setFormUrl] = useState('');
  const [formHeaders, setFormHeaders] = useState('');
  const [formBody, setFormBody] = useState('');

  const parsed = useMemo(() => parseRawHttp(rawHttp), [rawHttp]);

  useEffect(() => {
    onValidChange(Boolean(parsed));
  }, [onValidChange, parsed]);

  const handleRawChange = useCallback((value: string) => {
    updateAttack({ rawHttp: value });
    const p = parseRawHttp(value);
    if (p) {
      updateAttack({ parsedTarget: p, rawHttp: value });
      onValidChange(true);
    } else {
      onValidChange(value.trim().length > 10);
    }
  }, [updateAttack, onValidChange]);

  const switchToForm = useCallback(() => {
    if (parsed) {
      setFormUrl(parsed.url);
      setFormHeaders(Object.entries(parsed.headers).map(([k, v]) => `${k}: ${v}`).join('\n'));
      setFormBody(parsed.body);
    }
    setMode('form');
  }, [parsed]);

  const switchToRaw = useCallback(() => {
    setMode('raw');
  }, []);

  const handleFormSave = useCallback(() => {
    const hdrLines = formHeaders
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim());
    const headers: Record<string, string> = {};
    for (const line of hdrLines) {
      const ci = line.indexOf(':');
      if (ci > 0) headers[line.substring(0, ci).trim()] = line.substring(ci + 1).trim();
    }
    const newRaw = `${parsed?.method || 'GET'} ${formUrl} HTTP/1.1\n${formHeaders}\n\n${formBody}`;
    const p = parseRawHttp(newRaw);
    updateAttack({ rawHttp: newRaw, parsedTarget: p });
    onValidChange(true);
  }, [formUrl, formHeaders, formBody, parsed, updateAttack, onValidChange]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Radio.Group
          value={mode}
          size="small"
          optionType="button"
          onChange={(e) => e.target.value === 'raw' ? switchToRaw() : switchToForm()}
        >
          <Radio.Button value="raw">Raw</Radio.Button>
          <Radio.Button value="form">Form</Radio.Button>
        </Radio.Group>
      </div>

      {parsed && (
        <Tag
          icon={<CheckCircleOutlined />}
          color="#22C55E"
          style={{ marginBottom: 10, fontWeight: 500, fontSize: 13, padding: '4px 10px' }}
        >
          Запрос распознан: {parsed.method} {parsed.url.length > 80 ? parsed.url.substring(0, 77) + '...' : parsed.url}
        </Tag>
      )}

      {mode === 'raw' ? (
        <TextArea
          value={rawHttp}
          onChange={(e) => handleRawChange(e.target.value)}
          rows={14}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            background: '#0B0F17',
            color: '#E2E8F0',
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: 6,
          }}
          placeholder={'POST /api/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{"user":"admin","pass":"admin"}'}
        />
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>URL</Text>
            <Input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              onBlur={handleFormSave}
              placeholder="https://example.com/api/login"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                background: '#0B0F17',
                color: '#E2E8F0',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: 6,
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>Заголовки</Text>
            <TextArea
              value={formHeaders}
              onChange={(e) => setFormHeaders(e.target.value)}
              onBlur={handleFormSave}
              rows={5}
              placeholder="Host: example.com\nContent-Type: application/json"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                background: '#0B0F17',
                color: '#E2E8F0',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: 6,
              }}
            />
          </div>
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>Тело</Text>
            <TextArea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              onBlur={handleFormSave}
              rows={4}
              placeholder='{"user":"admin","pass":"admin"}'
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                background: '#0B0F17',
                color: '#E2E8F0',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: 6,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
