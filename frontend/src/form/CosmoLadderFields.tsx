/**
 * COS-F1 — CosmoLadderFields: каскадные Select'ы app → build → deploy → URL.
 *
 * Три каскадных `<Select>`:
 * 1. Выбор приложения (из API `GET /api/cosmo/ladder`)
 * 2. Выбор сборки (builds[])
 * 3. Выбор деплоя → URL автозаполнен
 *
 * Интеграция с формой запуска: подстановка `project_id`, `base_url_override`.
 */
import { useState, useCallback, useMemo } from 'react';
import { Select, Typography, Space } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { CosmoApp, CosmoBuild, CosmoDeploy } from '../integrations/cosmoportLadderMock';
import { MOCK_COSMO_APPS } from '../integrations/cosmoportLadderMock';

export interface LadderSelection {
  app: CosmoApp | null;
  build: CosmoBuild | null;
  deploy: CosmoDeploy | null;
}

export interface CosmoLadderFieldsProps {
  /** Колбэк при изменении выбора; передаёт полную цепочку + URL. */
  onChange?: (sel: LadderSelection, deployUrl: string | null) => void;
  /** Отключить все Select'ы. */
  disabled?: boolean;
  /** Размер Select'ов (Ant). */
  size?: 'small' | 'middle' | 'large';
}

export function CosmoLadderFields({
  onChange,
  disabled = false,
  size = 'middle',
}: CosmoLadderFieldsProps) {
  const [selectedApp, setSelectedApp] = useState<string | undefined>();
  const [selectedBuild, setSelectedBuild] = useState<string | undefined>();
  const [selectedDeploy, setSelectedDeploy] = useState<string | undefined>();

  const apps = MOCK_COSMO_APPS;

  const appOptions = useMemo(
    () => apps.map((a) => ({ value: a.appCode, label: a.name })),
    [apps],
  );

  const currentApp = useMemo(
    () => apps.find((a) => a.appCode === selectedApp) ?? null,
    [apps, selectedApp],
  );

  const buildOptions = useMemo(() => {
    if (!currentApp) return [];
    return currentApp.builds.map((b) => ({
      value: b.id,
      label: `${b.buildNumber} (${b.commitHash.slice(0, 7)})`,
    }));
  }, [currentApp]);

  const currentBuild = useMemo(
    () => currentApp?.builds.find((b) => b.id === selectedBuild) ?? null,
    [currentApp, selectedBuild],
  );

  const deployOptions = useMemo(() => {
    if (!currentBuild) return [];
    return currentBuild.deploys.map((d) => ({
      value: d.id,
      label: `${d.env.toUpperCase()} — ${d.deployUrl}`,
    }));
  }, [currentBuild]);

  const currentDeploy = useMemo(
    () => currentBuild?.deploys.find((d) => d.id === selectedDeploy) ?? null,
    [currentBuild, selectedDeploy],
  );

  const deployUrl = currentDeploy?.deployUrl ?? null;

  const handleAppChange = useCallback(
    (val: string) => {
      setSelectedApp(val);
      setSelectedBuild(undefined);
      setSelectedDeploy(undefined);
      // deferred fire after state settles
      setTimeout(() => {
        const app = apps.find((a) => a.appCode === val) ?? null;
        onChange?.({ app, build: null, deploy: null }, null);
      }, 0);
    },
    [apps, onChange],
  );

  const handleBuildChange = useCallback(
    (val: string) => {
      setSelectedBuild(val);
      setSelectedDeploy(undefined);
      setTimeout(() => {
        const build = currentApp?.builds.find((b) => b.id === val) ?? null;
        onChange?.({ app: currentApp, build, deploy: null }, null);
      }, 0);
    },
    [currentApp, onChange],
  );

  const handleDeployChange = useCallback(
    (val: string) => {
      setSelectedDeploy(val);
      setTimeout(() => {
        const deploy = currentBuild?.deploys.find((d) => d.id === val) ?? null;
        onChange?.({ app: currentApp, build: currentBuild, deploy }, deploy?.deployUrl ?? null);
      }, 0);
    },
    [currentBuild, currentApp, onChange],
  );

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Приложение
        </Typography.Text>
        <Select
          value={selectedApp}
          onChange={handleAppChange}
          options={appOptions}
          placeholder="Выберите приложение"
          disabled={disabled}
          size={size}
          style={{ width: '100%' }}
          allowClear
        />
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Сборка
        </Typography.Text>
        <Select
          value={selectedBuild}
          onChange={handleBuildChange}
          options={buildOptions}
          placeholder={selectedApp ? 'Выберите сборку' : 'Сначала выберите приложение'}
          disabled={disabled || !selectedApp}
          size={size}
          style={{ width: '100%' }}
          allowClear
          notFoundContent="Нет сборок"
        />
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Деплой
        </Typography.Text>
        <Select
          value={selectedDeploy}
          onChange={handleDeployChange}
          options={deployOptions}
          placeholder={selectedBuild ? 'Выберите деплой' : 'Сначала выберите сборку'}
          disabled={disabled || !selectedBuild}
          size={size}
          style={{ width: '100%' }}
          allowClear
          notFoundContent="Нет деплоев"
        />
      </div>

      {deployUrl && (
        <div
          style={{
            padding: '6px 8px',
            background: 'rgba(34, 211, 238, 0.08)',
            border: '1px solid rgba(34, 211, 238, 0.2)',
            borderRadius: 6,
          }}
        >
          <LinkOutlined style={{ color: '#22d3ee', marginRight: 6, fontSize: 12 }} />
          <Typography.Text
            code
            style={{ fontSize: 11, color: '#22d3ee' }}
            copyable
          >
            {deployUrl}
          </Typography.Text>
        </div>
      )}
    </Space>
  );
}