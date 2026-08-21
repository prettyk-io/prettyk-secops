import { describe, expect, it } from 'vitest';
import { collectVariables } from './variables';

describe('collectVariables', () => {
  it('подхватывает imports[].as для PrettyK', () => {
    const names = collectVariables({
      test_suites: {
        imports: [
          { as: 'urls', path: 'resources/urls.txt', kind: 'data_file' },
          { as: 'bad-name', path: 'resources/x.txt', kind: 'data_file' },
        ],
        scenarios: [
          {
            steps: [{ save_as: 'token', constructor: 'Пусть ${user.email} = "a"' }],
          },
        ],
      },
    });
    expect(names).toContain('urls');
    expect(names).toContain('token');
    expect(names).toContain('user');
    expect(names).not.toContain('bad-name');
  });
});
