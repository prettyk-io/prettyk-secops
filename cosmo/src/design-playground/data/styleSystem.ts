export type GlobalDesignPresetId =
  | 'cyber-neon'
  | 'glass-frosted'
  | 'neubrutalism'
  | 'minimal-underline'
  | 'pill-soft'
  | 'terminal-cli'
  | 'gradient-stroke'
  | 'dense-enterprise';

export interface GlobalDesignPreset {
  id: GlobalDesignPresetId;
  name: string;
  tag: string;
  tagColor: string;
  description: string;
  // Card / Container styling
  cardStyle: React.CSSProperties;
  // Input container styling
  inputContainerStyle: (focused?: boolean, hasError?: boolean) => React.CSSProperties;
  // Input element styling
  inputElementStyle: React.CSSProperties;
  // Primary Button styling
  primaryButtonStyle: (loading?: boolean) => React.CSSProperties;
  // Secondary Button styling
  secondaryButtonStyle: React.CSSProperties;
  // Badge / Tag styling
  badgeStyle: (color?: string) => React.CSSProperties;
  // Label typography styling
  labelStyle: React.CSSProperties;
  // Segmented control styling
  segmentedStyle: {
    container: React.CSSProperties;
    activeItem: React.CSSProperties;
    inactiveItem: React.CSSProperties;
  };
}

export const PRESET_TO_STYLE_PACK_MAP: Record<GlobalDesignPresetId, string> = {
  'cyber-neon': 'current',
  'glass-frosted': 'glass',
  'neubrutalism': 'neubrut',
  'minimal-underline': 'minimal',
  'pill-soft': 'pill',
  'terminal-cli': 'retro',
  'gradient-stroke': 'liquid',
  'dense-enterprise': 'precision',
};

