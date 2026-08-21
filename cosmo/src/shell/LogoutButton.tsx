/**
 * Выход из сессии — иконка 32×32 справа в хедере (кроме login).
 */
import logoutIcon from '../assets/icons/logout.png';

export type LogoutButtonProps = {
  onClick: () => void;
};

export function LogoutButton({ onClick }: LogoutButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="pk-header-logout"
      onClick={onClick}
      aria-label="Выйти"
      data-testid="header-logout"
    >
      <img src={logoutIcon} alt="" className="pk-header-logout-icon" aria-hidden />
    </button>
  );
}
