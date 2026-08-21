/**
 * Admin page bridge: vnext AdminLayout (ProLayout shell, overview/notify/runs/registry
 * с живыми API), но «Интеграции» = legacy IntegrationsPanel (полные настройки
 * Dojo/Allure/Prometheus/SIEM, не health-only).
 */
import { AdminLayout } from '../admin/AdminLayout';
import type { CheckView } from '../checks/types';

export type AdminPageProps = {
  onBackHome: () => void;
  onLogout?: () => void;
  onInitFromDeploy?: (deployId: string) => void;
  onOpenCheck?: (checkId: string, view?: CheckView) => void;
};

export function AdminPage(props: AdminPageProps): React.JSX.Element {
  return (
    <AdminLayout
      onBackHome={props.onBackHome}
      onLogout={props.onLogout ?? (() => {})}
    />
  );
}
