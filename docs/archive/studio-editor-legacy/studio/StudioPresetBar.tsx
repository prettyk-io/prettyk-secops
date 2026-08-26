/**
 * STUDIO-LADDER-1: StudioPresetBar — панель выбора цели и пресетов в Studio.
 * Быстрый выбор активного целевого сервиса / окружения на базе Cosmo/Bank пресетов
 * (findCosmoApp / findDeployUrl из integrations/cosmoportLadderMock.ts).
 */
import { useMemo, useState } from 'react';
import { Badge, Select, Space, Tooltip, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { MOCK_COSMO_APPS, findDeployUrl } from '../integrations/cosmoportLadderMock';

export interface StudioPresetBarProps {
  onSelectPreset?: (appCode: string, env: string, deployUrl: string) => void;
}

export function StudioPresetBar({ onSelectPreset }: StudioPresetBarProps): React.JSX.Element {
  const [selectedAppCode, setSelectedAppCode] = useState<string>('pk-core');
  const [selectedEnv, setSelectedEnv] = useState<string>('dev');

  const currentDeployUrl = useMemo(() => {
    return findDeployUrl(selectedAppCode, selectedEnv) || '';
  }, [selectedAppCode, selectedEnv]);

  const appOptions = useMemo(() => {
    return MOCK_COSMO_APPS.map((app) => ({
      value: app.appCode,
      label: `${app.name} (${app.appCode})`,
    }));
  }, []);

  const envOptions = useMemo(() => {
    const app = MOCK_COSMO_APPS.find((a) => a.appCode === selectedAppCode);
    if (!app || app.builds.length === 0) {
      return [
        { value: 'dev', label: 'DEV' },
        { value: 'test', label: 'TEST' },
        { value: 'stage', label: 'STAGE' },
        { value: 'prod', label: 'PROD' },
      ];
    }
    const envs = new Set<string>();
    for (const b of app.builds) {
      for (const d of b.deploys) {
        envs.add(d.env);
      }
    }
    return Array.from(envs).map((env) => ({
      value: env,
      label: env.toUpperCase(),
    }));
  }, [selectedAppCode]);

  const handleAppChange = (val: string) => {
    setSelectedAppCode(val);
    const newApp = MOCK_COSMO_APPS.find((a) => a.appCode === val);
    const firstEnv = newApp?.builds[0]?.deploys[0]?.env || 'dev';
    setSelectedEnv(firstEnv);
    const url = findDeployUrl(val, firstEnv) || '';
    onSelectPreset?.(val, firstEnv, url);
  };

  const handleEnvChange = (val: string) => {
    setSelectedEnv(val);
    const url = findDeployUrl(selectedAppCode, val) || '';
    onSelectPreset?.(selectedAppCode, val, url);
  };

  return (
    <div
      className="pk-studio-preset-bar"
      data-testid="studio-preset-bar"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        height: 28,
        background: 'var(--pk-surface-muted, rgba(255, 255, 255, 0.04))',
        borderRadius: 5,
        border: '1px solid var(--pk-border, rgba(255, 255, 255, 0.12))',
      }}
    >
      <GlobalOutlined style={{ color: 'var(--pk-accent, #8ab4f8)', fontSize: 13 }} />
      <Select
        size="small"
        value={selectedAppCode}
        options={appOptions}
        onChange={handleAppChange}
        popupMatchSelectWidth={false}
        variant="borderless"
        style={{ width: 130, fontSize: 12 }}
        data-testid="studio-preset-app-select"
      />
      <span style={{ color: 'var(--pk-text-secondary, #9aa0a6)', opacity: 0.5 }}>/</span>
      <Select
        size="small"
        value={selectedEnv}
        options={envOptions}
        onChange={handleEnvChange}
        popupMatchSelectWidth={false}
        variant="borderless"
        style={{ width: 75, fontSize: 12 }}
        data-testid="studio-preset-env-select"
      />
      <Tooltip title={currentDeployUrl ? `Целевой URL: ${currentDeployUrl}` : 'URL не найден'}>
        <Space size={4} style={{ cursor: 'help' }}>
          <Badge status={currentDeployUrl ? 'success' : 'warning'} />
          <Typography.Text
            style={{
              fontSize: 11,
              maxWidth: 160,
              fontFamily: 'var(--pk-font-mono, "JetBrains Mono", monospace)',
              color: 'var(--pk-text-secondary, #9aa0a6)',
            }}
            ellipsis
            data-testid="studio-preset-url-display"
          >
            {currentDeployUrl || '—'}
          </Typography.Text>
        </Space>
      </Tooltip>
    </div>
  );
}
