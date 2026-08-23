export interface ComponentStylePack {
  id: string;
  name: string;
  description: string;
  tags: string[];
  cssVars: Record<string, string>;
  injectStyles: string;
}

const currentStyles: ComponentStylePack = {
  id: 'current',
  name: 'Current (Default)',
  description: 'Standard shadcn/ui Zinc defaults. Baseline reference.',
  tags: ['current', 'default', 'zinc'],
  cssVars: { '--radius': '0.625rem' },
  injectStyles: '',
};

const sharpIndustrial: ComponentStylePack = {
  id: 'sharp',
  name: 'Sharp Industrial',
  description: 'Square corners, hard edges, zero radius. Industrial dashboard feel.',
  tags: ['sharp', 'industrial', 'square'],
  cssVars: { '--radius': '0rem' },
  injectStyles: `
    .pk-cs-sharp button, .pk-cs-sharp [role="button"] { box-shadow: none !important; }
    .pk-cs-sharp input, .pk-cs-sharp select, .pk-cs-sharp textarea { border-width: 2px !important; }
    .pk-cs-sharp .badge, .pk-cs-sharp [data-slot="badge"] { border-radius: 0 !important; }
  `,
};

const pillSoft: ComponentStylePack = {
  id: 'pill',
  name: 'Pill Soft',
  description: "Fully rounded pill buttons, soft shadows. Mobile-friendly CTA style.",
  tags: ['pill', 'rounded', 'soft', 'mobile'],
  cssVars: { '--radius': '1.5rem' },
  injectStyles: `
    .pk-cs-pill button { font-weight: 600 !important; letter-spacing: 0.01em !important; }
    .pk-cs-pill input { border-radius: 1.5rem !important; padding-left: 1rem !important; padding-right: 1rem !important; }
    .pk-cs-pill [role="switch"] > span { border-radius: 1rem !important; }
  `,
};

const neubrutalism: ComponentStylePack = {
  id: 'neubrut',
  name: 'Neubrutalism',
  description: 'Thick black borders, hard offset shadows, zero blur. Bold and playful.',
  tags: ['brutal', 'bold', 'shadow', 'pop'],
  cssVars: { '--radius': '0.25rem' },
  injectStyles: `
    .pk-cs-neubrut button:not(.ghost):not(.link) {
      border-width: 3px !important; border-color: #000 !important;
      box-shadow: 4px 4px 0 #000 !important;
      transition: all 0.1s ease !important;
      font-weight: 800 !important;
    }
    .pk-cs-neubrut button:not(.ghost):not(.link):hover {
      box-shadow: 2px 2px 0 #000 !important; transform: translate(2px, 2px);
    }
    .pk-cs-neubrut button:not(.ghost):not(.link):active {
      box-shadow: 0px 0px 0 #000 !important; transform: translate(4px, 4px);
    }
    .pk-cs-neubrut input, .pk-cs-neubrut select {
      border-width: 3px !important; border-color: #000 !important;
      box-shadow: 3px 3px 0 #000 !important;
    }
    .pk-cs-neubrut [data-slot="badge"], .pk-cs-neubrut .badge {
      border-width: 2px !important; border-color: #000 !important; font-weight: 700 !important;
    }
    .pk-cs-neubrut [role="switch"] { border-width: 3px !important; }
  `,
};

const glassmorphism: ComponentStylePack = {
  id: 'glass',
  name: 'Glassmorphism',
  description: 'Frosted glass panels, backdrop blur, translucent surfaces. Depth through light.',
  tags: ['glass', 'frosted', 'translucent', 'depth'],
  cssVars: { '--radius': '0.75rem' },
  injectStyles: `
    .pk-cs-glass button:not(.ghost):not(.link) {
      backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255,255,255,0.15) !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1) !important;
    }
    .pk-cs-glass input, .pk-cs-glass select {
      background: rgba(255,255,255,0.06) !important;
      backdrop-filter: blur(8px) !important;
      border: 1px solid rgba(255,255,255,0.12) !important;
    }
    .pk-cs-glass [data-slot="card"], .pk-cs-glass .card {
      background: rgba(255,255,255,0.04) !important;
      backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05) !important;
    }
    .pk-cs-glass [role="dialog"] {
      background: rgba(15,15,25,0.85) !important;
      backdrop-filter: blur(24px) !important;
      border: 1px solid rgba(255,255,255,0.12) !important;
    }
  `,
};

const minimalThin: ComponentStylePack = {
  id: 'minimal',
  name: 'Minimal Thin',
  description: 'Hairline borders, whisper shadows, fast transitions. Data-dense UI.',
  tags: ['minimal', 'thin', 'compact', 'dense'],
  cssVars: { '--radius': '0.3rem' },
  injectStyles: `
    .pk-cs-minimal button { font-size: 0.8rem !important; padding: 0.25rem 0.75rem !important; height: 2rem !important; }
    .pk-cs-minimal input { height: 2rem !important; font-size: 0.75rem !important; border-width: 1px !important; }
    .pk-cs-minimal [data-slot="badge"], .pk-cs-minimal .badge { font-size: 0.65rem !important; padding: 0.125rem 0.375rem !important; }
    .pk-cs-minimal * { transition-duration: 0.1s !important; }
    .pk-cs-minimal button { box-shadow: none !important; }
    .pk-cs-minimal button:hover { box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important; }
  `,
};

