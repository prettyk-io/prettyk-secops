/**
 * Regression: suiteMode=off early return must stay AFTER every React hook.
 * App прогревает Studio (~1.2s); смена на «Ручная проверка» → fewer hooks crash.
 *
 * Не монтируем StudioWorkspace (monaco/бандл) — ловим порядок в исходнике.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcPath = join(dirname(fileURLToPath(import.meta.url)), 'StudioWorkspace.tsx');

describe('StudioWorkspace manual hooks order', () => {
  it('нет use* после early return suiteMode=off', () => {
    const src = readFileSync(srcPath, 'utf8');
    const innerStart = src.indexOf('function StudioWorkspaceInner');
    expect(innerStart).toBeGreaterThan(-1);
    const body = src.slice(innerStart);
    // Именно early return UI, не `if (suiteMode === 'off') return;` внутри useEffect.
    const offReturn = body.search(
      /if\s*\(\s*suiteMode\s*===\s*['"]off['"]\s*\)\s*\{\s*return\s*\(/,
    );
    expect(offReturn).toBeGreaterThan(-1);
    const afterOff = body.slice(offReturn);
    const hookAfter = afterOff.match(
      /\buse(?:State|Effect|Memo|Callback|LayoutEffect|Ref|DeferredValue|Id|Context|SyncExternalStore)\s*\(/,
    );
    expect(hookAfter).toBeNull();
  });
});
