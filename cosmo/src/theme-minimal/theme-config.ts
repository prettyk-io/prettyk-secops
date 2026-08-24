import type { Theme, Direction, CommonColors, ThemeProviderProps } from '@mui/material/styles';
import type { ThemeCssVariables } from './types';
import type { PaletteColorKey, PaletteColorNoChannels } from './core/palette';

// ----------------------------------------------------------------------

export type ThemeConfig = {
  direction: Direction;
  classesPrefix: string;
  cssVariables: ThemeCssVariables;
  defaultMode: ThemeProviderProps<Theme>['defaultMode'];
  modeStorageKey: ThemeProviderProps<Theme>['modeStorageKey'];
  fontFamily: Record<'primary' | 'secondary', string>;
  palette: Record<PaletteColorKey, PaletteColorNoChannels> & {
    common: Pick<CommonColors, 'black' | 'white'>;
    grey: {
      [K in 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 as `${K}`]: string;
    };
  };
};

export const themeConfig: ThemeConfig = {
  /** **************************************
   * Base
   *************************************** */
  defaultMode: 'dark',
  modeStorageKey: 'theme-minimal-mode',
  direction: 'ltr',
  classesPrefix: 'pk-minimal',
  /** **************************************
   * Css variables
   *************************************** */
  cssVariables: {
    cssVarPrefix: 'pk',
    colorSchemeSelector: 'data-color-scheme',
  },
  /** **************************************
   * Typography — PrettyK SecOps fonts
   *************************************** */
  fontFamily: {
    primary: '"Golos UI", "Golos Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    secondary: '"JetBrains Mono", "Consolas", "Courier New", monospace',
  },
  /** **************************************
   * Palette — Cyber Minimal (Cyan #38bdf8 + Indigo #6366f1 + Obsidian #080c16)
   *************************************** */
  palette: {
    primary: {
      lighter: '#BAE6FD',
      light: '#7DD3FC',
      main: '#38BDF8',
      dark: '#0284C7',
      darker: '#0369A1',
      contrastText: '#080C16',
    },
    secondary: {
      lighter: '#C7D2FE',
      light: '#A5B4FC',
      main: '#6366F1',
      dark: '#4F46E5',
      darker: '#4338CA',
      contrastText: '#FFFFFF',
    },
    info: {
      lighter: '#BAE6FD',
      light: '#7DD3FC',
      main: '#38BDF8',
      dark: '#0284C7',
      darker: '#0369A1',
      contrastText: '#080C16',
    },
    success: {
      lighter: '#A7F3D0',
      light: '#6EE7B7',
      main: '#34D399',
      dark: '#059669',
      darker: '#047857',
      contrastText: '#080C16',
    },
    warning: {
      lighter: '#FDE68A',
      light: '#FCD34D',
      main: '#F59E0B',
      dark: '#D97706',
      darker: '#B45309',
      contrastText: '#080C16',
    },
    error: {
      lighter: '#FECACA',
      light: '#FCA5A5',
      main: '#EF4444',
      dark: '#DC2626',
      darker: '#B91C1C',
      contrastText: '#FFFFFF',
    },
    grey: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
  },
};