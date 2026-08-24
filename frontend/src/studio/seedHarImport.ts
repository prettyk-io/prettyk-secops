/**
 * PrettyK seed: ВыполнитьЦепь (play) / СканированиеЦепи (удар).
 */

export function buildHarImportSeedLines(args: {
  as: string;
  path?: string;
  withSequenceScan?: boolean;
  /** module id Цепь; default = as */
  moduleId?: string;
}): string[] {
  const id = (args.moduleId || args.as).trim();
  if (!id) {
    return [];
  }
  if (args.withSequenceScan) {
    return [`СканированиеЦепи ${id}`];
  }
  return [`ВыполнитьЦепь ${id}`];
}

export function appendHarImportSeed(existing: string, seedBlock: string): string {
  const seed = seedBlock.trim();
  if (!seed) {
    return existing;
  }
  const base = existing.trimEnd();
  if (!base.trim()) {
    return `${seed}\n`;
  }
  if (base.includes(seed.split('\n')[0] ?? seed)) {
    return existing;
  }
  return `${base}\n${seed}\n`;
}
