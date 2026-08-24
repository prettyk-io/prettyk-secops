/**
 * Design tokens: antd + CSS --pk-*.
 * Каталог тем — в catalog.ts; здесь типы pack и CSS mapping.
 */

export type ThemeMode = 'light' | 'dark';

/** Старый ключ light/dark; новые id тоже пишем сюда (migrate). */
export const THEME_STORAGE_KEY = 'pk.theme';

/** Primary Космопорт (baseline). */
export const COLOR_PRIMARY = '#109bdf';

export const FONT_STACK =
  "'Golos UI', 'Golos Text', 'Segoe UI', system-ui, -apple-system, sans-serif";

export const MONO_STACK =
  "'JetBrains Mono', 'Consolas', 'Courier New', 'Segoe UI Mono', monospace";

export interface PkTokenPack {
  colorPrimary: string;
  colorInfo: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorBgLayout: string;
  colorBgContainer: string;
  colorBorder: string;
  colorText: string;
  borderRadius: number;
  fontFamily: string;
  fontSize: number;
  controlHeight: number;
  wireframe: boolean;
  railBg: string;
  railText: string;
  railTextMuted: string;
  surfaceMuted: string;
  headerBg: string;
  footerBg: string;
}

/** Studio / chrome extras beyond antd pack. */
export interface PkChromeExtras {
  paneAccentPretty: string;
  paneAccentWirek: string;
  paneAccentWidth: string;
  treeSelectedBg: string;
  treeGroupColor: string;
  treeAddBorder: string;
  treeAddBg: string;
  tabActiveBg: string;
  tabInk: string;
  shadowStrength: string;
  monacoSurface: string;
  monacoSurfaceWirek: string;
  studioGlow: string;
  treePending: string;
  treeMuted: string;
  treeIcon: string;
  scenarioIcon: string;
}

export const LIGHT_PACK: PkTokenPack = {
  colorPrimary: COLOR_PRIMARY,
  colorInfo: COLOR_PRIMARY,
  colorSuccess: '#3f9d6a',
  colorWarning: '#c0872e',
  colorError: '#cf1322',
  colorBgLayout: '#eef2f7',
  colorBgContainer: '#ffffff',
  colorBorder: '#d7dde8',
  colorText: '#0f172a',
  borderRadius: 4,
  fontFamily: FONT_STACK,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  railBg: '#1e293b',
  railText: '#e2e8f0',
  railTextMuted: '#94a3b8',
  surfaceMuted: '#f4f6fa',
  headerBg: '#1e293b',
  footerBg: '#f8fafc',
};

export const DARK_PACK: PkTokenPack = {
  colorPrimary: '#38bdf8',
  colorInfo: '#9333ea',
  colorSuccess: '#3fb27f',
  colorWarning: '#d8a13a',
  colorError: '#f85149',
  colorBgLayout: '#0b0f17',
  colorBgContainer: '#121722',
  colorBorder: '#232b3b',
  colorText: '#e8edf5',
  borderRadius: 4,
  fontFamily: FONT_STACK,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  railBg: '#0b0f17',
  railText: '#e8edf5',
  railTextMuted: '#94a3b8',
  surfaceMuted: '#181f2c',
  headerBg: '#0b0f17',
  footerBg: '#121722',
};

/** tabInk: #109bdf с насыщенностью +25% (HSL s≈87% → 100%). */
export const TAB_INK_LIGHT = '#00a8f0';
/** tabInk тёмный: каноничный электро-циан brandbook #38bdf8. */
export const TAB_INK_DARK = '#38bdf8';

export const LIGHT_CHROME: PkChromeExtras = {
  paneAccentPretty: COLOR_PRIMARY,
  /** Та же голубая полоска, что у PrettyK. */
  paneAccentWirek: COLOR_PRIMARY,
  /** Было 1.5px; на треть тоньше → 1px. */
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(16, 155, 223, 0.14)',
  /** Середина между muted листьев и прежним ярким cyan — меньше режет глаз. */
  treeGroupColor: '#1961a5',
  treeAddBorder: 'rgba(16, 155, 223, 0.35)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(0, 168, 240, 0.12)',
  tabInk: TAB_INK_LIGHT,
  shadowStrength: '0 1px 0 rgba(15, 23, 42, 0.03)',
  monacoSurface: '#fbfdff',
  monacoSurfaceWirek: '#f8fafc',
  studioGlow: 'rgba(16, 155, 223, 0.08)',
  treePending: '#b45309',
  treeMuted: '#334155',
  treeIcon: '#1e293b',
  scenarioIcon: '#389a48',
};

export const DARK_CHROME: PkChromeExtras = {
  paneAccentPretty: '#38bdf8',
  paneAccentWirek: '#9333ea',
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(56, 189, 248, 0.16)',
  /** Каноничный фиолетово-синий градиентный акцент для групп. */
  treeGroupColor: '#7dd3fc',
  treeAddBorder: 'rgba(56, 189, 248, 0.40)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(56, 189, 248, 0.12)',
  tabInk: TAB_INK_DARK,
  shadowStrength: '0 1px 0 rgba(0, 0, 0, 0.40)',
  monacoSurface: '#0b0f17',
  monacoSurfaceWirek: '#070a0f',
  studioGlow: 'rgba(56, 189, 248, 0.10)',
  treePending: '#fbbf24',
  treeMuted: '#94a3b8',
  treeIcon: '#f8fafc',
  scenarioIcon: '#4ade80',
};

