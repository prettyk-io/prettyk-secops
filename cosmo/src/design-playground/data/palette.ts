import {
  DARK_PACK,
  LIGHT_PACK,
  NEON_PACK,
  AURORA_PACK,
  DENSE_PACK,
  WARM_PACK,
  DARK_CHROME,
  LIGHT_CHROME,
  NEON_CHROME,
  AURORA_CHROME,
  DENSE_CHROME,
  WARM_CHROME,
  type PkTokenPack,
  type PkChromeExtras,
} from '../../theme/tokens';

export interface PaletteEntry {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  pack: PkTokenPack;
  chrome: PkChromeExtras;
}

export const PALETTES: PaletteEntry[] = [
  { id: 'dark', label: 'Dark Midnight (Current)', mode: 'dark', pack: DARK_PACK, chrome: DARK_CHROME },
  { id: 'neon', label: 'Neon Cyberpunk', mode: 'dark', pack: NEON_PACK, chrome: NEON_CHROME },
  { id: 'aurora', label: 'Aurora Graphite', mode: 'dark', pack: AURORA_PACK, chrome: AURORA_CHROME },
  { id: 'dense', label: 'Dense Enterprise', mode: 'dark', pack: DENSE_PACK, chrome: DENSE_CHROME },
  { id: 'warm', label: 'Warm Premium', mode: 'dark', pack: WARM_PACK, chrome: WARM_CHROME },
  { id: 'light', label: 'Light Studio', mode: 'light', pack: LIGHT_PACK, chrome: LIGHT_CHROME },
];

export interface BrandGradient {
  id: string;
  name: string;
  gradient: string;
  description: string;
  stops: { color: string; label: string }[];
}

export const BRAND_GRADIENTS: BrandGradient[] = [
  {
    id: 'master',
    name: 'Brand Master Gradient (Current)',
    gradient: 'linear-gradient(135deg, #38BDF8 0%, #7A1FA2 50%, #522E90 100%)',
    description: 'Electric Ice Blue → Vibrant Violet → Dark Indigo. Signature gradient for PrettyK.',
    stops: [
      { color: '#38BDF8', label: 'Electric Ice Blue 0%' },
      { color: '#7A1FA2', label: 'Vibrant Violet 50%' },
      { color: '#522E90', label: 'Dark Indigo 100%' },
    ],
  },
  {
    id: 'electric-neon',
    name: 'Electric Cyber Neon',
    gradient: 'linear-gradient(135deg, #00F0FF 0%, #7C4DFF 100%)',
    description: 'Cyber Cyan → Ultra Violet. High-energy accent neon for badges and glows.',
    stops: [
      { color: '#00F0FF', label: 'Cyber Cyan 0%' },
      { color: '#7C4DFF', label: 'Ultra Violet 100%' },
    ],
  },
  {
    id: 'secops-shield',
    name: 'SecOps Shield (Passing / Live)',
    gradient: 'linear-gradient(135deg, #2EE6A8 0%, #38BDF8 100%)',
    description: 'Emerald Safe → Electric Cyan. Passing verification status.',
    stops: [
      { color: '#2EE6A8', label: 'Emerald Safe 0%' },
      { color: '#38BDF8', label: 'Electric Cyan 100%' },
    ],
  },
  {
    id: 'threat-critical',
    name: 'Threat Critical (High Severity)',
    gradient: 'linear-gradient(135deg, #FFB020 0%, #FF4D6D 100%)',
    description: 'Warning Amber → Critical Crimson. Critical severity vulnerability indicator.',
    stops: [
      { color: '#FFB020', label: 'Warning Amber 0%' },
      { color: '#FF4D6D', label: 'Critical Crimson 100%' },
    ],
  },
  {
    id: 'midnight-space',
    name: 'Midnight Deep Canvas',
    gradient: 'linear-gradient(180deg, #080C16 0%, #0F1626 50%, #121A2C 100%)',
    description: 'Deep spatial canvas and panel depth background.',
    stops: [
      { color: '#080C16', label: 'Canvas 0%' },
      { color: '#0F1626', label: 'Panels 50%' },
      { color: '#121A2C', label: 'Cards 100%' },
    ],
  },
];

