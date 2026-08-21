import { describe, expect, it } from 'vitest';
import { readSecurityStrings } from './appSecurityContext';

describe('appSecurityContext', () => {
  it('reads infrastructure first, then legacy security_configuration', () => {
    expect(readSecurityStrings(null)).toEqual({ allowedExtraDomains: '', baseUrl: '' });
    expect(
      readSecurityStrings({
        infrastructure: {
          allowed_extra_domains: 'infra.com',
          base_url_override: 'https://infra.test',
        },
        security_configuration: {
          allowed_extra_domains: 'sec.com',
          base_url_override: 'https://sec.test',
        },
      }),
    ).toEqual({ allowedExtraDomains: 'infra.com', baseUrl: 'https://infra.test' });
    expect(
      readSecurityStrings({
        security_configuration: {
          allowed_extra_domains: 'a.com',
          base_url_override: 'https://b.test',
        },
      }),
    ).toEqual({ allowedExtraDomains: 'a.com', baseUrl: 'https://b.test' });
  });
});