/* ═══════════ ВРЕМЕННЫЕ dark-пресеты (переключатель палитр в шапке) ═══════════ */

/** 1. Neon / cyber-security — глубокий чёрно-синий + циан/фиолет. */
export const NEON_PACK: PkTokenPack = {
  colorPrimary: '#00e5ff',
  colorInfo: '#7c4dff',
  colorSuccess: '#2ee6a8',
  colorWarning: '#ffb020',
  colorError: '#ff4d6d',
  colorBgLayout: '#0a0e1a',
  colorBgContainer: '#11162a',
  colorBorder: '#2a3350',
  colorText: '#dce4ff',
  borderRadius: 4,
  fontFamily: FONT_STACK,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  railBg: '#0c1224',
  railText: '#e8ecff',
  railTextMuted: '#8b95c0',
  surfaceMuted: '#161c36',
  headerBg: '#0c1224',
  footerBg: '#11162a',
};
export const NEON_CHROME: PkChromeExtras = {
  paneAccentPretty: '#00e5ff',
  paneAccentWirek: '#00e5ff',
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(0, 229, 255, 0.18)',
  treeGroupColor: '#4dc8ff',
  treeAddBorder: 'rgba(0, 229, 255, 0.4)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(0, 229, 255, 0.14)',
  tabInk: '#00e5ff',
  shadowStrength: '0 1px 0 rgba(0, 0, 0, 0.4)',
  monacoSurface: '#0c1122',
  monacoSurfaceWirek: '#0a0e1a',
  studioGlow: 'rgba(0, 229, 255, 0.12)',
  treePending: '#ffb020',
  treeMuted: '#8b95c0',
  treeIcon: '#e8ecff',
  scenarioIcon: '#2ee6a8',
};

/** 2. Aurora graphite — холодный графит + стальной голубой. */
export const AURORA_PACK: PkTokenPack = {
  colorPrimary: '#58a6ff',
  colorInfo: '#58a6ff',
  colorSuccess: '#3fb27f',
  colorWarning: '#d8a13a',
  colorError: '#f85149',
  colorBgLayout: '#0d1117',
  colorBgContainer: '#131a24',
  colorBorder: '#2f3b4d',
  colorText: '#d0d7de',
  borderRadius: 4,
  fontFamily: FONT_STACK,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  railBg: '#11161d',
  railText: '#e6edf3',
  railTextMuted: '#8b949e',
  surfaceMuted: '#1a212c',
  headerBg: '#11161d',
  footerBg: '#131a24',
};
export const AURORA_CHROME: PkChromeExtras = {
  paneAccentPretty: '#58a6ff',
  paneAccentWirek: '#58a6ff',
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(88, 166, 255, 0.18)',
  treeGroupColor: '#79c0ff',
  treeAddBorder: 'rgba(88, 166, 255, 0.4)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(88, 166, 255, 0.13)',
  tabInk: '#58a6ff',
  shadowStrength: '0 1px 0 rgba(0, 0, 0, 0.25)',
  monacoSurface: '#0f141b',
  monacoSurfaceWirek: '#0d1117',
  studioGlow: 'rgba(88, 166, 255, 0.1)',
  treePending: '#d8a13a',
  treeMuted: '#8b949e',
  treeIcon: '#e6edf3',
  scenarioIcon: '#3fb27f',
};

/** 3. Dense enterprise (GitHub/Linear dark) — плотный, тонкие бордеры. */
export const DENSE_PACK: PkTokenPack = {
  colorPrimary: '#2f81f7',
  colorInfo: '#2f81f7',
  colorSuccess: '#3fb27f',
  colorWarning: '#d8a13a',
  colorError: '#f85149',
  colorBgLayout: '#161b22',
  colorBgContainer: '#1c2128',
  colorBorder: '#373f4c',
  colorText: '#e6edf3',
  borderRadius: 2,
  fontFamily: FONT_STACK,
  fontSize: 13,
  controlHeight: 30,
  wireframe: true,
  railBg: '#161b22',
  railText: '#e6edf3',
  railTextMuted: '#8b949e',
  surfaceMuted: '#21262d',
  headerBg: '#161b22',
  footerBg: '#1c2128',
};
export const DENSE_CHROME: PkChromeExtras = {
  paneAccentPretty: '#2f81f7',
  paneAccentWirek: '#2f81f7',
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(47, 129, 247, 0.16)',
  treeGroupColor: '#58a6ff',
  treeAddBorder: 'rgba(47, 129, 247, 0.4)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(47, 129, 247, 0.12)',
  tabInk: '#2f81f7',
  shadowStrength: '0 1px 0 rgba(0, 0, 0, 0.35)',
  monacoSurface: '#1c2128',
  monacoSurfaceWirek: '#161b22',
  studioGlow: 'rgba(47, 129, 247, 0.09)',
  treePending: '#d8a13a',
  treeMuted: '#8b949e',
  treeIcon: '#e6edf3',
  scenarioIcon: '#3fb27f',
};

