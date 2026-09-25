/**
 * ActionTape — Лента Действий (BROWSER-STUDIO-1, STUDIO-TAPE-OPS).
 *
 * Презентационный компонент: выводит записанные CDP-шаги в виде каноничного
 * PrettyK DSL (`stepToDSL`), позволяет переупорядочить (▲/▼), удалить шаг,
 * очистить ленту, сохранить и воспроизвести её на лету (Replay Tape).
 * Авто-скролл к свежему шагу при каждом авто-коммите.
 *
 * Отрисовка статуса воспроизведения происходит по `replayStates` (ключ — id шага):
 * idle (серый номер) → running (спиннер) → passed (Check) | failed (AlertCircle с тултипом).
 * Никаких побочных записей в Monaco/сторе — только колбэки.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ListVideo, PlugZap, Save, Trash2, Circle,
  Play, Square, ChevronUp, ChevronDown, Loader2, Check, AlertCircle,
} from "lucide-react";
import type { ScenarioStepModel } from "./scenarioStepModel";
import { actionColor, actionLabel, stepToDSL } from "./scenarioStepModel";
import type { ReplayStepState } from "../terminal/replayRunner";

export interface ActionTapeProps {
  steps: ScenarioStepModel[];
  recording: boolean;
  /** Браузер-сессия подключена (для баннера доступности записи). */
  cdpConnected: boolean;
  /** Можно ли запустить воспроизведение (есть шаги И CDP активен). */
  replayEnabled: boolean;
  /** Идёт ли воспроизведение ленты прямо сейчас. */
  replaying: boolean;
  /** Статусы шагов воспроизведения (ключ — step.id). */
  replayStates?: Record<string, ReplayStepState>;
  onRemoveStep: (index: number) => void;
  /** Переместить шаг на одну позицию: -1 вверх, +1 вниз. */
  onMoveStep: (index: number, dir: -1 | 1) => void;
  onClear: () => void;
  onSave: () => void;
  /** Запустить воспроизведение ленты. */
  onReplay: () => void;
  /** Прервать воспроизведение (AbortController). */
  onStopReplay: () => void;
}

export function ActionTape({
  steps, recording, cdpConnected,
  replayEnabled, replaying, replayStates,
  onRemoveStep, onMoveStep, onClear, onSave, onReplay, onStopReplay,
}: ActionTapeProps) {
  const isEmpty = steps.length === 0;
  const cy = "#22d3ee";

  // STUDIO-TAPE-OPS: auto-scroll к свежему шагу при авто-коммите.
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    // Фолбэк для jsdom/старых браузеров без scrollIntoView: прямой скролл.
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [steps.length]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0f172a", color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
        <ListVideo className="size-3.5" style={{ color: cy }} />
        <span className="text-xs font-semibold" style={{ color: "#cbd5e1" }}>Лента действий</span>
        <span className="text-[10px] font-mono" style={{ color: "#64748b" }}>{steps.length}</span>
        {recording && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: "#f87171" }}>
            <Circle className="size-2.5 fill-current" /> запись
          </span>
        )}
        <div className="flex-1" />
        {replaying ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 text-[11px] gap-1"
            style={{ borderColor: "#f59e0b", color: "#f59e0b" }}
            onClick={onStopReplay}
            title="Остановить воспроизведение"
          >
            <Square className="size-3" /> Остановить
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 text-[11px] gap-1"
            onClick={onReplay}
            disabled={!replayEnabled}
            title={replayEnabled ? "Воспроизвести ленту" : "Нет шагов или браузер не подключён"}
          >
            <Play className="size-3" /> Воспроизвести
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 shrink-0 text-[11px] gap-1" onClick={onClear} disabled={isEmpty} title="Очистить ленту">
          <Trash2 className="size-3" /> Очистить
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 shrink-0 text-[11px] gap-1"
          style={isEmpty ? undefined : { borderColor: "#22c55e", color: "#4ade80" }}
          onClick={onSave}
          disabled={isEmpty}
          title="Сохранить ленту в сценарий"
        >
          <Save className="size-3" /> Сохранить
        </Button>
      </div>

      {/* Live/edge banners */}
      {!cdpConnected && (
        <div className="px-3 py-1.5 shrink-0 flex items-center gap-2 text-[10px]" style={{ borderBottom: "1px solid #1e293b", background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
          <PlugZap className="size-3" /> Браузер не подключён — запись недоступна, но меню сохранения открыто
        </div>
      )}

      {/* Step list */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "#475569" }}>
            <ListVideo className="size-8 opacity-30" />
            <span className="text-xs">
              {recording
                ? "Кликайте по вьюпорту браузера — шаги будут появляться здесь"
                : "Нажмите ● Record и кликайте по вьюпорту, чтобы записать шаги"}
            </span>
          </div>
        ) : (
          steps.map((step, i) => {
            const color = actionColor(step.action);
            const rs = replayStates?.[step.id];
            const status = rs?.status ?? 'idle';
            return (
              <div key={step.id} className="group flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "#09090b", border: "1px solid #1e293b" }}>
                <span className="w-5 shrink-0 flex items-center justify-center" data-testid={`tape-step-status-${i}`} data-status={replaying ? status : 'idle'}>
                  {replaying ? (
                    status === 'running' ? (
                      <Loader2 className="size-3 animate-spin text-amber-400" />
                    ) : status === 'passed' ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : status === 'failed' ? (
                      <span title={rs?.error ?? 'Ошибка шага'}><AlertCircle className="size-3 text-red-400" /></span>
                    ) : (
                      <span className="text-[10px] font-mono" style={{ color: "#64748b" }}>{i + 1}</span>
                    )
                  ) : (
                    <span className="text-[10px] font-mono" style={{ color: "#64748b" }}>{i + 1}</span>
                  )}
                </span>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  {actionLabel(step.action)}
                </span>
                <code className="flex-1 min-w-0 truncate text-[11px]" style={{ color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace" }}>
                  {stepToDSL(step)}
                </code>
                {/* Reorder: ▲ Вверх / ▼ Вниз (disable на первом/последнем и во время replay) */}
                <div className="flex flex-col shrink-0 opacity-30 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onMoveStep(i, -1)}
                    disabled={i === 0 || replaying}
                    title="Переместить вверх"
                    className="p-0.5 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={() => onMoveStep(i, 1)}
                    disabled={i === steps.length - 1 || replaying}
                    title="Переместить вниз"
                    className="p-0.5 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
                <button className="shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" onClick={() => onRemoveStep(i)} title={`Удалить шаг ${i + 1}`}>
                  <Trash2 className="size-3" style={{ color: "#f87171" }} />
                </button>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}