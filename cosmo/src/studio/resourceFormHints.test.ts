import { describe, expect, it } from 'vitest';
import {
  resourceAsHint,
  resourceContentFooter,
  resourceContentLabel,
  resourceContentPlaceholder,
} from './resourceFormHints';

describe('resourceFormHints', () => {
  it('as hint по kind', () => {
    expect(resourceAsHint('har_file', 'checkout')).toContain('checkout');
    expect(resourceAsHint('proto_pack', '')).toContain('bank_proto');
    expect(resourceAsHint('openapi_spec', 'oas')).toContain('spec_as');
    expect(resourceAsHint('graphql_sdl', '')).toContain('bank_sdl');
    expect(resourceAsHint('data_file', 'urls')).toContain('${urls}');
  });

  it('content label/placeholder/footer', () => {
    expect(resourceContentLabel('har_file')).toMatch(/HAR/);
    expect(resourceContentPlaceholder('data_file')).toMatch(/\.txt/);
    expect(resourceContentFooter('data_file', '')).toMatch(/Пусто/);
    expect(resourceContentFooter('har_file', 'abc')).toMatch(/3 символов/);
    expect(resourceContentFooter('data_file', 'a\nb')).toMatch(/2 строк/);
  });
});
