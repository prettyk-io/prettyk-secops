/**
 * PrettyKMark — канонический брендовый лок-ап.
 *
 * Рендерит утверждённый композитный PNG из public/brand/.
 * Цветовое управление — через мастер-ассет (тёмный хедер).
 * Варианты:
 *   'secops' (default) — Pretty< SecOps Lab (Главная / Регламент / Отчёты / Allure)
 *   'editor'           — Pretty< EDITOR (Studio / DSL-редактор)
 *   'live'             — Pretty< LIVE (Стенд прогона :8767)
 */
import {
  BRAND_HOME_HASH,
  handleBrandHomeAnchorClick,
  handleBrandHomeAuxClick,
} from '../shell/brandHomeNav';

export type PrettyKMarkVariant = 'secops' | 'editor' | 'live';
export type PrettyKMarkProps = {
  variant?: PrettyKMarkVariant;
  onClick?: () => void;
};

const ASSET: Record<PrettyKMarkVariant, string> = {
  secops: '/brand/prettyk-real-secops.png',
  editor: '/brand/prettyk-real-editor.png',
  live: '/brand/prettyk-real-live.png',
};

const LABEL: Record<PrettyKMarkVariant, string> = {
  secops: 'Pretty< SECOPS LAB',
  editor: 'Pretty< EDITOR',
  live: 'Pretty< LIVE',
};

export function PrettyKMark({
  variant = 'secops',
  onClick,
}: PrettyKMarkProps): React.JSX.Element {
  const img = (
    <img
      className="pk-prettyk-mark"
      data-variant={variant}
      src={ASSET[variant]}
      alt={LABEL[variant]}
    />
  );

  if (!onClick) {
    return img;
  }

  return (
    <a
      href={BRAND_HOME_HASH}
      className="pk-prettyk-mark-btn"
      aria-label={`${LABEL[variant]} — на главную`}
      onClick={(e) => handleBrandHomeAnchorClick(e, onClick)}
      onAuxClick={handleBrandHomeAuxClick}
    >
      {img}
    </a>
  );
}
