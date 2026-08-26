/**
 * CO-PILOT META (PoC) BUD-7 — SkeletonCard.
 *
 * Извлечённая структура (страницы/шаги) показывается КАРТОЧКОЙ с чекбоксами
 * и inline-правками (снять галочку, переименовать, поменять порядок) ДО применения.
 * Ничего не пишет в workspace — только презентация + локальные правки черновика.
 */
import { useMemo } from 'react';
import { ChevronUp, ChevronDown, Layout } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SkeletonData, SkeletonPage, SkeletonStep } from './adapters';

export interface SkeletonCardProps {
  skeleton: SkeletonData;
  /** Снять/поставить галочку страницы. */
  onTogglePage?: (pageId: string) => void;
  /** Переименовать страницу (title). */
  onRenamePage?: (pageId: string, title: string) => void;
  /** Сдвинуть страницу вверх/вниз. */
  onMovePage?: (pageId: string, dir: 'up' | 'down') => void;
  /** Снять/поставить галочку шага. */
  onToggleStep?: (scenarioId: string, stepId: string) => void;
}

/** Одна страница с чекбоксом + inline rename + порядок. */
function PageRow({
  page,
  onToggle,
  onRename,
  onMoveUp,
  onMoveDown,
}: {
  page: SkeletonPage;
  onToggle?: () => void;
  onRename?: (title: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 group" data-testid={`skeleton-page-${page.id}`}>
      <input
        type="checkbox"
        checked={page.included}
        onChange={onToggle}
        className="shrink-0 accent-emerald-500"
        aria-label={`Включить ${page.title}`}
      />
      <input
        value={page.title}
        onChange={(e) => onRename?.(e.target.value)}
        className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-slate-700 focus:border-cyan-500/50 rounded px-1 py-0.5 text-[12px] text-slate-200 outline-none"
        aria-label="Название страницы"
      />
      <span className="text-[10px] font-mono text-slate-500 shrink-0">{page.path}</span>
      {page.assumption && (
        <span className="text-[9px] px-1 py-0.5 rounded border border-amber-500/40 text-amber-400 shrink-0" title="Предположение модели">
          ?
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onMoveUp} className="p-0.5 rounded hover:bg-white/10 text-slate-500" title="Вверх">
          <ChevronUp className="size-3" />
        </button>
        <button onClick={onMoveDown} className="p-0.5 rounded hover:bg-white/10 text-slate-500" title="Вниз">
          <ChevronDown className="size-3" />
        </button>
      </div>
    </div>
  );
}

function StepRow({
  step,
  onToggle,
}: {
  step: SkeletonStep;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={`skeleton-step-${step.id}`}>
      <input
        type="checkbox"
        checked={step.included}
        onChange={onToggle}
        className="shrink-0 accent-emerald-500"
        aria-label={`Включить шаг ${step.dsl}`}
      />
      <code className="text-[11px] font-mono text-cyan-300 truncate">{step.dsl}</code>
      {step.assumption && (
        <span className="text-[9px] px-1 py-0.5 rounded border border-amber-500/40 text-amber-400 shrink-0" title="Предположение модели">
          ?
        </span>
      )}
    </div>
  );
}

export function SkeletonCard({
  skeleton,
  onTogglePage,
  onRenamePage,
  onMovePage,
  onToggleStep,
}: SkeletonCardProps) {
  const pageRows = useMemo(() => skeleton.pages, [skeleton.pages]);

  return (
    <div className="rounded-lg border border-slate-700/60 bg-[#131B2E] p-3" data-testid="skeleton-card">
      <div className="flex items-center gap-1.5 mb-2">
        <Layout className="size-3.5 text-cyan-400" />
        <span className="text-[11px] font-bold text-slate-200">Извлечённая структура</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-2 italic truncate" title={skeleton.intent}>
        «{skeleton.intent}»
      </p>

      <div className="text-[10px] font-semibold text-slate-400 mb-1">Страницы</div>
      <div className="flex flex-col gap-1 mb-2">
        {pageRows.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            onToggle={() => onTogglePage?.(page.id)}
            onRename={(title) => onRenamePage?.(page.id, title)}
            onMoveUp={() => onMovePage?.(page.id, 'up')}
            onMoveDown={() => onMovePage?.(page.id, 'down')}
          />
        ))}
      </div>

      {skeleton.scenarios.map((scenario) => (
        <div key={scenario.id} className="mb-2">
          <div className="text-[10px] font-semibold text-slate-400 mb-1">
            Сценарий: {scenario.title}
          </div>
          <div className="flex flex-col gap-1 pl-1">
            {scenario.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                onToggle={() => onToggleStep?.(scenario.id, step.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