export interface ThreatStatusToken {
  id: string;
  name: string;
  hex: string;
  bgRgba: string;
  borderRgba: string;
  level: string;
  description: string;
}

export const THREAT_TOKENS: ThreatStatusToken[] = [
  {
    id: 'critical',
    name: 'Critical / Fatal',
    hex: '#F85149',
    bgRgba: 'rgba(248, 81, 73, 0.15)',
    borderRgba: 'rgba(248, 81, 73, 0.45)',
    level: 'CRITICAL',
    description: 'RCE, SQLi, Auth Bypass, full administrative takeover',
  },
  {
    id: 'high',
    name: 'High Severity',
    hex: '#FF4D6D',
    bgRgba: 'rgba(255, 77, 109, 0.15)',
    borderRgba: 'rgba(255, 77, 109, 0.45)',
    level: 'HIGH',
    description: 'Stored XSS, SSRF, IDOR with sensitive data exfiltration',
  },
  {
    id: 'medium',
    name: 'Medium / Warning',
    hex: '#D8A13A',
    bgRgba: 'rgba(216, 161, 58, 0.15)',
    borderRgba: 'rgba(216, 161, 58, 0.45)',
    level: 'MEDIUM',
    description: 'CORS misconfiguration, CSRF, weak authentication policies',
  },
  {
    id: 'low',
    name: 'Low / Notice',
    hex: '#38BDF8',
    bgRgba: 'rgba(56, 189, 248, 0.15)',
    borderRgba: 'rgba(56, 189, 248, 0.45)',
    level: 'LOW',
    description: 'Server tokens leak, missing CSP or HSTS headers',
  },
  {
    id: 'safe',
    name: 'Safe / Passed',
    hex: '#3FB27F',
    bgRgba: 'rgba(63, 178, 127, 0.15)',
    borderRgba: 'rgba(63, 178, 127, 0.45)',
    level: 'PASS',
    description: 'Verification completed, zero baseline regression',
  },
  {
    id: 'info',
    name: 'Telemetry Info',
    hex: '#7C4DFF',
    bgRgba: 'rgba(124, 77, 255, 0.15)',
    borderRgba: 'rgba(124, 77, 255, 0.45)',
    level: 'INFO',
    description: 'Telemetry events, CDP transitions, fuzzer runtime statistics',
  },
];

export type SwatchKey = keyof PkTokenPack;

export interface SwatchDef {
  key: SwatchKey;
  label: string;
  cssVar: string;
}

export const SWATCHES: SwatchDef[] = [
  { key: 'colorPrimary', label: 'Primary Accent', cssVar: '--pk-accent' },
  { key: 'colorInfo', label: 'Info / Secondary', cssVar: '--pk-info' },
  { key: 'colorSuccess', label: 'Success / Safe', cssVar: '--pk-success' },
  { key: 'colorWarning', label: 'Warning / Medium', cssVar: '--pk-warning' },
  { key: 'colorError', label: 'Error / Critical', cssVar: '--pk-error' },
  { key: 'colorBgLayout', label: 'Canvas / Shell Bg', cssVar: '--pk-shell-bg' },
  { key: 'colorBgContainer', label: 'Surface Container', cssVar: '--pk-surface' },
  { key: 'colorBorder', label: 'Border Divider', cssVar: '--pk-border' },
  { key: 'colorText', label: 'Primary Text', cssVar: '--pk-text' },
  { key: 'railBg', label: 'Navigation Rail Bg', cssVar: '--pk-rail-bg' },
  { key: 'railText', label: 'Rail Text', cssVar: '--pk-rail-text' },
  { key: 'railTextMuted', label: 'Rail Muted Text', cssVar: '--pk-rail-muted' },
  { key: 'surfaceMuted', label: 'Surface Muted', cssVar: '--pk-surface-muted' },
  { key: 'headerBg', label: 'Header Frame Bg', cssVar: '--pk-header-bg' },
  { key: 'footerBg', label: 'Footer Frame Bg', cssVar: '--pk-footer-bg' },
];

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagGrade(ratio: number): string {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}
