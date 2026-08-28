/**
 * COS-F2 — AppGraphExplorer: иерархия Domain → Level 0/1/2/3.
 *
 * Дерево: Domain → Groups (L2/L3) → Apps (L1) → Libraries (L0).
 * Каждый узел: иконка, статус последнего Run, индикаторы.
 * Раскрытие/сворачивание, поиск, контекстное меню (Run/Edit/View findings).
 */
import { useState, useMemo, useCallback } from 'react';
import { Tree, Input, Dropdown, Typography, Badge, Tag } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined, FolderOutlined, CodeOutlined, BookOutlined,
  SearchOutlined, MoreOutlined,
} from '@ant-design/icons';

export interface AppNode {
  key: string;
  title: string;
  kind: 'domain' | 'group' | 'app' | 'library';
  level: number;          // 3=domain, 2=group, 1=app, 0=library
  runStatus?: 'passed' | 'failed' | 'running' | 'idle';
  findingCount?: number;
  children?: AppNode[];
}

const MOCK_GRAPH: AppNode[] = [
  {
    key: 'domain-1', title: 'Цифровой рубль', kind: 'domain', level: 3,
    children: [
      {
        key: 'group-payments', title: 'Платежи', kind: 'group', level: 2,
        children: [
          {
            key: 'app-pay-hub', title: 'Платёжный хаб', kind: 'app', level: 1, runStatus: 'passed', findingCount: 3,
            children: [
              { key: 'lib-pay-common', title: 'pay-common', kind: 'library', level: 0, runStatus: 'passed' },
              { key: 'lib-pay-crypto', title: 'pay-crypto', kind: 'library', level: 0, runStatus: 'idle' },
            ],
          },
          {
            key: 'app-pay-gw', title: 'Payment Gateway', kind: 'app', level: 1, runStatus: 'failed', findingCount: 7,
          },
        ],
      },
      {
        key: 'group-core', title: 'Ядро', kind: 'group', level: 2,
        children: [
          { key: 'app-core', title: 'Core Banking', kind: 'app', level: 1, runStatus: 'running' },
        ],
      },
    ],
  },
];

const STATUS_COLORS: Record<string, string> = {
  passed: '#22c55e', failed: '#ef4444', running: '#3b82f6', idle: '#64748b',
};

const KIND_ICONS: Record<string, React.ReactNode> = {
  domain: <AppstoreOutlined style={{ color: '#a855f7' }} />,
  group: <FolderOutlined style={{ color: '#38bdf8' }} />,
  app: <CodeOutlined style={{ color: '#22d3ee' }} />,
  library: <BookOutlined style={{ color: '#94a3b8' }} />,
};

export interface AppGraphExplorerProps {
  nodes?: AppNode[];
  onRun?: (nodeKey: string) => void;
  onEdit?: (nodeKey: string) => void;
  onViewFindings?: (nodeKey: string) => void;
}

export function AppGraphExplorer({
  nodes = MOCK_GRAPH,
  onRun, onEdit, onViewFindings,
}: AppGraphExplorerProps) {
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['domain-1', 'group-payments']);

  const contextMenu = useCallback(
    (nodeKey: string): MenuProps['items'] => [
      { key: 'run', label: 'Запустить проверку', onClick: () => onRun?.(nodeKey) },
      { key: 'edit', label: 'Редактировать', onClick: () => onEdit?.(nodeKey) },
      { key: 'findings', label: 'Findings', onClick: () => onViewFindings?.(nodeKey) },
    ],
    [onRun, onEdit, onViewFindings],
  );

  const toDataNode = useCallback(
    (n: AppNode): DataNode => {
      const statusColor = n.runStatus ? STATUS_COLORS[n.runStatus] : undefined;
      const title = (
        <Dropdown menu={{ items: contextMenu(n.key) }} trigger={['contextMenu']}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {KIND_ICONS[n.kind]}
            <Typography.Text style={{ fontSize: 13 }}>{n.title}</Typography.Text>
            {n.runStatus && (
              <Badge color={statusColor} title={n.runStatus} />
            )}
            {n.findingCount !== undefined && n.findingCount > 0 && (
              <Tag color="orange" style={{ fontSize: 10, lineHeight: '14px' }}>{n.findingCount}</Tag>
            )}
          </span>
        </Dropdown>
      );
      return {
        key: n.key,
        title,
        children: n.children?.map(toDataNode),
      };
    },
    [contextMenu],
  );

  const treeData = useMemo(() => nodes.map(toDataNode), [nodes, toDataNode]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return treeData;
    const filter = search.toLowerCase();
    const filterTree = (items: DataNode[]): DataNode[] =>
      items
        .map((item) => {
          const keyStr = String(item.key);
          const titleStr = typeof item.title === 'string' ? item.title : keyStr;
          const childMatch = item.children ? filterTree(item.children) : [];
          const selfMatch = titleStr.toLowerCase().includes(filter);
          if (selfMatch || childMatch.length > 0) {
            return { ...item, children: childMatch.length > 0 ? childMatch : item.children };
          }
          return null;
        })
        .filter(Boolean) as DataNode[];
    return filterTree(treeData);
  }, [treeData, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#64748b' }} />}
          placeholder="Поиск приложений…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          allowClear
          style={{ background: '#0f172a', borderColor: '#1e293b', color: '#e2e8f0' }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
        <Tree.DirectoryTree
          treeData={filteredTree}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as string[])}
          showIcon={false}
          selectable={false}
          style={{ background: 'transparent', color: '#e2e8f0' }}
        />
      </div>
    </div>
  );
}