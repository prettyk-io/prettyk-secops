import { describe, expect, it } from 'vitest';
import { resolveOpenApiSpecTarget } from './openapiSpecTarget';

describe('resolveOpenApiSpecTarget', () => {
  it('resource mode requires path', () => {
    expect(
      resolveOpenApiSpecTarget({
        specMode: 'resource',
        specAs: 'spec1',
        specPathRel: '',
        selectedPath: '',
        attackBaseUrl: 'https://x.test',
      }),
    ).toEqual({ ok: false, error: 'У ресурса пустой path' });
  });

  it('joins relative path to attack base', () => {
    expect(
      resolveOpenApiSpecTarget({
        specMode: 'url_relative',
        specAs: '',
        specPathRel: 'openapi.json',
        selectedPath: '',
        attackBaseUrl: 'https://x.test/',
      }),
    ).toEqual({ ok: true, spec: 'https://x.test/openapi.json' });
  });
});
