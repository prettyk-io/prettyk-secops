import { useState } from 'react';
import { Button, Radio, Space, Table, Tag } from 'antd';
import type { LabDetailItem } from '../labApi';

export type InspectorTab = 'response' | 'request';
export type ResponseViewMode = 'raw' | 'headers' | 'render';

export interface ResultsInspectorProps {
  detail: LabDetailItem | null;
}

export function ResultsInspector({ detail }: ResultsInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('response');
  const [responseViewMode, setResponseViewMode] = useState<ResponseViewMode>('raw');

  if (!detail) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
        Нажмите на любую строку в таблице результатов для детального просмотра
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Radio.Group
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          size="small"
          optionType="button"
        >
          <Radio.Button value="response">Response</Radio.Button>
          <Radio.Button value="request">Request</Radio.Button>
        </Radio.Group>
        <Tag color={detail.status >= 400 ? 'volcano' : 'green'}>
          HTTP {detail.status} · {detail.length} bytes · {detail.elapsed_ms}ms
        </Tag>
      </div>

      {tab === 'response' ? (
        <div>
          <div style={{ marginBottom: 6 }}>
            <Space size="small">
              <Button size="small" type={responseViewMode === 'raw' ? 'primary' : 'default'}
                onClick={() => setResponseViewMode('raw')}>Raw</Button>
              <Button size="small" type={responseViewMode === 'headers' ? 'primary' : 'default'}
                onClick={() => setResponseViewMode('headers')}>Headers</Button>
              <Button size="small" type={responseViewMode === 'render' ? 'primary' : 'default'}
                onClick={() => setResponseViewMode('render')}>Render</Button>
            </Space>
          </div>

          {responseViewMode === 'raw' && (
            <pre style={{
              background: '#0B0F17', color: '#E2E8F0', padding: 10, borderRadius: 5,
              maxHeight: 300, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            }}>
              {detail.response_raw || '(Пустой ответ)'}
            </pre>
          )}

          {responseViewMode === 'headers' && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <Table
                size="small"
                pagination={false}
                dataSource={Object.entries(detail.response_headers || {}).map(([k, v]) => ({ header: k, value: v }))}
                columns={[
                  { title: 'Header', dataIndex: 'header',
                    render: (t: string) => <span style={{ color: '#9333EA', fontWeight: 600 }}>{t}</span> },
                  { title: 'Value', dataIndex: 'value',
                    render: (v: string) => <span style={{ color: '#E2E8F0' }}>{v}</span> },
                ]}
              />
            </div>
          )}

          {responseViewMode === 'render' && (
            <div style={{
              background: '#fff', color: '#000', padding: 10, borderRadius: 5,
              maxHeight: 300, overflowY: 'auto',
            }} dangerouslySetInnerHTML={{ __html: detail.response_raw }} />
          )}
        </div>
      ) : (
        <pre style={{
          background: '#0B0F17', color: '#38BDF8', padding: 10, borderRadius: 5,
          maxHeight: 300, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        }}>
          {detail.request_raw}
        </pre>
      )}
    </div>
  );
}