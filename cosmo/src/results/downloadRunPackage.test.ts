// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadRunPackage } from './downloadRunPackage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadRunPackage', () => {
  it('downloads zip blob via anchor', async () => {
    const blob = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
      type: 'application/zip',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => blob,
        headers: {
          get: (name: string) =>
            name === 'Content-Disposition'
              ? 'attachment; filename="demo-package.zip"'
              : null,
        },
      }),
    );
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => {
        const el = node as HTMLAnchorElement;
        el.click = click;
        el.remove = remove;
        return node;
      });
    vi.stubGlobal(
      'URL',
      {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn(),
      } as unknown as typeof URL,
    );

    const result = await downloadRunPackage();
    expect(result).toEqual({ ok: true, filename: 'demo-package.zip' });
    expect(click).toHaveBeenCalled();
    appendChild.mockRestore();
  });

  it('maps HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'package build failed: x' }),
        headers: { get: () => null },
      }),
    );
    const result = await downloadRunPackage();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('package build failed');
    }
  });
});
