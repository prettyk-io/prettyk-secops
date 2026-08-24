/**
 * Подгон кегля так, чтобы ink-ширина текста ≈ targetWidth (CSS px).
 * Skeleton SoT: titleText width = entry button width — меряем Range, не width блока.
 */

export function measureTextInkWidth(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

export function fitFontSizeToWidth(
  el: HTMLElement,
  targetWidth: number,
  opts?: { minPx?: number; maxPx?: number; iterations?: number },
): number {
  const minPx = opts?.minPx ?? 12;
  const maxPx = opts?.maxPx ?? 56;
  const iterations = opts?.iterations ?? 14;
  if (targetWidth <= 0) {
    return minPx;
  }
  let lo = minPx;
  let hi = maxPx;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    const w = measureTextInkWidth(el);
    if (w < targetWidth) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  el.style.fontSize = `${lo}px`;
  return lo;
}

/** Целевая ink-ширина = ширина кнопок entry (выравнивание с рядом ниже). */
export function titleTargetWidth(entryWidth: number, ratio = 1): number {
  return entryWidth * ratio;
}
