import { useState } from 'react';
import { Button, Checkbox, Input, Modal, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

const { Text } = Typography;

const SAMPLE_RESPONSE = `HTTP/1.1 200 OK
Server: nginx
Content-Type: text/html

<html>
<body>
<h1>Welcome, admin!</h1>
<p>Your session token: abc123-xyz-456</p>
<p>SQL Error: syntax error at or near "SELECT"</p>
</body>
</html>`;

export interface GrepPanelProps {
  grepMatchPattern: string;
  grepExtractPattern: string;
  onChange: (patch: { grepMatchPattern?: string; grepExtractPattern?: string }) => void;
}

function testPatterns(matchPattern: string, extractPattern: string): { matches: string[]; extracts: string[] } {
  const matches: string[] = [];
  if (matchPattern) {
    const parts = matchPattern.split('|').filter(Boolean);
    for (const p of parts) {
      try {
        if (new RegExp(p).test(SAMPLE_RESPONSE)) {
          matches.push(p);
        }
      } catch {
        matches.push(`${p} (invalid regex)`);
      }
    }
  }
  const extracts: string[] = [];
  if (extractPattern) {
    try {
      const re = new RegExp(extractPattern, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(SAMPLE_RESPONSE)) !== null) {
        extracts.push(m[1] ?? m[0]);
      }
    } catch {
      extracts.push('invalid regex');
    }
  }
  return { matches, extracts };
}

export function GrepPanel({ grepMatchPattern, grepExtractPattern, onChange }: GrepPanelProps) {
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ matches: string[]; extracts: string[] }>({ matches: [], extracts: [] });

  const handleTest = () => {
    const result = testPatterns(grepMatchPattern, grepExtractPattern);
    setTestResult(result);
    setTestModalOpen(true);
  };

  return (
    <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>Grep</Text>
        <Button size="small" icon={<ExperimentOutlined />} onClick={handleTest}
          style={{ borderRadius: 4, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0' }}>
          Тест
        </Button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>Grep Match</Text>
        <Input
          value={grepMatchPattern}
          onChange={(e) => onChange({ grepMatchPattern: e.target.value })}
          placeholder="SQL error|syntax error|token"
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            background: '#0B0F17', color: '#E2E8F0',
            borderColor: 'rgba(255,255,255,0.12)', borderRadius: 6,
          }}
        />
        <Text style={{ color: '#64748B', fontSize: 10, marginTop: 2, display: 'block' }}>
          Разделитель: | (вертикальная черта). Поддерживает regex.
        </Text>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>Grep Extract</Text>
        <Input
          value={grepExtractPattern}
          onChange={(e) => onChange({ grepExtractPattern: e.target.value })}
          placeholder="token: (\\w+-\\w+-\\d+)"
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            background: '#0B0F17', color: '#E2E8F0',
            borderColor: 'rgba(255,255,255,0.12)', borderRadius: 6,
          }}
        />
        <Text style={{ color: '#64748B', fontSize: 10, marginTop: 2, display: 'block' }}>
          Regex с capture group. Результат — значение первой группы.
        </Text>
      </div>

      <Modal
        title="Результат Grep-теста"
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        footer={null}
        width={600}
        styles={{ content: { background: '#111827' }, header: { background: '#111827', color: '#F8FAFC' } }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: '#F8FAFC', fontSize: 13, display: 'block', marginBottom: 6 }}>Sample ответ</Text>
          <pre style={{
            background: '#0B0F17', color: '#E2E8F0', padding: 10, borderRadius: 5,
            maxHeight: 200, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
          }}>
            {SAMPLE_RESPONSE}
          </pre>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: '#F8FAFC', fontSize: 13, display: 'block', marginBottom: 6 }}>
            Grep Match — найдено ({testResult.matches.length}):
          </Text>
          {testResult.matches.length > 0 ? (
            <Space size={4} wrap>
              {testResult.matches.map((m, i) => (
                <Tag key={i} color="#9333EA">{m}</Tag>
              ))}
            </Space>
          ) : (
            <Text style={{ color: '#64748B', fontSize: 12 }}>Ничего не найдено</Text>
          )}
        </div>

        <div>
          <Text strong style={{ color: '#F8FAFC', fontSize: 13, display: 'block', marginBottom: 6 }}>
            Grep Extract — извлечено ({testResult.extracts.length}):
          </Text>
          {testResult.extracts.length > 0 ? (
            <Space size={4} wrap>
              {testResult.extracts.map((e, i) => (
                <Tag key={i} color="#38BDF8">{e}</Tag>
              ))}
            </Space>
          ) : (
            <Text style={{ color: '#64748B', fontSize: 12 }}>Ничего не извлечено</Text>
          )}
        </div>
      </Modal>
    </div>
  );
}