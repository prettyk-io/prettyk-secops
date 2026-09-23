/**
 * ActionTape — Лента Действий (BROWSER-STUDIO-1).
 *
 * Чистый презентационный компонент: выводит записанные CDP-шаги в виде
 * каноничного PrettyK DSL (`stepToDSL`), позволяет удалить шаг, очистить
 * ленту и сохранить её в сценарий. Никаких побочных записей в Monaco/сторе —
 * только колбэки.
 */
import { Button } from "@/components/ui/button";
import { ListVideo, PlugZap, Save, Trash2, Circle } from "lucide-react";
import type { ScenarioStepModel } from "./scenarioStepModel";
import { actionColor, actionLabel, stepToDSL } from "./scenarioStepModel";

export interface ActionTapeProps {
  steps: ScenarioStepModel[];
  recording: boolean;
  cdpConnected: boolean;
  onRemoveStep: (index: number) => void;
  onClear: () => void;
  onSave: () => void;
}

export function ActionTape({ steps, recording, cdpConnected, onRemoveStep, onClear, onSave }: ActionTapeProps) {
  const isEmpty = steps.length === 0;
  const cy = "#22d3ee";

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
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
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
            return (
              <div key={step.id} className="group flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "#09090b", border: "1px solid #1e293b" }}>
                <span className="w-5 shrink-0 text-right text-[10px] font-mono" style={{ color: "#64748b" }}>{i + 1}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  {actionLabel(step.action)}
                </span>
                <code className="flex-1 min-w-0 truncate text-[11px]" style={{ color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace" }}>
                  {stepToDSL(step)}
                </code>
                <button className="shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" onClick={() => onRemoveStep(i)} title={`Удалить шаг ${i + 1}`}>
                  <Trash2 className="size-3" style={{ color: "#f87171" }} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}