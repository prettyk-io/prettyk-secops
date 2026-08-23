import { PrettyKMark } from '../components/PrettyKMark';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

export type ShellChromeProps = {
  title?: string | null;
  onTitleClick?: () => void;
  /** Нет на login — там сессии ещё нет. */
  onLogout?: () => void;
  /** Home / History — без смены темы. */
  showThemeToggle?: boolean;
  /** Метка роли справа от бренда (только Администратор ИБ — без показа на других ролях). */
  roleLabel?: string | null;
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
}: ShellChromeProps): React.JSX.Element {
  return (
    <header className="pk-header">
      <div className="pk-brand">
        <div className="pk-brand-row">
          <PrettyKMark variant="secops" onClick={onTitleClick} />
          {title ? <BrandTitle title={title} onTitleClick={onTitleClick} /> : null}
        </div>
      </div>
      <div className="pk-header-actions">
        {roleLabel ? (
          <span className="pk-role-label" data-testid="header-role-label">
            {roleLabel}
          </span>
        ) : null}
        <LanguageSwitcher />
        <ThemeToggle style={{ display: 'none' }} />
        {onLogout ? <LogoutButton onClick={onLogout} /> : null}
      </div>
    </header>
  );
}