import { describe, expect, it } from 'vitest';
import { appendHarImportSeed, buildHarImportSeedLines } from './seedHarImport';

describe('seedHarImport', () => {
  it('builds ВыполнитьЦепь / СканированиеЦепи lines', () => {
    expect(
      buildHarImportSeedLines({
        as: 'checkout',
        withSequenceScan: true,
      }),
    ).toEqual(['СканированиеЦепи checkout']);
    expect(buildHarImportSeedLines({ as: 'checkout' })).toEqual([
      'ВыполнитьЦепь checkout',
    ]);
  });

  it('appends without duplicate', () => {
    const seed = 'ВыполнитьЦепь checkout';
    const once = appendHarImportSeed('', seed);
    expect(once).toContain(seed);
    expect(appendHarImportSeed(once, seed)).toBe(once);
  });
});
