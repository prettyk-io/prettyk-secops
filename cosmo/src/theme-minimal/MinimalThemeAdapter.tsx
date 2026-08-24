/**
 * MinimalThemeAdapter — self-contained MUI theme provider for PrettyK admin panels.
 *
 * No external dependencies on settings context, global state, or minimal-shared npm.
 * Drop-in wrapper: replaces antd ConfigProvider on #/admin, #/control, #/dashboard.
 */
import type { Theme, ThemeOptions as MuiThemeOptions } from '@mui/material/styles';
import type {} from './extend-theme-types';

import { useMemo } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider, createTheme as createMuiTheme } from '@mui/material/styles';
import { StyledEngineProvider } from '@mui/material/styles';

import { baseTheme } from './create-theme';

// ----------------------------------------------------------------------

export { createTheme } from './create-theme';
export type { ThemeConfig } from './theme-config';
export { themeConfig } from './theme-config';

export interface MinimalThemeAdapterProps {
  /** Override specific theme tokens at runtime */
  themeOverrides?: Partial<MuiThemeOptions>;
  /** Default color scheme mode */
  defaultMode?: 'light' | 'dark';
  children: React.ReactNode;
}

export function MinimalThemeAdapter({
  themeOverrides,
  defaultMode = 'dark',
  children,
}: MinimalThemeAdapterProps) {
  const theme = useMemo(() => {
    const merged = {
      ...baseTheme,
      defaultColorScheme: defaultMode,
      ...themeOverrides,
    };
    return createMuiTheme(merged as MuiThemeOptions);
  }, [themeOverrides, defaultMode]);

  return (
    <StyledEngineProvider injectFirst>
      <MuiThemeProvider theme={theme} defaultMode={defaultMode}>
        <CssBaseline enableColorScheme />
        {children}
      </MuiThemeProvider>
    </StyledEngineProvider>
  );
}