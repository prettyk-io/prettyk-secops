/**
 * ADM-VIS: единый язык Gate / Verdict Tag (assortment V1/V4).
 */

export type GateTone = 'pass' | 'watch' | 'fail' | 'unknown';

export function toneFromVerdict(raw: string | undefined | null): GateTone {
  const v = (raw || '').toLowerCase();
  if (!v || v === '—' || v === 'unknown') return 'unknown';
  if (v.includes('fail')) return 'fail';
  if (v.includes('watch') || v.includes('warn') || v.includes('unstable')) return 'watch';
  if (v.includes('pass') || v === 'success' || v === 'ok') return 'pass';
  return 'unknown';
}

export function gateTagColor(tone: GateTone): string {
  if (tone === 'pass') return 'success';
  if (tone === 'watch') return 'warning';
  if (tone === 'fail') return 'error';
  return 'default';
}

export function gateLabel(tone: GateTone): string {
  if (tone === 'pass') return 'PASS';
  if (tone === 'watch') return 'WATCH';
  if (tone === 'fail') return 'FAIL';
  return '—';
}

/** Portfolio hero: FAIL > WATCH > PASS > empty. */
export function portfolioHeroTone(input: {
  gate_fail: number;
  gate_watch: number;
  gate_pass: number;
}): GateTone {
  if (input.gate_fail > 0) return 'fail';
  if (input.gate_watch > 0) return 'watch';
  if (input.gate_pass > 0) return 'pass';
  return 'unknown';
}

export function portfolioHeroHint(tone: GateTone): string {
  if (tone === 'pass') return 'Состояние проверок в норме';
  if (tone === 'watch') return 'Есть запуски, требующие внимания';
  if (tone === 'fail') return 'Есть провалы по гейтам';
  return 'Нет данных по гейтам портфеля';
}
