/** Lightweight i18n: React Context + localStorage + Ant Design locale integration. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import type { Locale, TranslationDictionary } from './types';
import { ru } from './ru';
import { en } from './en';

export type { Locale, TranslationDictionary };

const LS_KEY = 'pk-locale';
const DICTIONARY: Record<Locale, TranslationDictionary> = { ru, en };
const ANT_LOCALE: Record<Locale, typeof ruRU> = { ru: ruRU, en: enUS };

function readLocale(): Locale {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (v === 'ru' || v === 'en') return v;
  } catch {}
  return 'ru';
}
function writeLocale(l: Locale) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, l); } catch {}
}

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dict: TranslationDictionary;
}

const LocaleContext = createContext<LocaleCtx>({
  locale: readLocale(),
  setLocale: () => {},
  dict: en,
});

export function useLocale() {
  return useContext(LocaleContext);
}

/** typed accessor shorthand: useT() → t('studio', 'emptyTitle') */
export function useT() {
  const { dict } = useContext(LocaleContext);
  return useCallback(
    (domain: string, key: string): string => {
      const d = (dict as unknown as Record<string, unknown>)[domain];
      if (d && typeof d === 'object') {
        const v = (d as Record<string, unknown>)[key];
        if (typeof v === 'string') return v;
      }
      const c = dict.common as unknown as Record<string, string>;
      if (c[key]) return c[key];
      return key;
    },
    [dict],
  );
}

let _stored = readLocale();

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(_stored);
  const dict = DICTIONARY[locale];

  const setLocale = useCallback((l: Locale) => {
    _stored = l;
    writeLocale(l);
    setLocaleState(l);
  }, []);

  const ctx = useMemo(() => ({ locale, setLocale, dict }), [locale, setLocale, dict]);

  return (
    <LocaleContext.Provider value={ctx}>
      <ConfigProvider locale={ANT_LOCALE[locale]}>
        {children}
      </ConfigProvider>
    </LocaleContext.Provider>
  );
}