export const GLOBAL_STYLE_PRESETS: GlobalDesignPreset[] = [
  {
    id: 'cyber-neon',
    name: 'Cyber Neon Glow (Current)',
    tag: 'CURRENT',
    tagColor: 'cyan',
    description: 'Deep midnight canvas (#080c16), electric cyan borders with neon glow on focus.',
    cardStyle: {
      background: 'rgba(18, 23, 34, 0.85)',
      border: '1px solid rgba(92, 136, 245, 0.25)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#080c16',
      border: `1.5px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : 'rgba(92, 136, 245, 0.25)'}`,
      borderRadius: 6,
      boxShadow: focused ? `0 0 14px ${hasError ? 'rgba(248, 81, 73, 0.35)' : 'rgba(56, 189, 248, 0.3)'}` : 'none',
      transition: 'all 0.15s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    primaryButtonStyle: (loading) => ({
      background: '#38bdf8',
      color: '#080c16',
      fontWeight: 700,
      fontSize: 13,
      fontFamily: '"Golos UI", sans-serif',
      borderRadius: 6,
      border: 'none',
      boxShadow: '0 0 16px rgba(56, 189, 248, 0.4)',
      cursor: loading ? 'default' : 'pointer',
      transition: 'all 0.15s ease',
    }),
    secondaryButtonStyle: {
      background: 'rgba(56, 189, 248, 0.1)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      color: '#38bdf8',
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 12,
    },
    badgeStyle: (color = '#38bdf8') => ({
      background: `${color}15`,
      border: `1px solid ${color}40`,
      color,
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
    }),
    labelStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
    segmentedStyle: {
      container: {
        background: '#080c16',
        padding: 3,
        borderRadius: 6,
        border: '1px solid rgba(92, 136, 245, 0.2)',
      },
      activeItem: {
        background: 'rgba(56, 189, 248, 0.2)',
        color: '#38bdf8',
        fontWeight: 600,
        borderRadius: 4,
        boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)',
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
        fontWeight: 400,
        borderRadius: 4,
      },
    },
  },
  {
    id: 'glass-frosted',
    name: 'Vapor Glassmorphism',
    tag: 'FROSTED',
    tagColor: 'purple',
    description: 'Semi-transparent frosted glass panels, backdrop blur 16px, soft specular highlights.',
    cardStyle: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: 12,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: focused ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
      border: `1px solid ${hasError ? '#f85149' : focused ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)'}`,
      borderRadius: 10,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: focused ? '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)' : 'none',
      transition: 'all 0.2s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#ffffff',
      fontFamily: '"Golos Text", sans-serif',
      fontSize: 13,
    },
    primaryButtonStyle: () => ({
      background: 'rgba(255, 255, 255, 0.15)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      color: '#ffffff',
      fontWeight: 600,
      fontSize: 13,
      borderRadius: 10,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.25)',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      color: '#cbd5e1',
      borderRadius: 8,
      fontSize: 12,
    },
    badgeStyle: (color = '#c084fc') => ({
      background: 'rgba(255, 255, 255, 0.08)',
      border: `1px solid ${color}60`,
      color,
      borderRadius: 20,
      fontSize: 10,
      backdropFilter: 'blur(8px)',
    }),
    labelStyle: { color: '#cbd5e1', fontSize: 11, fontWeight: 500 },
    segmentedStyle: {
      container: {
        background: 'rgba(255, 255, 255, 0.05)',
        padding: 4,
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(12px)',
      },
      activeItem: {
        background: 'rgba(255, 255, 255, 0.15)',
        color: '#ffffff',
        fontWeight: 600,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      inactiveItem: {
        background: 'transparent',
        color: '#94a3b8',
        fontWeight: 400,
        borderRadius: 8,
      },
    },
  },
  {
    id: 'neubrutalism',
    name: 'Cyber Neubrutalism (Sharp)',
    tag: 'BRUTAL',
    tagColor: 'volcano',
    description: 'High contrast 2px solid cyan strokes, 0px border-radius, hard 4px offset shadow.',
    cardStyle: {
      background: '#0d111a',
      border: '2px solid #38bdf8',
      borderRadius: 0,
      boxShadow: '5px 5px 0px #38bdf8',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#060910',
      border: `2px solid ${hasError ? '#f85149' : focused ? '#00f0ff' : '#38bdf8'}`,
      borderRadius: 0,
      boxShadow: focused ? '5px 5px 0px #00f0ff' : '3px 3px 0px #38bdf8',
      transform: focused ? 'translate(-2px, -2px)' : 'none',
      transition: 'all 0.1s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#ffffff',
      fontFamily: '"GT Eesti Pro Text", "Golos UI", sans-serif',
      fontSize: 13,
      fontWeight: 600,
    },
    primaryButtonStyle: () => ({
      background: '#00f0ff',
      border: '2px solid #00f0ff',
      color: '#000000',
      fontWeight: 800,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderRadius: 0,
      boxShadow: '4px 4px 0px #38bdf8',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: '#0d111a',
      border: '2px solid #38bdf8',
      color: '#38bdf8',
      fontWeight: 700,
      borderRadius: 0,
      fontSize: 11,
      textTransform: 'uppercase',
    },
    badgeStyle: (color = '#00f0ff') => ({
      background: '#060910',
      border: `2px solid ${color}`,
      color,
      borderRadius: 0,
      fontSize: 10,
      fontWeight: 800,
      textTransform: 'uppercase',
    }),
    labelStyle: { color: '#38bdf8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
    segmentedStyle: {
      container: {
        background: '#060910',
        padding: 3,
        borderRadius: 0,
        border: '2px solid #38bdf8',
      },
      activeItem: {
        background: '#38bdf8',
        color: '#000000',
        fontWeight: 800,
        borderRadius: 0,
        textTransform: 'uppercase',
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
        fontWeight: 600,
        borderRadius: 0,
      },
    },
  },
  {
    id: 'minimal-underline',
    name: 'Minimalist Underline',
    tag: 'MINIMAL',
    tagColor: 'blue',
    description: 'Clean border-bottom only, zero side boxes, smooth focus expand.',
    cardStyle: {
      background: '#0b0f17',
      border: '1px solid #1e293b',
      borderRadius: 6,
    },
    inputContainerStyle: (focused, hasError) => ({
      background: 'transparent',
      border: 'none',
      borderBottom: `2px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#334155'}`,
      borderRadius: 0,
      boxShadow: focused ? '0 2px 8px rgba(56, 189, 248, 0.25)' : 'none',
      transition: 'all 0.2s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 14,
    },
    primaryButtonStyle: () => ({
      background: 'transparent',
      borderBottom: '2px solid #38bdf8',
      color: '#38bdf8',
      fontWeight: 700,
      fontSize: 13,
      borderRadius: 0,
      border: 'none',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: 'transparent',
      border: 'none',
      borderBottom: '1px solid #64748b',
      color: '#94a3b8',
      borderRadius: 0,
    },
    badgeStyle: (color = '#38bdf8') => ({
      background: 'transparent',
      borderBottom: `2px solid ${color}`,
      color,
      borderRadius: 0,
      fontSize: 10,
    }),
    labelStyle: { color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' },
    segmentedStyle: {
      container: {
        background: 'transparent',
        borderBottom: '1px solid #334155',
        padding: 0,
      },
      activeItem: {
        background: 'transparent',
        borderBottom: '2px solid #38bdf8',
        color: '#38bdf8',
        fontWeight: 600,
        borderRadius: 0,
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
        fontWeight: 400,
      },
    },
  },
  {
    id: 'pill-soft',
    name: 'Smooth Pill (Linear)',
    tag: 'PILL',
    tagColor: 'green',
    description: 'Fully rounded 9999px pill curves, smooth slate background, subtle inset highlights.',
    cardStyle: {
      background: '#101726',
      border: '1px solid #1e2b40',
      borderRadius: 16,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#131b2a',
      border: `1.5px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#202b3d'}`,
      borderRadius: 9999,
      padding: '0 16px',
      boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : 'none',
      transition: 'all 0.15s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    primaryButtonStyle: () => ({
      background: '#38bdf8',
      color: '#080c16',
      fontWeight: 600,
      fontSize: 13,
      borderRadius: 9999,
      border: 'none',
      padding: '0 20px',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: '#182236',
      border: '1px solid #2a3a54',
      color: '#94a3b8',
      borderRadius: 9999,
      padding: '0 16px',
    },
    badgeStyle: (color = '#38bdf8') => ({
      background: '#141d2e',
      border: `1px solid ${color}40`,
      color,
      borderRadius: 9999,
      fontSize: 10,
      padding: '2px 8px',
    }),
    labelStyle: { color: '#94a3b8', fontSize: 11, paddingLeft: 10 },
    segmentedStyle: {
      container: {
        background: '#0d1320',
        padding: 3,
        borderRadius: 9999,
        border: '1px solid #1e2b40',
      },
      activeItem: {
        background: 'linear-gradient(135deg, #38bdf8, #7a1fa2)',
        color: '#ffffff',
        fontWeight: 600,
        borderRadius: 9999,
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
        fontWeight: 400,
      },
    },
  },
  {
    id: 'terminal-cli',
    name: 'Terminal Hacker (CLI)',
    tag: 'TERMINAL',
    tagColor: 'lime',
    description: 'Black canvas (#04070e), matrix green typography (#2ee6a8), JetBrains Mono.',
    cardStyle: {
      background: '#04070e',
      border: '1px solid #1e293b',
      borderRadius: 4,
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#020408',
      border: `1px solid ${hasError ? '#f85149' : focused ? '#2ee6a8' : '#1e293b'}`,
      borderRadius: 3,
      boxShadow: focused ? '0 0 10px rgba(46, 230, 168, 0.25)' : 'none',
      transition: 'all 0.15s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#2ee6a8',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
    },
    primaryButtonStyle: () => ({
      background: '#0e241b',
      border: '1px solid #2ee6a8',
      color: '#2ee6a8',
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 700,
      fontSize: 12,
      borderRadius: 3,
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: '#080c16',
      border: '1px solid #334155',
      color: '#94a3b8',
      fontFamily: '"JetBrains Mono", monospace',
      borderRadius: 3,
    },
    badgeStyle: (color = '#2ee6a8') => ({
      background: '#04070e',
      border: `1px solid ${color}`,
      color,
      fontFamily: '"JetBrains Mono", monospace',
      borderRadius: 2,
      fontSize: 10,
    }),
    labelStyle: { color: '#64748b', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' },
    segmentedStyle: {
      container: {
        background: '#020408',
        padding: 2,
        borderRadius: 3,
        border: '1px solid #1e293b',
      },
      activeItem: {
        background: '#2ee6a8',
        color: '#04070e',
        fontFamily: '"JetBrains Mono", monospace',
        fontWeight: 700,
        borderRadius: 2,
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
        fontFamily: '"JetBrains Mono", monospace',
      },
    },
  },
  {
    id: 'gradient-stroke',
    name: 'Dual Gradient Stroke',
    tag: 'GRADIENT',
    tagColor: 'magenta',
    description: 'Electric cyan to vibrant violet gradient borders with neon glow.',
    cardStyle: {
      background: '#080c16',
      borderRadius: 10,
      border: '1.5px solid transparent',
      backgroundImage: 'linear-gradient(#080c16, #080c16), linear-gradient(135deg, #38bdf8 0%, #9333ea 100%)',
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
      boxShadow: '0 0 20px rgba(147, 51, 234, 0.2)',
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#080c16',
      borderRadius: 8,
      border: '1.5px solid transparent',
      backgroundImage: focused
        ? 'linear-gradient(#080c16, #080c16), linear-gradient(135deg, #00f0ff 0%, #9333ea 100%)'
        : 'linear-gradient(#080c16, #080c16), linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(147, 51, 234, 0.4) 100%)',
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
      boxShadow: focused ? '0 0 16px rgba(147, 51, 234, 0.35)' : 'none',
      transition: 'all 0.2s ease',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    primaryButtonStyle: () => ({
      background: 'linear-gradient(135deg, #38bdf8 0%, #7a1fa2 50%, #522e90 100%)',
      border: 'none',
      color: '#ffffff',
      fontWeight: 600,
      fontSize: 13,
      borderRadius: 8,
      boxShadow: '0 4px 18px rgba(122, 31, 162, 0.35)',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: 'rgba(147, 51, 234, 0.1)',
      border: '1px solid rgba(147, 51, 234, 0.3)',
      color: '#c084fc',
      borderRadius: 6,
    },
    badgeStyle: (color = '#c084fc') => ({
      background: '#080c16',
      border: `1px solid ${color}`,
      color,
      borderRadius: 6,
      fontSize: 10,
    }),
    labelStyle: { color: '#c084fc', fontSize: 11, fontWeight: 600 },
    segmentedStyle: {
      container: {
        background: '#080c16',
        padding: 3,
        borderRadius: 8,
        border: '1px solid rgba(147, 51, 234, 0.3)',
      },
      activeItem: {
        background: 'linear-gradient(135deg, #38bdf8, #9333ea)',
        color: '#ffffff',
        fontWeight: 600,
        borderRadius: 6,
      },
      inactiveItem: {
        background: 'transparent',
        color: '#94a3b8',
      },
    },
  },
  {
    id: 'dense-enterprise',
    name: 'Enterprise Ultra-Dense',
    tag: 'DENSE',
    tagColor: 'gold',
    description: 'Compact 28px height designed for data-heavy SecOps tables and monitors.',
    cardStyle: {
      background: '#0e1420',
      border: '1px solid #232e42',
      borderRadius: 4,
    },
    inputContainerStyle: (focused, hasError) => ({
      background: '#0a0f18',
      border: `1px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#232e42'}`,
      borderRadius: 4,
      height: 28,
      boxShadow: focused ? '0 0 0 2px rgba(56, 189, 248, 0.2)' : 'none',
    }),
    inputElementStyle: {
      background: 'transparent',
      color: '#e2e8f0',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 12,
    },
    primaryButtonStyle: () => ({
      background: '#2f81f7',
      border: 'none',
      color: '#ffffff',
      fontWeight: 600,
      fontSize: 12,
      borderRadius: 4,
      height: 28,
      padding: '0 12px',
      cursor: 'pointer',
    }),
    secondaryButtonStyle: {
      background: '#161b22',
      border: '1px solid #30363d',
      color: '#8b949e',
      borderRadius: 4,
      height: 28,
    },
    badgeStyle: (color = '#58a6ff') => ({
      background: '#161b22',
      border: `1px solid #30363d`,
      color,
      borderRadius: 4,
      fontSize: 10,
    }),
    labelStyle: { color: '#64748b', fontSize: 10, fontWeight: 600 },
    segmentedStyle: {
      container: {
        background: '#0a0f18',
        padding: 2,
        borderRadius: 4,
        border: '1px solid #232e42',
      },
      activeItem: {
        background: '#2f81f7',
        color: '#ffffff',
        fontWeight: 600,
        borderRadius: 3,
      },
      inactiveItem: {
        background: 'transparent',
        color: '#64748b',
      },
    },
  },
];
