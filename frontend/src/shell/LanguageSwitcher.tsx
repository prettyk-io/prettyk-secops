/** Minimal locale toggle for the shell header. */
import { Segmented } from 'antd';
import { useLocale, type Locale } from '../locales';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <Segmented<Locale>
      size="small"
      value={locale}
      onChange={(v) => setLocale(v as Locale)}
      options={[
        { label: 'RU', value: 'ru' as Locale },
        { label: 'EN', value: 'en' as Locale },
      ]}
      style={{ background: 'rgba(255,255,255,.06)' }}
    />
  );
}