/**
 * antd ConfigProvider + light/dark (localStorage pk.theme).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
/** Same package as ProLayout/ProTable — иначе два ProConfigContext и intl не доходит. */
import { ProConfigProvider } from '@ant-design/pro-components';
import {
  applyThemeCss,
  getTheme,
  readStoredThemeId,
  writeStoredThemeId,
  type PkThemeDefinition,
  type ThemeId,
  getPalette,
  isPaletteId,
  type PaletteId,
} from './catalog';
import { pkRuIntl } from './pkRuIntl';
import { antdTokenFromPack, cssVarsFromPack, type ThemeMode } from './tokens';

interface ThemeContextValue {
  themeId: ThemeId;
  definition: PkThemeDefinition;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  paletteId: PaletteId;
  setPalette: (id: PaletteId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useThemeMode вне ThemeProvider');
  }
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [themeId, setThemeId] = useState<ThemeId>(() =>
    typeof window === 'undefined' ? 'dark' : readStoredThemeId(),
  );
  const [paletteId, setPaletteId] = useState<PaletteId>('dark');
  const [storedPalette, setStoredPalette] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('pk.palette');
    } catch {
      return null;
    }
  });

  const setMode = useCallback((next: ThemeMode) => {
    setThemeId(next);
    setPaletteId('dark');
    setStoredPalette('dark');
    try {
      window.localStorage.setItem('pk.palette', 'dark');
    } catch {
      /* ignore */
    }
    writeStoredThemeId(next);
  }, []);

  const setPalette = useCallback((id: PaletteId) => {
    setPaletteId(id);
    setThemeId('dark');
    try {
      window.localStorage.setItem('pk.palette', id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const loadedStored =
      storedPalette && storedPalette !== 'light' && isPaletteId(storedPalette)
        ? (storedPalette as PaletteId)
        : 'dark';
    if (themeId === 'dark' && loadedStored !== 'dark') {
      setPaletteId(loadedStored);
    }
  }, [themeId, storedPalette]);

  const definition = paletteId !== 'dark' ? getPalette(paletteId) : getTheme(themeId);
  const mode = definition.group;
  const pack = definition.pack;

  useEffect(() => {
    // apply CSS vars for the effective definition
    const root = document.documentElement;
    root.dataset.pkTheme = paletteId !== 'dark' ? paletteId : themeId;
    root.dataset.pkMode = definition.group;
    root.dataset.pkTabStyle = 'card';
    root.dataset.pkButtonStyle = 'wireframe';
    const vars = cssVarsFromPack(pack, definition.chrome);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [definition, paletteId, themeId, pack]);

  const theme = useMemo(
    () => ({
      algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: antdTokenFromPack(pack),
      components: {
        Card: { paddingLG: 12 },
        Form: { itemMarginBottom: 10 },
        Layout: {
          headerHeight: 56,
          headerBg: pack.headerBg,
          bodyBg: pack.colorBgLayout,
          footerBg: pack.footerBg,
        },
        Anchor: {
          linkPaddingBlock: 4,
          linkPaddingInlineStart: 12,
        },
        Button: {
          borderRadius: pack.borderRadius,
          controlHeight: pack.controlHeight,
        },
        Tabs: {
          itemSelectedColor: definition.chrome.tabInk,
          inkBarColor: definition.chrome.tabInk,
        },
      },
    }),
    [definition.chrome.tabInk, mode, pack],
  );

  const ctx = useMemo(
    () => ({ themeId, definition, mode, setMode, paletteId, setPalette }),
    [themeId, definition, mode, setMode, paletteId, setPalette],
  );

  return (
    <ThemeContext.Provider value={ctx}>
      <ConfigProvider theme={theme}>
        <ProConfigProvider intl={pkRuIntl}>
          <AntdApp>{children}</AntdApp>
        </ProConfigProvider>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
