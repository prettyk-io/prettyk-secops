import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
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
import './tailwind.css';

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
        <Toaster position="bottom-right" richColors theme="dark" />
      </AppErrorBoundary>
    </ThemeProvider>
  </LocaleProvider>
  </StrictMode>,
);
