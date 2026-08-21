import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/300.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { AppErrorBoundary } from './shell/AppErrorBoundary';
import { AppShell } from './shell/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';
import { LocaleProvider } from './locales';
import { applyThemeCss, readStoredThemeId } from './theme/catalog';
import './styles.css';

applyThemeCss(readStoredThemeId());

const container = document.getElementById('root');
if (container === null) {
  throw new Error('В index.html нет элемента #root');
}

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
    <ThemeProvider>
      <AppErrorBoundary>
        <AppShell />
      </AppErrorBoundary>
    </ThemeProvider>
  </LocaleProvider>
  </StrictMode>,
);
