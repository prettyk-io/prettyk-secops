import { describe, it, expect } from 'vitest';
import { findCosmoApp, findDeployUrl, MOCK_COSMO_APPS } from './cosmoportLadderMock';

describe('cosmoportLadderMock', () => {
  it('findCosmoApp locates existing app by appCode case-insensitively', () => {
    const app = findCosmoApp('pk-CORE');
    expect(app).toBeDefined();
    expect(app?.id).toBe('app-1');
    expect(app?.name).toBe('PrettyK Core Gateway');
  });

  it('findCosmoApp returns undefined for unknown appCode', () => {
    expect(findCosmoApp('non-existent')).toBeUndefined();
  });

  it('findDeployUrl returns matching deploy URL for app and environment', () => {
    const urlDev = findDeployUrl('pk-core', 'dev');
    expect(urlDev).toBe('http://dev.pk.local:3000');

    const urlTest = findDeployUrl('pk-core', 'test');
    expect(urlTest).toBe('http://test.pk.local:3000');
  });

  it('findDeployUrl returns undefined if environment or app not found', () => {
    expect(findDeployUrl('pk-core', 'prod')).toBeUndefined();
    expect(findDeployUrl('unknown', 'dev')).toBeUndefined();
  });
});