const chunkyPlayful: ComponentStylePack = {
  id: 'chunky',
  name: 'Chunky Playful',
  description: 'Oversized padding, bouncy animations, colorful hover effects. Kids/creative apps.',
  tags: ['chunky', 'playful', 'bouncy', 'big'],
  cssVars: { '--radius': '1rem' },
  injectStyles: `
    .pk-cs-chunky button { padding: 0.625rem 1.5rem !important; font-size: 0.9rem !important; font-weight: 700 !important; height: auto !important; }
    .pk-cs-chunky button:not(.ghost):not(.link):hover {
      transform: scale(1.05) !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25) !important;
    }
    .pk-cs-chunky button:not(.ghost):not(.link):active {
      transform: scale(0.95) !important;
    }
    .pk-cs-chunky input { padding: 0.625rem 1rem !important; font-size: 0.85rem !important; height: auto !important; }
    .pk-cs-chunky [data-slot="badge"] { padding: 0.25rem 0.75rem !important; font-size: 0.7rem !important; }
    .pk-cs-chunky button, .pk-cs-chunky *[role="button"] {
      transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease !important;
    }
  `,
};

const elevatedMaterial: ComponentStylePack = {
  id: 'elevated',
  name: 'Elevated Material',
  description: 'Layered shadows, subtle lift on hover. Material Design inspired depth.',
  tags: ['material', 'elevation', 'shadow', 'layered'],
  cssVars: { '--radius': '0.5rem' },
  injectStyles: `
    .pk-cs-elevated button:not(.ghost):not(.link) {
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08) !important;
      transition: box-shadow 0.25s ease, transform 0.25s ease !important;
    }
    .pk-cs-elevated button:not(.ghost):not(.link):hover {
      box-shadow: 0 4px 6px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08) !important;
      transform: translateY(-1px) !important;
    }
    .pk-cs-elevated button:not(.ghost):not(.link):active {
      box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
      transform: translateY(0) !important;
    }
    .pk-cs-elevated [data-slot="card"], .pk-cs-elevated .card {
      box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06) !important;
    }
    .pk-cs-elevated [data-slot="card"]:hover, .pk-cs-elevated .card:hover {
      box-shadow: 0 8px 16px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08) !important;
      transform: translateY(-2px) !important;
    }
    .pk-cs-elevated [role="dialog"] {
      box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.15) !important;
    }
  `,
};

const glitchCyber: ComponentStylePack = {
  id: 'glitch',
  name: 'Glitch Cyber',
  description: 'RGB split hover, flicker borders, digital distortion. Cyberpunk terminal.',
  tags: ['glitch', 'cyber', 'rgb', 'distortion'],
  cssVars: { '--radius': '0.25rem' },
  injectStyles: `
    @keyframes pk-glitch-shift {
      0%, 95% { transform: translate(0); }
      96% { transform: translate(-2px, 1px); }
      97% { transform: translate(2px, -1px); }
      98% { transform: translate(-1px, -1px); }
      100% { transform: translate(0); }
    }
    @keyframes pk-border-flicker {
      0%, 100% { border-color: rgba(56,189,248,0.3); }
      50% { border-color: rgba(56,189,248,0.8); box-shadow: 0 0 8px rgba(56,189,248,0.3); }
    }
    .pk-cs-glitch button:not(.ghost):not(.link) {
      border-width: 1px !important; font-family: monospace !important; text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
    }
    .pk-cs-glitch button:not(.ghost):not(.link):hover {
      animation: pk-glitch-shift 0.3s infinite !important;
    }
    .pk-cs-glitch input { font-family: monospace !important; border-width: 1px !important; }
    .pk-cs-glitch input:focus { animation: pk-border-flicker 1.5s infinite !important; }
    .pk-cs-glitch [data-slot="badge"] { font-family: monospace !important; text-transform: uppercase !important; }
  `,
};

const softOrganic: ComponentStylePack = {
  id: 'organic',
  name: 'Soft Organic',
  description: 'Blob-like rounded corners, no hard edges, gentle everything. Wellness apps.',
  tags: ['organic', 'soft', 'blob', 'calm'],
  cssVars: { '--radius': '2rem' },
  injectStyles: `
    .pk-cs-organic button { font-weight: 500 !important; letter-spacing: 0.02em !important; }
    .pk-cs-organic button:not(.ghost):not(.link) {
      box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
    }
    .pk-cs-organic input { border-radius: 2rem !important; border-width: 1.5px !important; }
    .pk-cs-organic [data-slot="badge"], .pk-cs-organic .badge {
      border-radius: 1rem !important; padding: 0.2rem 0.6rem !important;
    }
    .pk-cs-organic * { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; }
  `,
};

