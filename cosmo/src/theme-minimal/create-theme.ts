import type { Theme, Components } from '@mui/material/styles';
import type { ThemeOptions } from './types';

import { createTheme as createMuiTheme } from '@mui/material/styles';

import { mixins } from './core/mixins';
import { opacity } from './core/opacity';
import { shadows } from './core/shadows';
import { palette } from './core/palette';
import { components } from './core/components';
import { typography } from './core/typography';
import { customShadows } from './core/custom-shadows';
import { themeConfig } from './theme-config';

// ----------------------------------------------------------------------

export const baseTheme: ThemeOptions = {
  palette: palette.dark,
  colorSchemes: {
    dark: {
      palette: palette.dark,
      shadows: shadows.dark,
      customShadows: customShadows.dark,
      opacity,
    },
    light: {
      palette: palette.light,
      shadows: shadows.light,
      customShadows: customShadows.light,
      opacity,
    },
  },
  mixins,
  components,
  typography,
  shape: { borderRadius: 8 },
  direction: themeConfig.direction,
  cssVariables: themeConfig.cssVariables,
};

// ----------------------------------------------------------------------

export function createTheme(themeOverrides: ThemeOptions = {}): Theme {
  const merged: ThemeOptions = {
    ...baseTheme,
    palette: palette.dark,
    defaultColorScheme: 'dark',
    ...themeOverrides,
  };
  const theme = createMuiTheme(merged);
  return theme;
}
