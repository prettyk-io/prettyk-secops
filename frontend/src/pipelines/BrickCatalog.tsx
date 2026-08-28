/**
 * COS-F4: PipelineBrick Catalog UI.
 *
 * Список доступных Bricks из `GET /api/bricks`.
 * Фильтр по типу: SAST / SCA / Build / Deploy / DAST / Gate.
 * Карточка Brick: name, type, executor, image, inputs/outputs, depends_on.
 */
import { useState, useMemo } from 'react';
import { Input, Card, Tag, Typography, Segmented, Space, Empty } from 'antd';
import {
  SafetyOutlined, BugOutlined, BuildOutlined, CloudUploadOutlined,
  DeploymentUnitOutlined, StopOutlined, SearchOutlined,
} from '@ant-design/icons';

export interface BrickDef {
  id: string;
  name: string;
  type: 'sast' | 'sca' | 'build' | 'deploy' | 'dast' | 'gate';
  executor: string;
  image: string;
  inputs: string[];
  outputs: string[];
  depends_on?: string[];
  description?: string;
}

const MOCK_BRICKS: BrickDef[] = [
  { id: 'b-sast-1', name: 'Semgrep SAST', type: 'sast', executor: 'semgrep', image: 'semgrep/semgrep:latest', inputs: ['src'], outputs: ['findings.json'], description: 'Static analysis' },
  { id: 'b-sca-1', name: 'Dependency Check', type: 'sca', executor: 'owasp-dc', image: 'owasp/dependency-check:latest', inputs: ['wired'], outputs: ['report.html'] },
  { id: 'b-build-1', name: 'Docker Build', type: 'build', executor: 'docker', image: 'docker:latest', inputs: ['Dockerfile'], outputs: ['image.tar'] },
  { id: 'b-deploy-1', name: 'K8s Deploy', type: 'deploy', executor: 'kubectl', image: 'bitnami/kubectl:latest', inputs: ['image:tag'], outputs: ['lb_url'] },
  { id: 'b-dast-1', name: 'scanner Full Scan', type: 'dast', executor: 'scanner', image: 'scanner-full:latest', inputs: ['target_url'], outputs: ['scanner_report.json'], depends_on: ['b-deploy-1'] },
  { id: 'b-dast-2', name: 'Nuclei Scan', type: 'dast', executor: 'nuclei', image: 'projectdiscovery/nuclei:latest', inputs: ['target_url'], outputs: ['nuclei.json'] },
  { id: 'b-gate-1', name: 'Quality Gate', type: 'gate', executor: 'policy', image: 'prettyk/gate:latest', inputs: ['findings'], outputs: ['verdict'], depends_on: ['b-dast-1'] },
];

const TYPE_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'sast', label: 'SAST' },
  { value: 'sca', label: 'SCA' },
  { value: 'build', label: 'Build' },
  { value: 'deploy', label: 'Deploy' },
  { value: 'dast', label: 'DAST' },
  { value: 'gate', label: 'Gate' },
] as const;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  sast: <SafetyOutlined />, sca: <BugOutlined />, build: <BuildOutlined />,
  deploy: <CloudUploadOutlined />, dast: <DeploymentUnitOutlined />, gate: <StopOutlined />,
};

const TYPE_COLORS: Record<string, string> = {
  sast: 'purple', sca: 'orange', build: 'blue', deploy: 'cyan', dast: 'red', gate: 'gold',
};

export interface BrickCatalogProps {
  bricks?: BrickDef[];
  onSelect?: (brick: BrickDef) => void;
}

export function BrickCatalog({ bricks = MOCK_BRICKS, onSelect }: BrickCatalogProps) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = bricks;
    if (filter !== 'all') list = list.filter((b) => b.type === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(s) || b.type.toLowerCase().includes(s));
    }
    return list;
  }, [bricks, filter, search]);

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Segmented<string>
          options={[...TYPE_FILTERS]}
          value={filter}
          onChange={(v) => setFilter(v as string)}
          size="small"
          block
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск brick…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          allowClear
        />
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <Empty description="Нет brick'ов" />
          ) : (
            filtered.map((b) => (
              <Card
                key={b.id}
                size="small"
                hoverable
                onClick={() => onSelect?.(b)}
                style={{ marginBottom: 8, background: '#0f172a', borderColor: '#1e293b' }}
                bodyStyle={{ padding: 10 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: TYPE_COLORS[b.type] || '#fff' }}>{TYPE_ICONS[b.type]}</span>
                  <Typography.Text strong style={{ flex: 1, color: '#e2e8f0', fontSize: 13 }}>{b.name}</Typography.Text>
                  <Tag color={TYPE_COLORS[b.type]}>{b.type.toUpperCase()}</Tag>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                  <span>{b.executor}</span>
                  {b.depends_on && b.depends_on.length > 0 && (
                    <span style={{ marginLeft: 8 }}>↖ {b.depends_on.length} dep(s)</span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </Space>
    </div>
  );
}