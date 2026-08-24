/**
 * Локальная обёртка Pro-компонентов (ProLayout/PageContainer) для админки.
 * ProConfigProvider вынесен сюда из глобального ThemeProvider, чтобы тяжёлый
 * barrel @ant-design/pro-components импортировался только там, где реально нужен
 * (AdminLayout), а не тащился во все jsdom-тесты (~70s холодного импорта).
 */
import { ProConfigProvider } from '@ant-design/pro-components';
import { pkRuIntl } from '../theme/pkRuIntl';

export function AdminProProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ProConfigProvider intl={pkRuIntl}>{children}</ProConfigProvider>;
}