const retroBrutalist: ComponentStylePack = {
  id: 'retro',
  name: 'Retro Brutalist',
  description: 'Mono borders, typewriter feel, no-radius grids. 1980s terminal nostalgia.',
  tags: ['retro', 'brutalist', 'mono', 'typewriter'],
  cssVars: { '--radius': '0rem' },
  injectStyles: `
    .pk-cs-retro * { font-family: "JetBrains Mono", "Courier New", monospace !important; font-weight: 500 !important; }
    .pk-cs-retro button, .pk-cs-retro input, .pk-cs-retro select {
      border-width: 2px !important; border-style: solid !important;
    }
    .pk-cs-retro button:not(.ghost):not(.link) {
      background: transparent !important; color: inherit !important;
    }
    .pk-cs-retro button:not(.ghost):not(.link):hover {
      background: currentColor !important; color: #000 !important;
    }
    .pk-cs-retro [data-slot="badge"] { border-radius: 0 !important; font-weight: 700 !important; }
    .pk-cs-retro * { transition: none !important; }
  `,
};

const liquidGradient: ComponentStylePack = {
  id: 'liquid',
  name: 'Liquid Gradient',
  description: 'Animated gradient fills, morphing hover states. Web3 / DeFi aesthetic.',
  tags: ['gradient', 'liquid', 'animated', 'web3'],
  cssVars: { '--radius': '0.75rem' },
  injectStyles: `
    @keyframes pk-gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .pk-cs-liquid button:not(.ghost):not(.link):not(.destructive) {
      background: linear-gradient(135deg, #38bdf8, #a855f7, #f472b6, #38bdf8) !important;
      background-size: 300% 300% !important;
      animation: pk-gradient-shift 4s ease infinite !important;
      border: none !important; color: #fff !important; font-weight: 700 !important;
    }
    .pk-cs-liquid button:not(.ghost):not(.link):not(.destructive):hover {
      animation-duration: 1.5s !important;
      box-shadow: 0 0 24px rgba(168,85,247,0.4) !important;
    }
    .pk-cs-liquid input:focus {
      border-color: transparent !important;
      box-shadow: 0 0 0 2px #a855f7, 0 0 0 4px rgba(168,85,247,0.3) !important;
    }
    .pk-cs-liquid [data-slot="badge"] {
      background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(56,189,248,0.15)) !important;
      border-color: rgba(168,85,247,0.3) !important;
    }
  `,
};

const precisionFine: ComponentStylePack = {
  id: 'precision',
  name: 'Precision Fine',
  description: 'Tight kerning, monospace numbers, surgical precision. Finance / trading UI.',
  tags: ['precision', 'finance', 'monospace', 'tight'],
  cssVars: { '--radius': '0.2rem' },
  injectStyles: `
    .pk-cs-precision button, .pk-cs-precision input {
      font-size: 0.75rem !important; letter-spacing: -0.01em !important; height: 1.75rem !important;
    }
    .pk-cs-precision span, .pk-cs-precision p { font-size: 0.72rem !important; letter-spacing: 0.01em !important; }
    .pk-cs-precision [data-slot="badge"] { font-size: 0.6rem !important; padding: 0.08rem 0.35rem !important; }
    .pk-cs-precision button { padding: 0.15rem 0.5rem !important; box-shadow: none !important; }
    .pk-cs-precision input { padding: 0 0.5rem !important; }
    .pk-cs-precision [data-slot="card"] { padding: 0.5rem !important; }
    .pk-cs-precision * { line-height: 1.3 !important; }
  `,
};

export const COMPONENT_STYLE_PACKS: ComponentStylePack[] = [
  currentStyles,
  sharpIndustrial,
  pillSoft,
  neubrutalism,
  glassmorphism,
  minimalThin,
  chunkyPlayful,
  elevatedMaterial,
  glitchCyber,
  softOrganic,
  retroBrutalist,
  liquidGradient,
  precisionFine,
];

export type ComponentStylePackId = (typeof COMPONENT_STYLE_PACKS)[number]['id'];

const _styleElId = 'pk-component-style-pack';

export function applyComponentStylePack(pack: ComponentStylePack) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(pack.cssVars)) {
    root.style.setProperty(key, value);
  }

  // Remove existing pk-cs-* classes
  const classesToRemove: string[] = [];
  root.classList.forEach((cls) => {
    if (cls.startsWith('pk-cs-')) {
      classesToRemove.push(cls);
    }
  });
  classesToRemove.forEach((cls) => root.classList.remove(cls));

  // Add the active style pack class
  if (pack.id) {
    root.classList.add(`pk-cs-${pack.id}`);
  }

  let el = document.getElementById(_styleElId);
  if (!el) {
    el = document.createElement('style');
    el.id = _styleElId;
    document.head.appendChild(el);
  }
  el.textContent = pack.injectStyles;
}

export function getAppliedPackId(): ComponentStylePackId | null {
  const root = document.documentElement;
  const radius = root.style.getPropertyValue('--radius');
  const el = document.getElementById(_styleElId);
  if (!el && !radius) return null;
  for (const pack of COMPONENT_STYLE_PACKS) {
    if (pack.cssVars['--radius'] === radius && (!pack.injectStyles || (el && el.textContent === pack.injectStyles))) {
      return pack.id;
    }
  }
  return null;
}