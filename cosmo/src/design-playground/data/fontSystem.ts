/**
 * Global Font System for PrettyK Design Workbench & Admin Showcase.
 * Allows instant live UI font switching between:
 *  - Golos UI (Cyber Minimal / Canon default)
 *  - PT Astra Sans (Банк / ГОСТ / Astra Linux compliance)
 *  - Inter / System (Neutral World Standard)
 *
 * Monospace is permanently locked to JetBrains Mono across all modes.
 */

export type DesignFontId = 'golos' | 'astra' | 'inter';

export interface DesignFontOption {
  id: DesignFontId;
  name: string;
  badge: string;
  sublabel: string;
  fontFamily: string;
  monoFamily: string;
  description: string;
}

export const DESIGN_FONTS: DesignFontOption[] = [
  {
    id: 'golos',
    name: 'Golos UI',
    badge: 'CANON',
    sublabel: 'Cyber Minimal · High-Density',
    fontFamily: '"Golos UI", "Golos Text", "Segoe UI", system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", monospace',
    description: 'Канонический экранный гротеск для плотных таблиц и сложного дашборда',
  },
  {
    id: 'astra',
    name: 'PT Astra Sans',
    badge: 'ГОСТ / БАНК',
    sublabel: 'Astra Linux · Enterprise Compliance',
    fontFamily: '"PT Astra Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
    monoFamily: '"JetBrains Mono", monospace',
    description: 'Обязательный шрифт для сдачи в банки, госсектор и контуры с Astra Linux',
  },
  {
    id: 'inter',
    name: 'Inter / System',
    badge: 'DEFAULT',
    sublabel: 'Neutral Baseline · World Standard',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    monoFamily: '"JetBrains Mono", monospace',
    description: 'Мировой стандарт нейтрального интерфейса (Stripe / Linear / Vercel)',
  },
];

export const FONT_STORAGE_KEY = 'pk.design.font';

export function getStoredFontId(): DesignFontId {
  try {
    const v = localStorage.getItem(FONT_STORAGE_KEY);
    if (v === 'golos' || v === 'astra' || v === 'inter') {
      return v;
    }
  } catch {}
  return 'golos';
}

export function setStoredFontId(id: DesignFontId): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, id);
    applyFontToDocument(id);
  } catch {}
}

export function applyFontToDocument(id: DesignFontId): void {
  const font = DESIGN_FONTS.find((f) => f.id === id);
  if (font && typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--pk-font', font.fontFamily);
    document.documentElement.style.setProperty('--font-sans', font.fontFamily);
  }
}
