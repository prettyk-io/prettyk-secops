/**
 * VN-ADM-1: AdminLayout — коробочный ProLayout shell.
 * Меню: Обзор / Интеграции / Прогоны / Реестр. Хедер с кнопкой «Выйти».
 * Без appCode/project_id фильтра и банковского брендинга (INTEGRATION).
 */
import { useCallback, useState } from 'react';
import { Button, Layout, Typography, theme } from 'antd';
import { PageContainer, ProLayout, type MenuDataItem } from '@ant-design/pro-components';
import {
  ApiOutlined,
  BellOutlined,
  BugOutlined,
  DashboardOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  TableOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { OverviewPage } from './OverviewPage';
import { IntegrationsPanel } from './sections/IntegrationsPanel';
import { RunsPage } from './RunsPage';
import { DeployRegistry } from './DeployRegistry';
import { EvidencePanel } from './EvidencePanel';
import { DojoFindingsTable } from './DojoFindingsTable';
import { PoliciesPanel } from './PoliciesPanel';
import { NotifyPanel } from './NotifyPanel';
import { BaselineDelta } from './BaselineDelta';
import { AppsLedgerPanel } from './sections/AppsLedgerPanel';
import { RetentionPanel } from './sections/RetentionPanel';
import { DojoSyncManager } from './sections/DojoSyncManager';
import DojoSyncDashboard from './sections/DojoSyncDashboard';
import { AuthVaultPanel } from './sections/AuthVaultPanel';
import { ThemeToggle } from '../shell/ThemeToggle';
import { Wordmark } from '../shell/Wordmark';
import { useLocale } from '../locales';

export type AdminLayoutProps = {
  onBackHome: () => void;
  onLogout: () => void;
};

export type AdminSection =
  | 'overview'
  | 'integrations'
  | 'runs'
  | 'registry'
  | 'evidence'
  | 'findings'
  | 'policies'
  | 'notify'
  | 'apps'
  | 'retention'
  | 'dojo-sync'
  | 'auth-vault'
  | 'delta';

const SECTION_PATH: Record<AdminSection, string> = {
  overview: '/admin/overview',
  integrations: '/admin/integrations',
  runs: '/admin/runs',
  registry: '/admin/registry',
  evidence: '/admin/evidence',
  findings: '/admin/findings',
  policies: '/admin/policies',
  notify: '/admin/notify',
  apps: '/admin/apps',
  retention: '/admin/retention',
  'dojo-sync': '/admin/dojo-sync',
  'auth-vault': '/admin/auth-vault',
  delta: '/admin/delta',
};

const MENU: MenuDataItem[] = [
  { path: SECTION_PATH.overview, name: 'Обзор', icon: <DashboardOutlined /> },
  { path: SECTION_PATH.integrations, name: 'Интеграции', icon: <ApiOutlined /> },
  { path: SECTION_PATH.runs, name: 'Прогоны', icon: <HistoryOutlined /> },
  { path: SECTION_PATH.apps, name: 'Приложения', icon: <AppstoreOutlined /> },
  { path: SECTION_PATH.registry, name: 'Реестр', icon: <TableOutlined /> },
  { path: SECTION_PATH.evidence, name: 'Доказательства', icon: <FileSearchOutlined /> },
  { path: SECTION_PATH.findings, name: 'Находки', icon: <BugOutlined /> },
  { path: SECTION_PATH.policies, name: 'Политики', icon: <SafetyCertificateOutlined /> },
  { path: SECTION_PATH.retention, name: 'Хранилище', icon: <DeleteOutlined /> },
  { path: SECTION_PATH['dojo-sync'], name: 'Синк Dojo', icon: <ApiOutlined /> },
  { path: SECTION_PATH['auth-vault'], name: 'Auth Vault', icon: <SafetyCertificateOutlined /> },
  { path: SECTION_PATH.delta, name: 'Delta', icon: <SwapOutlined /> },
  { path: SECTION_PATH.notify, name: 'Оповещения', icon: <BellOutlined /> },
];

export function AdminLayout({ onBackHome, onLogout }: AdminLayoutProps): React.JSX.Element {
  const [section, setSection] = useState<AdminSection>('overview');
  const { token } = theme.useToken();
  const { dict } = useLocale();

  const SECTION_TITLE: Record<AdminSection, string> = {
    overview: dict.admin.sections.overview,
    integrations: dict.admin.sections.integrations,
    runs: dict.admin.sections.runs,
    registry: dict.admin.sections.registry,
    evidence: dict.admin.sections.evidence,
    findings: dict.admin.sections.findings,
    policies: dict.admin.sections.policies,
    notify: dict.admin.sections.notify,
    apps: dict.admin.sections.apps,
    retention: dict.admin.sections.retention,
    'dojo-sync': dict.admin.sections.dojoSync,
    'auth-vault': dict.admin.sections.authVault,
    delta: dict.admin.sections.delta,
  };

  const pathname = SECTION_PATH[section];
  const route = {
    path: '/admin',
    routes: MENU,
  };

  const menuItemRender = useCallback(
    (item: MenuDataItem, dom: React.ReactNode) => (
      <a
        href={`#${item.path ?? ''}`}
        onClick={(e) => {
          e.preventDefault();
          const found = (Object.keys(SECTION_PATH) as AdminSection[]).find(
            (s) => SECTION_PATH[s] === item.path,
          );
          if (found) {
            setSection(found);
          }
        }}
      >
        {dom}
      </a>
    ),
    [],
  );

  const content = (() => {
    switch (section) {
      case 'integrations':
        return <IntegrationsPanel />;
      case 'runs':
        return <RunsPage />;
      case 'registry':
        return <DeployRegistry />;
      case 'apps':
        return <AppsLedgerPanel />;
      case 'evidence':
        return <EvidencePanel />;
      case 'findings':
        return <DojoFindingsTable />;
      case 'policies':
        return <PoliciesPanel />;
      case 'retention':
        return <RetentionPanel />;
      case 'dojo-sync':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <DojoSyncDashboard />
            <DojoSyncManager />
          </div>
        );
      case 'auth-vault':
        return <AuthVaultPanel />;
      case 'notify':
        return <NotifyPanel />;
      case 'delta':
        return <BaselineDelta />;
      case 'overview':
      default:
        return <OverviewPage projectId="" />;
    }
  })();

  return (
    <Layout data-testid="admin-page" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <ProLayout
        className="pk-admin-pro"
        title={false}
        logo={<Wordmark />}
        layout="side"
        fixedHeader
        fixSiderbar
        siderWidth={200}
        location={{ pathname }}
        route={route}
        token={{
          bgLayout: token.colorBgLayout,
          sider: { colorMenuBackground: token.colorBgContainer },
        }}
        menuItemRender={menuItemRender}
        actionsRender={() => [
          <Button
            key="logout"
            type="text"
            icon={<LogoutOutlined />}
            onClick={onLogout}
            data-testid="admin-logout"
          >
            Выйти
          </Button>,
        ]}
      >
        <PageContainer
          title={SECTION_TITLE[section]}
          ghost
          breadcrumb={{
            items: [
              { title: <Typography.Link onClick={onBackHome}>Главная</Typography.Link> },
              { title: 'Admin' },
              { title: SECTION_TITLE[section] },
            ],
          }}
        >
          {content}
        </PageContainer>
      </ProLayout>
    </Layout>
  );
}
