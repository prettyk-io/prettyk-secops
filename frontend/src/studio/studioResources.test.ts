import { describe, expect, it } from 'vitest';
import {
  addResource,
  normalizeImport,
  removeResource,
  renameResource,
  resourceAsError,
  resourceDisplayName,
  resourcePathForAs,
  sanitizeFilenameToAs,
  updateResource,
} from './studioResources';

describe('studioResources', () => {
  it('создаёт импорт с path resources/{as}.txt', () => {
    const added = addResource({}, 'users')!;
    const imports = (added.data as { test_suites: { imports: unknown[] } }).test_suites.imports;
    expect(imports).toHaveLength(1);
    expect(normalizeImport(imports[0])).toEqual({
      path: 'resources/users.txt',
      kind: 'data_file',
      as: 'users',
    });
    expect(resourceDisplayName(normalizeImport(imports[0]), 0)).toBe('users');
  });

  it('отклоняет кириллицу и пустой as', () => {
    expect(resourceAsError('')).toBeTruthy();
    expect(resourceAsError('urls-файл')).toBeTruthy();
    expect(resourceAsError('urls')).toBeUndefined();
    expect(addResource({}, 'список')).toBeUndefined();
  });

  it('sanitize имени файла → as', () => {
    expect(sanitizeFilenameToAs('urls.txt')).toBe('urls');
    expect(sanitizeFilenameToAs('my-urls.csv')).toBe('my_urls');
    expect(sanitizeFilenameToAs('1data.txt')).toBe('r_1data');
    expect(resourcePathForAs('urls')).toBe('resources/urls.txt');
    expect(resourcePathForAs('checkout', 'har_file')).toBe('resources/checkout.har');
  });

  it('создаёт har_file sidecar', () => {
    const added = addResource({}, 'checkout', 'har_file')!;
    expect(normalizeImport(
      (added.data as { test_suites: { imports: unknown[] } }).test_suites.imports[0],
    )).toEqual({
      path: 'resources/checkout.har',
      kind: 'har_file',
      as: 'checkout',
    });
  });

  it('создаёт proto_pack sidecar', () => {
    const added = addResource({}, 'bank_proto', 'proto_pack')!;
    expect(normalizeImport(
      (added.data as { test_suites: { imports: unknown[] } }).test_suites.imports[0],
    )).toEqual({
      path: 'resources/bank_proto.zip',
      kind: 'proto_pack',
      as: 'bank_proto',
    });
    expect(resourcePathForAs('bank_proto', 'proto_pack')).toBe('resources/bank_proto.zip');
  });

  it('создаёт openapi_spec и graphql_sdl sidecar', () => {
    const oas = addResource({}, 'bank_oas', 'openapi_spec')!;
    expect(normalizeImport(
      (oas.data as { test_suites: { imports: unknown[] } }).test_suites.imports[0],
    )).toEqual({
      path: 'resources/bank_oas.json',
      kind: 'openapi_spec',
      as: 'bank_oas',
    });
    const gql = addResource(oas.data, 'bank_sdl', 'graphql_sdl')!;
    expect(normalizeImport(
      (gql.data as { test_suites: { imports: unknown[] } }).test_suites.imports[1],
    )).toEqual({
      path: 'resources/bank_sdl.graphql',
      kind: 'graphql_sdl',
      as: 'bank_sdl',
    });
  });

  it('обновляет kind и переименовывает as с path', () => {
    const added = addResource({}, 'x')!;
    const patched = updateResource(added.data, 0, {
      kind: 'data_file',
    })!;
    const renamed = renameResource(patched, 0, 'streamA') as {
      test_suites: { imports: unknown[] };
    };
    expect(normalizeImport(renamed.test_suites.imports[0])).toEqual({
      path: 'resources/streamA.txt',
      kind: 'data_file',
      as: 'streamA',
    });
    const removed = removeResource(renamed, 0) as { test_suites: { imports: unknown[] } };
    expect(removed.test_suites.imports).toEqual([]);
  });

  it('не даёт дублировать as', () => {
    const a = addResource({}, 'urls')!;
    expect(addResource(a.data, 'urls')).toBeUndefined();
  });

  it('scenario_json при чтении → data_file', () => {
    expect(
      normalizeImport({
        path: 'resources/legacy.json',
        kind: 'scenario_json',
        as: 'legacy',
      }),
    ).toEqual({
      path: 'resources/legacy.json',
      kind: 'data_file',
      as: 'legacy',
    });
  });
});
