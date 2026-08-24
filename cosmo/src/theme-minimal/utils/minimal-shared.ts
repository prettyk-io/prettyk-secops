/**
 * Local reimplementation of minimal-shared/utils for self-contained theme-minimal.
 * Replaces: varAlpha, createPaletteChannel, pxToRem, setFont, remToPx, parseCssVar, noRtlFlip.
 */

// ----------------------------------------------------------------------
// varAlpha — converts hex color to rgba with specified alpha
// ----------------------------------------------------------------------
export function varAlpha(hex: string | undefined, alpha: number): string {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ----------------------------------------------------------------------
// toChannel — converts hex color to MUI channel format "R G B"
// ----------------------------------------------------------------------
function toChannel(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export const hexToRgbChannel = toChannel;

// ----------------------------------------------------------------------
// createPaletteChannel — generic: adds `-Channel` properties to any object
// with hex-like string values. Works with PaletteColor, grey tones, common colors.
// ----------------------------------------------------------------------
export function createPaletteChannel<T extends Record<string, string>>(color: T): T & { [K in keyof T as `${string & K}Channel`]: string } {
  const channels = {} as Record<string, string>;
  for (const [key, value] of Object.entries(color)) {
    if (typeof value === 'string' && value.startsWith('#')) {
      channels[`${key}Channel`] = toChannel(value);
    }
  }
  return { ...color, ...channels } as any;
}

// ----------------------------------------------------------------------
// pxToRem — converts pixel value to rem units (base 16px)
// ----------------------------------------------------------------------
export function pxToRem(px: number): string {
  return `${px / 16}rem`;
}

// ----------------------------------------------------------------------
// remToPx — converts rem string to pixel number
// ----------------------------------------------------------------------
export function remToPx(rem: string | number): number {
  if (typeof rem === 'number') return rem;
  return parseFloat(rem) * 16;
}

// ----------------------------------------------------------------------
// parseCssVar — extracts CSS variable reference from theme token
// e.g. `theme.vars.palette.Tooltip.bg` → `--Tooltip-bg`
// ----------------------------------------------------------------------
export function parseCssVar(cssVar: string): string {
  if (cssVar.startsWith('var(')) {
    return cssVar.replace(/^var\((.+)\)$/, '$1').trim();
  }
  return cssVar;
}

// ----------------------------------------------------------------------
// noRtlFlip — returns the same string; RTL flipping not needed for PrettyK
// Minimal uses this for RTL-aware background-position flipping
// ----------------------------------------------------------------------
export function noRtlFlip(value: string): string {
  return value;
}

// ----------------------------------------------------------------------
// setFont — creates a CSS font-family string
// ----------------------------------------------------------------------
export function setFont(family: string): string {
  return `${family}, "Golos UI", "Golos Text", "Segoe UI", system-ui, -apple-system, sans-serif`;
}