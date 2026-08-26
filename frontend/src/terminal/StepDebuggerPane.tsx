/**
 * PK-WB-E3 — Step Debugger Panel.
 *
 * Bottom-drawer pane: список шагов, пошаговое управление,
 * просмотр входа/выхода/переменных/HTTP-обмена/ошибок.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  SkipForward,
  StepForward,
  Square,
  Bug,
  ShieldAlert,
  Variable,
  Globe,
  Eye,
  EyeOff,
  Copy,
  RotateCcw,
} from 'lucide-react';
import type { StepDebuggerEngine, StepDebugIO, DebugSessionState } from './stepDebuggerEngine';
import { stepStatusToLed } from './stepDebuggerEngine';
import type { VariableSnapshot } from '../contracts/types';

// ═══════════════════════════════════════════════════════════════════════════
// LED badge
// ═══════════════════════════════════════════════════════════════════════════

const LED_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  queued:    { bg: 'bg-slate-700/30',  border: 'border-slate-600',  text: 'text-slate-400' },
  running:   { bg: 'bg-cyan-500/15',   border: 'border-cyan-500/50',   text: 'text-cyan-400' },
  success:   { bg: 'bg-emerald-500/15', border: 'border-emerald-500/50', text: 'text-emerald-400' },
  warning:   { bg: 'bg-amber-500/15',  border: 'border-amber-500/50',  text: 'text-amber-400' },
  failure:   { bg: 'bg-red-500/15',    border: 'border-red-500/50',    text: 'text-red-400' },
  predicted: { bg: 'bg-violet-500/15', border: 'border-violet-500/50', text: 'text-violet-400' },
};

function LedBadge({ status }: { status: string }) {
  const c = LED_COLORS[status] ?? LED_COLORS.queued!;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${c!.bg} ${c!.border} ${c!.text}`}
    >
      <span className={`size-2 rounded-full animate-pulse ${status === 'running' ? 'bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]' : status === 'success' ? 'bg-emerald-400' : status === 'failure' ? 'bg-red-400' : 'bg-slate-500'}`} />
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Variable viewer (secret-safe)
// ═══════════════════════════════════════════════════════════════════════════

function VariableRow({ variable }: { variable: VariableSnapshot }) {
  const [revealed, setRevealed] = useState(false);

  const maskedValue = variable.isSecret
    ? `${'*'.repeat(12)}${variable.value.slice(-4)}`
    : variable.value;

  return (
    <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5 group text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {variable.isSecret ? (
          <ShieldAlert className="size-3 text-amber-400 shrink-0" />
        ) : (
          <Variable className="size-3 text-cyan-400 shrink-0" />
        )}
        <span className="font-mono text-slate-200 truncate">{variable.name}</span>
        {variable.type && (
          <span className="text-[10px] text-slate-500 font-mono">{variable.type}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-slate-400 max-w-[140px] truncate">
          {variable.isSecret && !revealed ? maskedValue : variable.value}
        </span>
        {variable.isSecret && (
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="text-slate-500 hover:text-amber-400"
            title={revealed ? 'Скрыть' : 'Показать'}
          >
            {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(variable.value).catch(() => {})}
          className="text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100"
          title="Копировать значение"
        >
          <Copy className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP exchange viewer
// ═══════════════════════════════════════════════════════════════════════════

function HttpExchangeView({ exchange }: { exchange: NonNullable<StepDebugIO['httpExchange']> }) {
  return (
    <div className="text-xs font-mono space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="size-3 text-cyan-400" />
        <span className="text-slate-300 font-semibold">HTTP {exchange.method} {exchange.status}</span>
      </div>
      <div className="bg-slate-950/60 rounded p-2 overflow-auto max-h-24">
        <div className="text-cyan-400 truncate">{exchange.requestUrl}</div>
      </div>
      {exchange.requestHeaders && (
        <details className="bg-slate-950/40 rounded p-2">
          <summary className="text-slate-400 cursor-pointer">Request Headers</summary>
          <div className="mt-1 space-y-0.5">
            {Object.entries(exchange.requestHeaders).map(([k, v]) => (
              <div key={k}>
                <span className="text-violet-400">{k}</span>: <span className="text-slate-300">{v}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {exchange.responseHeaders && (
        <details className="bg-slate-950/40 rounded p-2">
          <summary className="text-slate-400 cursor-pointer">Response Headers</summary>
          <div className="mt-1 space-y-0.5">
            {Object.entries(exchange.responseHeaders).map(([k, v]) => (
              <div key={k}>
                <span className="text-cyan-400">{k}</span>: <span className="text-slate-300">{v}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {exchange.responseBodyPreview && (
        <details className="bg-slate-950/40 rounded p-2">
          <summary className="text-slate-400 cursor-pointer">Response Body (preview)</summary>
          <pre className="mt-1 text-slate-300 whitespace-pre-wrap max-h-40 overflow-auto">{exchange.responseBodyPreview}</pre>
        </details>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Step row
// ═══════════════════════════════════════════════════════════════════════════

function StepDebugRow({
  step,
  index,
  isCurrent,
  engine,
}: {
  step: StepDebugIO;
  index: number;
  isCurrent: boolean;
  engine: StepDebuggerEngine;
}) {
  const led = stepStatusToLed(step.status);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border-l-2 cursor-pointer transition-colors ${
        isCurrent
          ? 'border-l-cyan-400 bg-cyan-500/10'
          : 'border-l-transparent hover:bg-white/3'
      }`}
    >
      <span className="text-[10px] font-mono text-slate-500 w-6 shrink-0">
        {String(index + 1).padStart(2, '0')}
      </span>
      <LedBadge status={engine.hasBreakpoint(step.stepId) ? led : led} />
      <span className="text-xs text-slate-300 truncate flex-1">{step.label}</span>
      {engine.hasBreakpoint(step.stepId) && (
        <Bug className="size-3 text-red-400 shrink-0" />
      )}
      {step.durationMs > 0 && (
        <span className="text-[10px] font-mono text-slate-500 shrink-0">
          {step.durationMs}ms
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main panel
// ═══════════════════════════════════════════════════════════════════════════

export interface StepDebuggerPaneProps {
  engine: StepDebuggerEngine;
  /** Высота панели (из bottom drawer). */
  className?: string;
}

