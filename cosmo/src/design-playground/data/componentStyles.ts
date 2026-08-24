/** CANON: single component style pack. Cyan+Violet only — no orange/mint/teal cruft. */

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
  name: 'Canon (Cyan + Violet)',
  description: 'PrettyK canonical styling — Cyan #38BDF8 primary, Violet #7A1FA2 secondary.',
  tags: ['canon', 'cyan', 'violet'],
  cssVars: { '--radius': '0.625rem' },
  injectStyles: '',
};

export const COMPONENT_STYLE_PACKS: ComponentStylePack[] = [currentStyles];

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