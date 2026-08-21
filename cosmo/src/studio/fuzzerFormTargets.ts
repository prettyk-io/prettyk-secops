/**
 * Target-row helpers for FuzzerForm (S3776).
 */
import {
  emptyFuzzTarget,
  parsePasteTargets,
  type FuzzTargetFields,
} from './studioFuzzers';

export function updateFuzzerTargetRow(
  targets: FuzzTargetFields[],
  index: number,
  field: keyof FuzzTargetFields,
  val: string,
): FuzzTargetFields[] {
  return targets.map((row, i) => {
    if (i === index) {
      return { ...row, [field]: val };
    }
    return row;
  });
}

export function addFuzzerTargetRow(targets: FuzzTargetFields[]): FuzzTargetFields[] {
  return [...targets, emptyFuzzTarget()];
}

export function removeFuzzerTargetRow(
  targets: FuzzTargetFields[],
  index: number,
): FuzzTargetFields[] | undefined {
  if (targets.length <= 1) {
    return undefined;
  }
  return targets.filter((_, i) => i !== index);
}

export type ApplyPasteTargetsResult =
  | { ok: true; targets: FuzzTargetFields[] }
  | { ok: false; error: string };

export function applyPasteTargetsText(pasteText: string): ApplyPasteTargetsResult {
  const { targets: parsed, errors } = parsePasteTargets(pasteText);
  if (parsed.length === 0) {
    return {
      ok: false,
      error: errors.length > 0 ? errors.join('; ') : 'Нет валидных строк для вставки',
    };
  }
  return { ok: true, targets: parsed };
}
