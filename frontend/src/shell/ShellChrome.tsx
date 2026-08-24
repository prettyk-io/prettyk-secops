import { PrettyKMark } from '../components/PrettyKMark';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { readSession, displayNameOf } from './auth';
import { useProfileStore } from './useProfileStore';

export type ShellChromeProps = {
  title?: string | null;
  onTitleClick?: () => void;
  /** Нет на login — там сессии ещё нет. */
  onLogout?: () => void;
  /** Home / History — без смены темы. */
  showThemeToggle?: boolean;
  /** Метка роли/профиля справа от бренда. */
  roleLabel?: string | null;
  /** Показывать ли бренд-логотип слева (на Home в хедере скрываем). */
  showBrand?: boolean;
};

function BrandTitle({
  title,
  onTitleClick,
}: {
  title: string;
  onTitleClick?: () => void;
}): React.JSX.Element {
  if (onTitleClick) {
    return (
      <button
        type="button"
        className="pk-brand-title pk-brand-title--clickable"
        onClick={onTitleClick}
      >
        {title}
      </button>
    );
  }
  return <span className="pk-brand-title">{title}</span>;
}

export function ShellChrome({
  title,
  onTitleClick,
  onLogout,
  showThemeToggle = true,
  roleLabel,
  showBrand = true,
}: ShellChromeProps): React.JSX.Element {
  const session = readSession();
  const storeName = useProfileStore((s) => s.profile.name);
  const profileName = storeName || roleLabel || (session ? displayNameOf(session) : null);
  const openDrawer = useProfileStore((s) => s.openDrawer);

  return (
    <header
      className="pk-header"
      style={{
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="pk-brand">
        {showBrand ? (
          <div className="pk-brand-row">
            <PrettyKMark variant="secops" onClick={onTitleClick} />
            {title ? <BrandTitle title={title} onTitleClick={onTitleClick} /> : null}
          </div>
        ) : <div className="pk-brand-row" />}
      </div>
      <div
        className="pk-header-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <LanguageSwitcher />
        <ThemeToggle style={{ display: 'none' }} />
        {profileName ? (
          <span
            className="pk-profile-badge"
            data-testid="header-profile-name"
            onClick={openDrawer}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: '"Golos UI", "Segoe UI", system-ui, sans-serif',
              letterSpacing: '0.02em',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#38bdf8',
                boxShadow: '0 0 6px #38bdf8',
              }}
            />
            {profileName}
          </span>
        ) : null}
        {onLogout ? <LogoutButton onClick={onLogout} /> : null}
      </div>
    </header>
  );
}