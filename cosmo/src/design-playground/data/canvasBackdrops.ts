export type CanvasBackdropId =
  | 'dot-grid'
  | 'matte-slate'
  | 'neutral-zinc'
  | 'deep-midnight'
  | 'clean-light';

export interface CanvasBackdrop {
  id: CanvasBackdropId;
  name: string;
  label: string;
  description: string;
  isLight?: boolean;
  style: React.CSSProperties;
  stageCardStyle: React.CSSProperties;
  inputBg: string;
  inputBorder: string;
  inputColor: string;
  textColor: string;
  mutedTextColor: string;
}

export const CANVAS_BACKDROPS: CanvasBackdrop[] = [
  {
    id: 'dot-grid',
    name: 'Dot Grid Canvas',
    label: '📐 Dot Grid (#1e2433)',
    description: 'Comfortable studio slate with subtle, non-intrusive alignment dots.',
    isLight: false,
    style: {
      backgroundColor: '#1e2433',
      backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px)',
      backgroundSize: '22px 22px',
      color: '#f8fafc',
    },
    stageCardStyle: {
      backgroundColor: '#262f42',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    },
    inputBg: '#181e2b',
    inputBorder: 'rgba(255, 255, 255, 0.18)',
    inputColor: '#f8fafc',
    textColor: '#f8fafc',
    mutedTextColor: '#94a3b8',
  },
  {
    id: 'matte-slate',
    name: 'Matte Slate Studio',
    label: '🌑 Matte Slate (#242f42)',
    description: 'Soft calming slate tone, zero glare, high contrast for input borders and paddings.',
    isLight: false,
    style: {
      backgroundColor: '#242f42',
      color: '#f8fafc',
    },
    stageCardStyle: {
      backgroundColor: '#2d3a52',
      border: '1px solid #3e4f6e',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    },
    inputBg: '#1c2536',
    inputBorder: '#425373',
    inputColor: '#f8fafc',
    textColor: '#f8fafc',
    mutedTextColor: '#94a3b8',
  },
  {
    id: 'neutral-zinc',
    name: 'Neutral Zinc Canvas',
    label: '🪐 Neutral Zinc (#2a2b30)',
    description: 'Pure achromatic graphite without color tint, perfect for color-critical audits.',
    isLight: false,
    style: {
      backgroundColor: '#2a2b30',
      color: '#f4f4f5',
    },
    stageCardStyle: {
      backgroundColor: '#35363c',
      border: '1px solid #4a4b54',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    },
    inputBg: '#212226',
    inputBorder: '#50515c',
    inputColor: '#f4f4f5',
    textColor: '#f4f4f5',
    mutedTextColor: '#a1a1aa',
  },
  {
    id: 'deep-midnight',
    name: 'Deep Midnight Cyber',
    label: '🌌 Midnight Cyber (#161d2d)',
    description: 'Softer deep midnight palette for testing glowing neon accents and badges.',
    isLight: false,
    style: {
      backgroundColor: '#161d2d',
      color: '#f8fafc',
    },
    stageCardStyle: {
      backgroundColor: '#1f283d',
      border: '1px solid rgba(92, 136, 245, 0.3)',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.35)',
    },
    inputBg: '#101624',
    inputBorder: 'rgba(92, 136, 245, 0.35)',
    inputColor: '#f8fafc',
    textColor: '#f8fafc',
    mutedTextColor: '#94a3b8',
  },
  {
    id: 'clean-light',
    name: 'Soft Studio Grey',
    label: '☀️ Soft Studio Grey (#cbd5e1)',
    description: 'Solid neutral studio grey canvas (#cbd5e1) with high contrast text and crisp cards.',
    isLight: true,
    style: {
      backgroundColor: '#cbd5e1',
      color: '#0f172a',
    },
    stageCardStyle: {
      backgroundColor: '#e2e8f0',
      border: '1.5px solid #94a3b8',
      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
    },
    inputBg: '#ffffff',
    inputBorder: '#64748b',
    inputColor: '#0f172a',
    textColor: '#0f172a',
    mutedTextColor: '#334155',
  },
];
