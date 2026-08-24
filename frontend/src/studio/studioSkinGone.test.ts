/**
 * Guard: Canvas Skin Lab выпилен целиком.
 * Частичный cut (state без JSX / JSX без import) роняет Editor ReferenceError.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN =
  /CanvasSkin|canvasSkins|canvasLab|showCanvasLab|isCanvasLab|setCanvasLab|Скины|pk-canvas-skin|pk-studio-canvas-lab/u;

describe('Canvas Skin Lab removed', () => {
  it('StudioWorkspace / setup / styles без хвостов скинов', () => {
    const files = [
      join(here, 'StudioWorkspace.tsx'),
      join(here, '../monaco/setup.ts'),
      join(here, '../styles.css'),
    ];
    for (const path of files) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toMatch(FORBIDDEN);
    }
  });

  it('модули lab не лежат на диске', () => {
    const gone = [
      join(here, 'CanvasSkinLab.tsx'),
      join(here, 'CanvasSkinLab.test.tsx'),
      join(here, '../theme/canvasSkins.ts'),
      join(here, '../theme/canvasSkins.test.ts'),
    ];
    for (const path of gone) {
      expect(() => readFileSync(path), path).toThrow();
    }
  });
});
