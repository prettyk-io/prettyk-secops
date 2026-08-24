/**
 * SALV-4: Cosmo Ladder Mock & Resolver (cosmo-custom integration).
 * Изолированный слой для работы с иерархией App -> Build -> Deploy.
 */

export interface CosmoApp {
  id: string;
  appCode: string;
  name: string;
  builds: CosmoBuild[];
}

export interface CosmoBuild {
  id: string;
  buildNumber: string;
  commitHash: string;
  createdAt: string;
  deploys: CosmoDeploy[];
}

export interface CosmoDeploy {
  id: string;
  env: 'dev' | 'test' | 'stage' | 'prod';
  deployUrl: string;
  deployedAt: string;
}

export const MOCK_COSMO_APPS: CosmoApp[] = [
  {
    id: 'app-1',
    appCode: 'pk-core',
    name: 'PrettyK Core Gateway',
    builds: [
      {
        id: 'b-101',
        buildNumber: 'v1.4.0-rc1',
        commitHash: 'a1b2c3d',
        createdAt: '2026-08-16T10:00:00Z',
        deploys: [
          { id: 'd-1', env: 'dev', deployUrl: 'http://dev.pk.local:3000', deployedAt: '2026-08-16T10:15:00Z' },
          { id: 'd-2', env: 'test', deployUrl: 'http://test.pk.local:3000', deployedAt: '2026-08-16T10:30:00Z' },
        ],
      },
    ],
  },
  {
    id: 'app-2',
    appCode: 'payment-hub',
    name: 'Payment Processing Hub',
    builds: [
      {
        id: 'b-201',
        buildNumber: 'v2.1.0',
        commitHash: 'e5f6g7h',
        createdAt: '2026-08-15T14:00:00Z',
        deploys: [
          { id: 'd-3', env: 'stage', deployUrl: 'http://stage.payments.local', deployedAt: '2026-08-15T14:30:00Z' },
        ],
      },
    ],
  },
];

export function findCosmoApp(appCode: string): CosmoApp | undefined {
  return MOCK_COSMO_APPS.find((a) => a.appCode.toLowerCase() === (appCode || '').toLowerCase());
}

export function findDeployUrl(appCode: string, env: string): string | undefined {
  const app = findCosmoApp(appCode);
  if (!app) return undefined;
  for (const b of app.builds) {
    const d = b.deploys.find((dep) => dep.env.toLowerCase() === env.toLowerCase());
    if (d) return d.deployUrl;
  }
  return undefined;
}
