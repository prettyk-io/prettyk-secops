/**
 * PK-WB-B3: Discovery Hover Overlay + Click-to-DSL proposal.
 *
 * Наведение → карточка локатора (role-first, с приоритетом T0–T4).
 * Клик → предложение шага как diff (принять/отклонить), не молча.
 *
 * БЕЗ живого CDP: работает с мок-данными. Когда Boss подключит BrowserSession —
 * заменить onHover/onClick на реальные события из Playwright.
 */

import { useEffect } from 'react';
import { cn } from '../lib/utils';
import { Crosshair, MousePointer2, Check, X, ArrowRight, Shield } from 'lucide-react';

export type LocatorTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export interface DiscoveryLocator {
  role: string;
  name: string;
  tier: LocatorTier;
  /** Playwright locator string. */
  pwLocator: string;
  /** CSS selector for visual bounding. */
  cssSelector: string;
  /** Координаты элемента (проценты от вьюпорта браузера). */
  position: { x: number; y: number; w: number; h: number };
}

export interface DSLProposal {
  /** PrettyK DSL-строка, например: `Click role="button" name="Войти"` */
  dsl: string;
  /** Тип изменения: добавление нового шага. */
  action: 'add_step';
  /** Какой сценарий редактируется. */
  scenarioId?: string;
  /** Локатор, из которого сгенерирован шаг. */
  source: DiscoveryLocator;
}

const tierColors = {
  T0: 'border-emerald-400 bg-emerald-500/10 text-emerald-400',
  T1: 'border-cyan-400 bg-cyan-500/10 text-cyan-400',
  T2: 'border-amber-400 bg-amber-500/10 text-amber-400',
  T3: 'border-violet-400 bg-violet-500/10 text-violet-400',
  T4: 'border-slate-500 bg-slate-500/10 text-slate-400',
};

const tierLabels = {
  T0: 'getByRole — strongest',
  T1: 'getByLabel/Placeholder',
  T2: 'getByTestId',
  T3: 'CSS selector',
  T4: 'XPath fallback',
};

/** Мок-данные для демонстрации (заменяются на реальные при подключении CDP). */
const MOCK_ELEMENTS: DiscoveryLocator[] = [
  { role: 'textbox', name: 'Логин', tier: 'T0', pwLocator: 'page.getByRole("textbox", {name: "Логин"})', cssSelector: '#login', position: { x: 38, y: 32, w: 24, h: 5 } },
  { role: 'textbox', name: 'Пароль', tier: 'T0', pwLocator: 'page.getByRole("textbox", {name: "Пароль"})', cssSelector: '#password', position: { x: 38, y: 42, w: 24, h: 5 } },
  { role: 'button', name: 'Войти в систему', tier: 'T0', pwLocator: 'page.getByRole("button", {name: "Войти в систему"})', cssSelector: '#submit-btn', position: { x: 38, y: 52, w: 24, h: 6 } },
  { role: 'button', name: 'Забыли пароль?', tier: 'T1', pwLocator: 'page.getByText("Забыли пароль?")', cssSelector: '.forgot-link', position: { x: 42, y: 62, w: 16, h: 3 } },
];

function locatorToDSL(loc: DiscoveryLocator): string {
  if (loc.role === 'textbox') {
    return `Type role="${loc.role}" "${loc.name}" $value`;
  }
  return `Click role="${loc.role}" name="${loc.name}"`;
}

export interface DiscoveryOverlayProps {
  /** Объекты для инспекции (от CDP или мок). */
  elements?: DiscoveryLocator[];
  /** Колбэк при клике — предложить DSL-шаг. */
  onProposeStep?: (proposal: DSLProposal) => void;
  /** Показывать ли оверлей. */
  active?: boolean;
}

export function DiscoveryOverlay({ elements = MOCK_ELEMENTS, onProposeStep, active = true }: DiscoveryOverlayProps) {
  if (!active) return null;

  return (
    <div className="relative w-full h-full">
      {/* Static browser mock background */}
      <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center text-slate-600">
          <MousePointer2 className="size-6" />
          <p className="text-[10px]">Discovery Inspector — наведите на элементы для просмотра локаторов</p>
        </div>
      </div>

      {/* Element overlays */}
      {elements.map((el, i) => (
        <div
          key={i}
          className="absolute group cursor-pointer"
          style={{
            left: `${el.position.x}%`,
            top: `${el.position.y}%`,
            width: `${el.position.w}%`,
            height: `${el.position.h}%`,
          }}
          onClick={() => {
            onProposeStep?.({
              dsl: locatorToDSL(el),
              action: 'add_step',
              source: el,
            });
          }}
        >
          {/* Hover border */}
          <div className="absolute inset-0 border border-cyan-400/50 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-cyan-500/5" />

          {/* Locator card on hover */}
          <div className="absolute left-full ml-2 top-0 w-56 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Crosshair className="size-3 text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-200">{locatorToDSL(el)}</span>
            </div>
            <div className={cn('text-[8px] font-mono px-1.5 py-0.5 rounded mb-1 inline-block border', tierColors[el.tier])}>
              {el.tier}: {tierLabels[el.tier]}
            </div>
            <div className="text-[9px] font-mono text-slate-400 break-all">{el.pwLocator}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DSLProposalBannerProps {
  proposal: DSLProposal;
  onAccept: () => void;
  onReject: () => void;
}

/** Баннер предложения DSL-шага: принять или отклонить (с показом diff).
 *  Enter → Accept, Escape → Reject (не срабатывает при фокусе в input/textarea). */
export function DSLProposalBanner({ proposal, onAccept, onReject }: DSLProposalBannerProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        onAccept();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onReject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAccept, onReject]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 animate-in slide-in-from-top-2">
      <Shield className="size-4 text-cyan-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Предложен новый шаг</p>
        <code className="text-[11px] text-cyan-300 font-mono block">{proposal.dsl}</code>
        <p className="text-[8px] text-slate-500 mt-0.5">
          {proposal.source.tier}: {proposal.source.pwLocator}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onReject} className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors" title="Отклонить (Esc)">
          <X className="size-3.5" />
        </button>
        <button onClick={onAccept} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-[10px] font-semibold" title="Принять шаг (Enter)">
          <Check className="size-3.5" /> Принять <kbd className="text-[8px] font-mono opacity-70">⏎</kbd>
        </button>
      </div>
    </div>
  );
}