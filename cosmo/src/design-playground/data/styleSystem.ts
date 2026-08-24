/** CANON: 2 presets — Meta Dark & Meta Light. Cyan (#38BDF8) + Violet (#7A1FA2) across light/dark. */

export type GlobalDesignPresetId = 'meta-dark' | 'meta-light';

export interface GlobalDesignPreset {
  id: GlobalDesignPresetId;
  name: string;
  tag: string;
  tagColor: string;
  description: string;
  cardStyle: React.CSSProperties;
  inputContainerStyle: (focused?: boolean, hasError?: boolean) => React.CSSProperties;
  inputElementStyle: React.CSSProperties;
  primaryButtonStyle: (loading?: boolean) => React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
  badgeStyle: (color?: string) => React.CSSProperties;
  labelStyle: React.CSSProperties;
  segmentedStyle: {
    container: React.CSSProperties;
    activeItem: React.CSSProperties;
    inactiveItem: React.CSSProperties;
  };
}

export const PRESET_TO_STYLE_PACK_MAP: Record<GlobalDesignPresetId, string> = {
  'meta-dark': 'current',
  'meta-light': 'current',
};

const CYAN = '#38BDF8';
const VIOLET = '#7A1FA2';
const CYAN_LIGHT = '#0284C7';   // darker cyan for light-mode contrast
const VIOLET_LIGHT = '#6366F1'; // indigo for light-mode

const DARK_BG = '#080D1A';
const DARK_PAPER = '#0C1220';
const LIGHT_BG = '#F8FAFC';
const LIGHT_PAPER = '#FFFFFF';

function darkSegmented() {
  return {
    container: { background: DARK_BG, padding: 3, borderRadius: 6, border: `1px solid ${CYAN}33` },
    activeItem: { background: `${CYAN}33`, color: CYAN, fontWeight: 600, borderRadius: 4, boxShadow: `0 0 10px ${CYAN}40` },
    inactiveItem: { background: 'transparent', color: '#64748b', fontWeight: 400, borderRadius: 4 },
  };
}

function lightSegmented() {
  return {
    container: { background: '#F1F5F9', padding: 3, borderRadius: 6, border: '1px solid #CBD5E1' },
    activeItem: { background: `${CYAN_LIGHT}22`, color: CYAN_LIGHT, fontWeight: 600, borderRadius: 4 },
    inactiveItem: { background: 'transparent', color: '#64748b', fontWeight: 400, borderRadius: 4 },
  };
}

export const GLOBAL_STYLE_PRESETS: GlobalDesignPreset[] = [
  {
    id: 'meta-dark',
    name: 'Meta Dark (Cyan + Violet)',
    tag: 'CANON DARK',
    tagColor: 'cyan',
    description: 'Dark cyber canvas, Cyan #38BDF8 primary accents, Violet #7A1FA2 secondary. The canonical PrettyK dark theme.',
    cardStyle: {
      background: DARK_PAPER,
      border: `1px solid ${CYAN}22`,
      borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: DARK_BG,
      border: `1.5px solid ${hasError ? '#EF4444' : focused ? CYAN : `${CYAN}33`}`,
      borderRadius: 6,
      boxShadow: focused ? `0 0 12px ${hasError ? 'rgba(239, 68, 68, 0.3)' : `${CYAN}40`}` : 'none',
      transition: 'all 0.15s ease',
    }),
    inputElementStyle: { background: 'transparent', color: '#F8FAFC', fontFamily: '"Golos UI", sans-serif', fontSize: 13 },
    primaryButtonStyle: () => ({
      background: CYAN,
      color: '#080C16',
      fontWeight: 700,
      fontSize: 13,
      fontFamily: '"Golos UI", sans-serif',
      borderRadius: 6,
      border: 'none',
      boxShadow: `0 0 16px ${CYAN}66`,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
    secondaryButtonStyle: {
      background: `${VIOLET}1A`,
      border: `1px solid ${VIOLET}4D`,
      color: VIOLET,
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 12,
    },
    badgeStyle: (color = CYAN) => ({
      background: `${color}15`,
      border: `1px solid ${color}40`,
      color,
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
    }),
    labelStyle: { color: '#94A3B8', fontSize: 11, fontWeight: 500 },
    segmentedStyle: darkSegmented(),
  },
  {
    id: 'meta-light',
    name: 'Meta Light (Cyan + Violet)',
    tag: 'CANON LIGHT',
    tagColor: 'blue',
    description: 'Clean light canvas, Cyan #0284C7 primary, Indigo #6366F1 secondary. High contrast accessibility.',
    cardStyle: {
      background: LIGHT_PAPER,
      border: `1px solid ${VIOLET_LIGHT}22`,
      borderRadius: 10,
      boxShadow: '0 2px 12px rgba(15, 23, 42, 0.06)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: LIGHT_PAPER,
      border: `1.5px solid ${hasError ? '#DC2626' : focused ? CYAN_LIGHT : '#CBD5E1'}`,
      borderRadius: 6,
      boxShadow: focused ? `0 0 0 3px ${hasError ? 'rgba(220, 38, 38, 0.15)' : `${CYAN_LIGHT}22`}` : 'none',
      transition: 'all 0.15s ease',
    }),
    inputElementStyle: { background: 'transparent', color: '#0F172A', fontFamily: '"Golos UI", sans-serif', fontSize: 13 },
    primaryButtonStyle: () => ({
      background: CYAN_LIGHT,
      color: '#FFFFFF',
      fontWeight: 700,
      fontSize: 13,
      fontFamily: '"Golos UI", sans-serif',
      borderRadius: 6,
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
    secondaryButtonStyle: {
      background: 'transparent',
      border: `1px solid ${VIOLET_LIGHT}55`,
      color: VIOLET_LIGHT,
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 12,
    },
    badgeStyle: (color = CYAN_LIGHT) => ({
      background: `${color}12`,
      border: `1px solid ${color}30`,
      color,
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
    }),
    labelStyle: { color: '#475569', fontSize: 11, fontWeight: 500 },
    segmentedStyle: lightSegmented(),
  },
];