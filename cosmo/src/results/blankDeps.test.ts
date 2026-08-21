/**
 * Ловит регресс: blankHtml импортирует marked, а в node_modules/package.json его нет
 * (типичный косяк после ветки без бланков → spaceport без npm install).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(frontendRoot, 'package.json'));

describe('blank export deps', () => {
  it('marked указан прямой зависимостью frontend/package.json', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.marked, 'marked must be in dependencies').toMatch(/^\^?14\./);
  });

  it('marked резолвится из frontend (node_modules)', () => {
    expect(() => require.resolve('marked')).not.toThrow();
  });

  it('import("marked") отдаёт parser', async () => {
    const mod = await import('marked');
    expect(typeof mod.marked.parse).toBe('function');
  });
});