type DebugPaneTab = 'steps' | 'variables' | 'http' | 'payload';

export function StepDebuggerPane({ engine, className = '' }: StepDebuggerPaneProps) {
  const [session, setSession] = useState<DebugSessionState>(engine.getState());
  const [activeTab, setActiveTab] = useState<DebugPaneTab>('steps');
  const [payloadEditor, setPayloadEditor] = useState('');

  // Poll engine state
  useEffect(() => {
    const interval = setInterval(() => {
      setSession(engine.getState());
    }, 100);
    return () => clearInterval(interval);
  }, [engine]);

  const currentStep = engine.getCurrentStep();
  const isActive = session.phase !== 'idle';

  const tabs: { id: DebugPaneTab; label: string; count?: number }[] = [
    { id: 'steps', label: 'Шаги', count: session.steps.length },
    { id: 'variables', label: 'Переменные', count: currentStep?.variables?.length },
    { id: 'http', label: 'HTTP' },
    { id: 'payload', label: 'Payload' },
  ];

  return (
    <div className={`flex flex-col h-full bg-[#0a0f18] text-slate-200 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#0c1220]">
        <div className="flex items-center gap-1.5">
          <Bug className="size-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300">Step Debugger</span>
          {isActive && (
            <Badge variant="cyan" className="text-[9px] px-1.5 py-0">
              {session.phase}
            </Badge>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => engine.stepInto()}
            disabled={!isActive || session.phase === 'finished'}
            title="Step Into (F11)"
          >
            <StepForward className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => engine.stepOver()}
            disabled={!isActive || session.phase === 'finished'}
            title="Step Over (F10)"
          >
            <SkipForward className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => engine.continue()}
            disabled={!isActive || session.phase === 'finished'}
            title="Continue (F5)"
          >
            <Play className="size-3 mr-0.5" /> Continue
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
            onClick={() => engine.pause()}
            disabled={session.phase !== 'stepping'}
            title="Pause"
          >
            <Pause className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            onClick={() => engine.stopSession()}
            disabled={!isActive}
            title="Stop (Shift+F5)"
          >
            <Square className="size-3" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/5 bg-[#0a0f18]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-[10px] font-semibold border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-b-cyan-400 text-cyan-400'
                : 'border-b-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-[9px] text-slate-600">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'steps' && (
          <div className="divide-y divide-white/[0.04]">
            {session.steps.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">
                Нет шагов для отладки. Запустите сессию.
              </div>
            ) : (
              session.steps.map((step, idx) => (
                <StepDebugRow
                  key={step.stepId}
                  step={step}
                  index={idx}
                  isCurrent={idx === session.currentStepIndex - 1}
                  engine={engine}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'variables' && (
          <div className="p-2 space-y-0.5">
            {currentStep?.variables?.length ? (
              currentStep.variables.map((v) => <VariableRow key={v.name} variable={v} />)
            ) : (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">
                {currentStep
                  ? 'Нет переменных для этого шага.'
                  : 'Выполните шаг, чтобы увидеть переменные.'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'http' && (
          <div className="p-3">
            {currentStep?.httpExchange ? (
              <HttpExchangeView exchange={currentStep.httpExchange} />
            ) : (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">
                {currentStep
                  ? 'Нет HTTP-обмена для этого шага.'
                  : 'Выполните шаг, чтобы увидеть HTTP-обмен.'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payload' && (
          <div className="p-3 space-y-3">
            {currentStep ? (
              <>
                <div className="text-[10px] text-slate-400 font-semibold">
                  Payload шага
                </div>
                <textarea
                  value={payloadEditor || JSON.stringify(currentStep.payload, null, 2)}
                  onChange={(e) => setPayloadEditor(e.target.value)}
                  className="w-full h-32 bg-slate-950/60 border border-white/10 rounded p-2 text-xs font-mono text-slate-300 focus:border-cyan-500/50 focus:outline-none resize-none"
                  placeholder="{}"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    onClick={() => {
                      try {
                        const newPayload = JSON.parse(payloadEditor);
                        engine.updateStepPayload(currentStep.stepId, newPayload);
                      } catch { /* invalid JSON */ }
                    }}
                  >
                    <RotateCcw className="size-3 mr-1" /> Применить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => {
                      try {
                        const payload = JSON.parse(payloadEditor || JSON.stringify(currentStep.payload));
                        const cmd = engine.replayStep('debug', currentStep.stepId, payload);
                        navigator.clipboard.writeText(cmd).catch(() => {});
                      } catch { /* invalid JSON */ }
                    }}
                  >
                    <Play className="size-3 mr-1" /> Replay с payload
                  </Button>
                </div>
              </>
            ) : (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">
                Выполните шаг, чтобы увидеть payload.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}