/** 4. Warm premium graphite — тёплый графит + янтарный. */
export const WARM_PACK: PkTokenPack = {
  colorPrimary: '#f0a830',
  colorInfo: '#f0a830',
  colorSuccess: '#3fb27f',
  colorWarning: '#e58f2a',
  colorError: '#e5534b',
  colorBgLayout: '#171512',
  colorBgContainer: '#1e1b17',
  colorBorder: '#3a342c',
  colorText: '#ece6da',
  borderRadius: 6,
  fontFamily: FONT_STACK,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  railBg: '#1a1713',
  railText: '#f2ead9',
  railTextMuted: '#a89e8c',
  surfaceMuted: '#26211b',
  headerBg: '#1a1713',
  footerBg: '#1e1b17',
};
export const WARM_CHROME: PkChromeExtras = {
  paneAccentPretty: '#f0a830',
  paneAccentWirek: '#f0a830',
  paneAccentWidth: '1px',
  treeSelectedBg: 'rgba(240, 168, 48, 0.18)',
  treeGroupColor: '#f6c264',
  treeAddBorder: 'rgba(240, 168, 48, 0.4)',
  treeAddBg: 'transparent',
  tabActiveBg: 'rgba(240, 168, 48, 0.14)',
  tabInk: '#f6c264',
  shadowStrength: '0 1px 0 rgba(0, 0, 0, 0.25)',
  monacoSurface: '#1a1713',
  monacoSurfaceWirek: '#171512',
  studioGlow: 'rgba(240, 168, 48, 0.1)',
  treePending: '#e58f2a',
  treeMuted: '#a89e8c',
  treeIcon: '#f2ead9',
  scenarioIcon: '#3fb27f',
};

/** CSS custom properties из pack + chrome. */
export function cssVarsFromPack(
  pack: PkTokenPack,
  chrome: PkChromeExtras = LIGHT_CHROME,
): Record<string, string> {
  return {
    '--pk-border': pack.colorBorder,
    '--pk-accent': pack.colorPrimary,
    '--pk-error': pack.colorError,
    '--pk-surface': pack.colorBgContainer,
    '--pk-surface-muted': pack.surfaceMuted,
    '--pk-text': pack.colorText,
    '--pk-rail-bg': pack.railBg,
    '--pk-rail-text': pack.railText,
    '--pk-rail-muted': pack.railTextMuted,
    '--pk-header-bg': pack.headerBg,
    '--pk-footer-bg': pack.footerBg,
    '--pk-shell-bg': pack.colorBgLayout,
    '--pk-radius': `${String(pack.borderRadius)}px`,
    '--pk-font': pack.fontFamily,
    '--pk-header-height': '56px',
    '--pk-footer-height': '40px',
    '--pk-nav-width': '200px',
    '--pk-pane-accent-pretty': chrome.paneAccentPretty,
    '--pk-pane-accent-wirek': chrome.paneAccentWirek,
    '--pk-pane-accent-width': chrome.paneAccentWidth,
    '--pk-tree-selected': chrome.treeSelectedBg,
    '--pk-tree-group': chrome.treeGroupColor,
    '--pk-tree-add-border': chrome.treeAddBorder,
    '--pk-tree-add-bg': chrome.treeAddBg,
    '--pk-tab-active-bg': chrome.tabActiveBg,
    '--pk-tab-ink': chrome.tabInk,
    '--pk-shadow': chrome.shadowStrength,
    '--pk-monaco-surface': chrome.monacoSurface,
    '--pk-monaco-surface-wirek': chrome.monacoSurfaceWirek,
    '--pk-studio-glow': chrome.studioGlow,
    '--pk-tree-pending': chrome.treePending,
    '--pk-tree-muted': chrome.treeMuted,
    '--pk-tree-icon': chrome.treeIcon,
    '--pk-scenario-icon': chrome.scenarioIcon,
    '--pk-control-height': `${String(pack.controlHeight)}px`,
  };
}

/** antd ConfigProvider.token из pack. */
export function antdTokenFromPack(pack: PkTokenPack) {
  return {
    colorPrimary: pack.colorPrimary,
    colorInfo: pack.colorInfo,
    colorSuccess: pack.colorSuccess,
    colorWarning: pack.colorWarning,
    colorBgLayout: pack.colorBgLayout,
    colorBgContainer: pack.colorBgContainer,
    colorBorder: pack.colorBorder,
    colorText: pack.colorText,
    colorError: pack.colorError,
    borderRadius: pack.borderRadius,
    fontFamily: pack.fontFamily,
    fontSize: pack.fontSize,
    controlHeight: pack.controlHeight,
    wireframe: pack.wireframe,
  };
}
