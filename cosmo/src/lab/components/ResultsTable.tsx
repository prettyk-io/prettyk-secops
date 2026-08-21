import { useMemo, useState } from 'react';
import { Checkbox, Input, Progress, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LabResultItem } from '../labApi';

const { Text } = Typography;

export interface ResultsTableProps {
  results: LabResultItem[];
  progress: { completed: number; total: number };
  selectedResultId: number | null;
  onSelectResult: (id: number) => void;
  loading?: boolean;
}

export function ResultsTable({
  results,
  progress,
  selectedResultId,
  onSelectResult,
  loading,
}: ResultsTableProps) {
  const [filterText, setFilterText] = useState('');
  const [filterOnlyErrors, setFilterOnlyErrors] = useState(false);
  const [filterOnlyMatches, setFilterOnlyMatches] = useState(false);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filterOnlyErrors && r.status < 400 && r.status !== 0) return false;
      if (filterOnlyMatches) {
        const hasMatch = Object.values(r.grep_matches || {}).some(Boolean);
        if (!hasMatch) return false;
      }
      if (filterText) {
        const txt = filterText.toLowerCase();
        const pMatch = r.payloads.some((p) => p.toLowerCase().includes(txt));
        const urlMatch = r.url.toLowerCase().includes(txt);
        if (!pMatch && !urlMatch) return false;
      }
      return true;
    });
  }, [results, filterOnlyErrors, filterOnlyMatches, filterText]);

  const columns = useMemo<ColumnsType<LabResultItem>>(() => [
    {
      title: '#',
      dataIndex: 'id',
      width: 45,
      render: (v: number) => <span style={{ color: '#64748B' }}>{v}</span>,
    },
    {
      title: 'Payload',
      dataIndex: 'payloads',
      ellipsis: true,
      render: (p: string[]) => (
        <span style={{ fontFamily: 'JetBrains Mono', color: '#38BDF8', fontWeight: 500 }}>
          {p.join(' | ')}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 75,
      render: (s: number) => {
        const color = s >= 500 ? 'red' : s >= 400 ? 'orange' : s >= 200 && s < 300 ? 'green' : 'default';
        return <Tag color={color}>{s || 'ERR'}</Tag>;
      },
    },
    {
      title: 'Length',
      dataIndex: 'length',
      width: 75,
      render: (len: number) => <span style={{ color: '#94A3B8' }}>{len} b</span>,
    },
    {
      title: 'Time',
      dataIndex: 'elapsed_ms',
      width: 70,
      render: (ms: number) => <span style={{ color: '#94A3B8' }}>{ms}ms</span>,
    },
    {
      title: 'Grep Match',
      dataIndex: 'grep_matches',
      width: 100,
      render: (matches: Record<string, boolean>) => {
        const active = Object.entries(matches || {}).filter(([_, v]) => v);
        if (active.length === 0) return <span style={{ color: '#475569' }}>—</span>;
        return (
          <Space size={2} wrap>
            {active.map(([k]) => (
              <Tag key={k} color="#9333EA" style={{ fontSize: 10, margin: 0 }}>
                MATCH
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ], []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>Результаты</Text>
        {progress.total > 0 && (
          <Tag color="#38BDF8">
            {progress.completed} / {progress.total} ({Math.round((progress.completed / progress.total) * 100)}%)
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <Input
          size="small"
          placeholder="Поиск..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ width: 120, background: '#0B0F17', color: '#F8FAFC' }}
        />
        <Checkbox checked={filterOnlyErrors} onChange={(e) => setFilterOnlyErrors(e.target.checked)}
          style={{ color: '#94A3B8', fontSize: 11 }}>
          Только ошибки
        </Checkbox>
        <Checkbox checked={filterOnlyMatches} onChange={(e) => setFilterOnlyMatches(e.target.checked)}
          style={{ color: '#94A3B8', fontSize: 11 }}>
          Только Grep Match
        </Checkbox>
      </div>

      {progress.total > 0 && (
        <Progress
          percent={Math.round((progress.completed / progress.total) * 100)}
          size="small"
          strokeColor="#9333EA"
          showInfo={false}
          style={{ marginBottom: 8 }}
        />
      )}

      <Table<LabResultItem>
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={filteredResults}
        pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
        scroll={{ y: 350 }}
        onRow={(record) => ({
          onClick: () => onSelectResult(record.id),
          style: {
            cursor: 'pointer',
            background: record.id === selectedResultId ? 'rgba(147, 51, 234, 0.15)' : undefined,
          },
        })}
        columns={columns}
        locale={{ emptyText: <span style={{ color: '#64748B' }}>Нет результатов. Запустите атаку.</span> }}
      />
    </div>
  );
}

