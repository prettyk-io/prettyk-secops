export interface InputStylePreset {
  id: string;
  name: string;
  tag: string;
  tagColor: string;
  description: string;
  containerStyle: (focused: boolean, hasError?: boolean) => React.CSSProperties;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}

export const INPUT_PRESETS: InputStylePreset[] = [
  {
    id: 'cyber-neon',
    name: '1. Cyber Neon Glow (Current)',
    tag: 'CYBERPUNK',
    tagColor: 'cyan',
    description: 'Deep midnight canvas (#080c16), electric cyan borders with neon glow on focus, standard SecOps Studio.',
    containerStyle: (focused, hasError) => ({
      background: '#080c16',
      border: `1.5px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : 'rgba(92, 136, 245, 0.25)'}`,
      borderRadius: 6,
      boxShadow: focused ? `0 0 14px ${hasError ? 'rgba(248, 81, 73, 0.35)' : 'rgba(56, 189, 248, 0.3)'}` : 'none',
      transition: 'all 0.15s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    labelStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
  },
  {
    id: 'glass-frosted',
    name: '2. Vapor Glassmorphism',
    tag: 'GLASS',
    tagColor: 'purple',
    description: 'Semi-transparent frosted glass panels, backdrop blur 16px, soft specular highlights.',
    containerStyle: (focused, hasError) => ({
      background: focused ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
      border: `1px solid ${hasError ? '#f85149' : focused ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)'}`,
      borderRadius: 10,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: focused ? '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)' : 'none',
      transition: 'all 0.2s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#ffffff',
      fontFamily: '"Golos Text", sans-serif',
      fontSize: 13,
    },
    labelStyle: { color: '#cbd5e1', fontSize: 11, fontWeight: 500 },
  },
  {
    id: 'minimal-underline',
    name: '3. Minimalist Underline',
    tag: 'MINIMAL',
    tagColor: 'blue',
    description: 'Zero side/top borders, clean active bottom line expanding on focus.',
    containerStyle: (focused, hasError) => ({
      background: 'transparent',
      border: 'none',
      borderBottom: `2px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#334155'}`,
      borderRadius: 0,
      boxShadow: focused ? '0 2px 8px rgba(56, 189, 248, 0.25)' : 'none',
      transition: 'all 0.2s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 14,
    },
    labelStyle: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' },
  },
  {
    id: 'neubrutalism',
    name: '4. Neubrutalism (Sharp)',
    tag: 'BRUTAL',
    tagColor: 'volcano',
    description: 'Hard 0px corners, thick 2px cyan borders, offset 4px 4px hard shadow.',
    containerStyle: (focused, hasError) => ({
      background: '#0d111a',
      border: `2px solid ${hasError ? '#f85149' : focused ? '#00f0ff' : '#38bdf8'}`,
      borderRadius: 0,
      boxShadow: focused ? '5px 5px 0px #00f0ff' : '3px 3px 0px #38bdf8',
      transform: focused ? 'translate(-2px, -2px)' : 'none',
      transition: 'all 0.1s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#ffffff',
      fontFamily: '"GT Eesti Pro Text", "Golos UI", sans-serif',
      fontSize: 13,
      fontWeight: 600,
    },
    labelStyle: { color: '#38bdf8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' },
  },
  {
    id: 'pill-soft',
    name: '5. Smooth Pill (Linear)',
    tag: 'PILL',
    tagColor: 'green',
    description: 'Fully rounded 9999px contour, soft slate background, gentle focus ring.',
    containerStyle: (focused, hasError) => ({
      background: '#131b2a',
      border: `1.5px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#202b3d'}`,
      borderRadius: 9999,
      padding: '0 16px',
      boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : 'none',
      transition: 'all 0.15s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    labelStyle: { color: '#94a3b8', fontSize: 11, paddingLeft: 12 },
  },
  {
    id: 'terminal-cli',
    name: '6. Terminal Hacker (CLI)',
    tag: 'TERMINAL',
    tagColor: 'lime',
    description: 'Console prompt style: prefix `secops:~$`, matrix green JetBrains Mono font.',
    containerStyle: (focused, hasError) => ({
      background: '#04070e',
      border: `1px solid ${hasError ? '#f85149' : focused ? '#2ee6a8' : '#1e293b'}`,
      borderRadius: 4,
      boxShadow: focused ? '0 0 10px rgba(46, 230, 168, 0.25)' : 'none',
      transition: 'all 0.15s ease',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#2ee6a8',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
    },
    labelStyle: { color: '#64748b', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' },
  },
  {
    id: 'floating-label',
    name: '7. Floating Inset Label',
    tag: 'INSET',
    tagColor: 'geekblue',
    description: 'Embedded upper field badge inside container, high density space saver.',
    containerStyle: (focused, hasError) => ({
      background: '#0d131f',
      border: `1px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#1e2a3d'}`,
      borderRadius: 6,
      paddingTop: 4,
      boxShadow: focused ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    labelStyle: { color: '#38bdf8', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  },
  {
    id: 'gradient-stroke',
    name: '8. Dual Gradient Stroke',
    tag: 'GRADIENT',
    tagColor: 'magenta',
    description: 'Signature Pretty< dual gradient border from cyan to violet with neon glow.',
    containerStyle: (focused, hasError) => ({
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
    inputStyle: {
      background: 'transparent',
      color: '#f8fafc',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 13,
    },
    labelStyle: { color: '#c084fc', fontSize: 11, fontWeight: 600 },
  },
  {
    id: 'dense-enterprise',
    name: '9. Enterprise Ultra-Dense',
    tag: 'COMPACT',
    tagColor: 'gold',
    description: 'Compact 28px height for data-heavy SecOps tables and monitoring panels.',
    containerStyle: (focused, hasError) => ({
      background: '#0e1420',
      border: `1px solid ${hasError ? '#f85149' : focused ? '#38bdf8' : '#232e42'}`,
      borderRadius: 4,
      height: 28,
      boxShadow: focused ? '0 0 0 2px rgba(56, 189, 248, 0.2)' : 'none',
    }),
    inputStyle: {
      background: 'transparent',
      color: '#e2e8f0',
      fontFamily: '"Golos UI", sans-serif',
      fontSize: 12,
    },
    labelStyle: { color: '#64748b', fontSize: 10, fontWeight: 600 },
  },
];
