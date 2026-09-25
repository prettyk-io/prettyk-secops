/**
 * BrowserStudioDesk — полноразмерная Студия Записи Браузера (BROWSER-STUDIO-1).
 *
 * Overlay внутри центральной панели поверх Monaco: слева — аспект-fit вьюпорт
 * (BrowserStage embedded), справа — Лента Действий (ActionTape, dock-right
 * как панель DevTools). Каждый CDP-клик/ввод auto-коммитится в
 * ленту как каноничный PrettyK DSL (`stepToDSL`). Сохранение — в текущий
 * сценарий (в конец / в позицию курсора) или в новый сценарий.
 *
 * Выход с несохранённой лентой запрашивает подтверждение.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Film, FolderPlus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ScenarioStepModel } from './scenarioStepModel';
import { stepToDSL } from './scenarioStepModel';
import { useCdpRecorder, type CdpStepResult } from '../terminal/useCdpRecorder';
import { BrowserStage } from '../terminal/BrowserStage';
import { ActionTape } from './ActionTape';
import { getBrowserSession } from './browserSession';
import { runReplay } from '../terminal/replayRunner';
import type { ReplayStepState } from '../terminal/replayRunner';

export interface BrowserStudioDeskProps {
  /** Начать запись сразу после открытия (entry «● Record»). */
  initialRecording?: boolean;
  onClose: () => void;
  /** Записать DSL-строки в активный сценарий редактора. */
  onSaveToCurrent: (lines: string[], position: 'end' | 'cursor') => void;
  /** Создать новый сценарий и записать DSL-строки. Возвращает ошибку или undefined. */
  onSaveToNewScenario: (name: string, lines: string[]) => string | undefined;
}

export function BrowserStudioDesk({
  initialRecording = false,
  onClose,
  onSaveToCurrent,
  onSaveToNewScenario,
}: BrowserStudioDeskProps) {
  const [tapeSteps, setTapeSteps] = useState<ScenarioStepModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState<'current' | 'new'>('current');
  const [savePos, setSavePos] = useState<'end' | 'cursor'>('end');
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // STUDIO-TAPE-OPS: воспроизведение ленты (Replay Tape).
  const [replaying, setReplaying] = useState(false);
  const [replayStates, setReplayStates] = useState<Record<string, ReplayStepState>>({});
  const replayAbortRef = useRef<AbortController | null>(null);
  // Живой статус CDP из синглтона (независимо от observe-режима рекордера).
  const [cdpLive, setCdpLive] = useState(false);

  const exitAfterSaveRef = useRef(false);

  const recorder = useCdpRecorder({
    deckId: 'browser-studio-desk',
    autoCommit: true,
    onStepAccepted: ({ step }: CdpStepResult) => {
      setTapeSteps((prev) => [...prev, step]);
      setDirty(true);
    },
  });

  const stopRecordingRef = useRef(recorder.stopRecording);
  stopRecordingRef.current = recorder.stopRecording;

  // BROWSER-STUDIO-1: «● Record» открывает студию уже в режиме записи.
  useEffect(() => {
    if (initialRecording && !recorder.state.recording) {
      recorder.startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecording]);

  // Остановить наблюдение при размонтировании (симметрично BrowserPanel/Workbench).
  useEffect(() => {
    return () => {
      stopRecordingRef.current();
    };
  }, []);

  // STUDIO-TAPE-OPS: следим за живым статусом CDP (для кнопки «Воспроизвести»).
  // Полинг статуса ведёт BrowserStage (тот же синглтон) — здесь только подписка.
  useEffect(() => {
    const session = getBrowserSession();
    const update = () => setCdpLive(session.getLastStatus()?.connected ?? false);
    update();
    return session.onChange(update);
  }, []);

  const removeStep = useCallback((index: number) => {
    setTapeSteps((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const clearSteps = useCallback(() => {
    setTapeSteps([]);
    setDirty(false);
  }, []);

  // STUDIO-TAPE-OPS: перемещение шага вверх/вниз (без удаления и перезаписи).
  const moveStep = useCallback((index: number, dir: -1 | 1) => {
    setTapeSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    setDirty(true);
  }, []);

  const linesForTape = useCallback(() => tapeSteps.map((s) => stepToDSL(s)), [tapeSteps]);

  // STUDIO-TAPE-OPS: воспроизведение ленты через runReplay + session.executeStep.
  const startTapeReplay = useCallback(async () => {
    if (tapeSteps.length === 0 || replayAbortRef.current) return;
    // Запись временно блокируется на время воспроизведения.
    if (recorder.state.recording) {
      await recorder.stopRecording();
    }

    const abort = new AbortController();
    replayAbortRef.current = abort;
    const idle: Record<string, ReplayStepState> = {};
    for (let i = 0; i < tapeSteps.length; i++) {
      const s = tapeSteps[i]!;
      idle[s.id] = { stepId: s.id, index: i, status: 'idle' };
    }
    setReplayStates(idle);
    setReplaying(true);

    const session = getBrowserSession();
    const result = await runReplay(
      tapeSteps,
      (step, signal) => session.executeStep(step, signal),
      {
        signal: abort.signal,
        stepDelayMs: 600,
        onStepState: (st) => {
          setReplayStates((prev) => ({ ...prev, [st.stepId]: st }));
        },
      },
    );

    if (result.aborted) {
      // «Остановить» оставил текущий шаг в running — сбрасываем статусы в idle.
      setReplayStates((prev) => {
        const reset: Record<string, ReplayStepState> = {};
        for (const s of tapeSteps) {
          reset[s.id] = { stepId: s.id, index: prev[s.id]?.index ?? 0, status: 'idle' };
        }
        return reset;
      });
    }

    setReplaying(false);
    replayAbortRef.current = null;
  }, [tapeSteps, recorder]);

  const stopReplay = useCallback(() => {
    replayAbortRef.current?.abort();
  }, []);

  const requestClose = useCallback(() => {
    if (dirty && tapeSteps.length > 0) {
      setExitPromptOpen(true);
      return;
    }
    onClose();
  }, [dirty, tapeSteps.length, onClose]);

  const doSave = useCallback(() => {
    const lines = linesForTape();
    if (lines.length === 0) return;

    if (saveTarget === 'current') {
      onSaveToCurrent(lines, savePos);
    } else {
      const normalized = newName.trim();
      if (!normalized) {
        setNewNameError('Введите имя сценария');
        return;
      }
      const err = onSaveToNewScenario(normalized, lines);
      if (err) {
        setNewNameError(err);
        return;
      }
    }

    setDirty(false);
    setSaveOpen(false);
    setNewNameError(null);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);

    if (exitAfterSaveRef.current) {
      exitAfterSaveRef.current = false;
      onClose();
    }
  }, [linesForTape, saveTarget, savePos, newName, onSaveToCurrent, onSaveToNewScenario, onClose]);

  const requestSave = useCallback(() => {
    setSaveTarget('current');
    setSavePos('end');
    setNewName('');
    setNewNameError(null);
    setSaveOpen(true);
  }, []);

  const stageMode = recorder.state.recording ? 'record' : 'author';

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: '#080c14', color: '#e2e8f0', fontFamily: 'Golos UI, sans-serif' }}
    >
      {/* Header */}
      <div className="h-11 px-3 shrink-0 flex items-center gap-2" style={{ borderBottom: '1px solid #1e293b', background: '#0b101c' }}>
        <Film className="size-4" style={{ color: '#22d3ee' }} />
        <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Browser Studio</span>
        {/* DESK-LIVE-BADGE: источник — живая сессия (`cdpLive`), а не `recorder.state.cdpConnected`:
            рекордер обновляет connected только в режиме записи, в author-режиме бейдж/баннер врали. */}
        <span
          data-testid="desk-connection-badge"
          data-connected={cdpLive ? 'true' : 'false'}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
          style={cdpLive
            ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
            : { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="size-1.5 rounded-full" style={{ background: cdpLive ? '#22c55e' : '#ef4444' }} />
          {cdpLive ? 'браузер подключён' : 'браузер не подключён'}
        </span>
        {savedFlash && (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#4ade80' }}>
            <Check className="size-3" /> Сохранено
          </span>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" style={{ borderColor: '#22c55e', color: '#4ade80' }} onClick={requestSave} disabled={tapeSteps.length === 0} title="Сохранить ленту в сценарий">
          <Save className="size-3" /> Сохранить
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={requestClose} title="Вернуться в код">
          <X className="size-3" /> Вернуться в код
        </Button>
      </div>

      {/* Body: viewport (left, flex-1) + tape (right, dock-right как DevTools) */}
      <div className="flex-1 min-h-0 flex flex-row">
        {/* VFILL: flex-колонка, иначе flex-1/min-h-0 стейджа не действуют (block-контейнер)
            → вьюпорт схлопывался до контента, полоса режимов висела в середине. */}
        <div
          data-testid="browser-studio-stage-column"
          className="flex-1 min-w-0 flex flex-col min-h-0"
        >
          <BrowserStage
            mode={stageMode}
            onModeChange={(m) => {
              if (replaying) return; // запись заблокирована на время воспроизведения
              if (m === 'record') recorder.startRecording();
              else recorder.stopRecording();
            }}
            targetUrl="http://juice-shop:3000"
            embedded
            fullscreen={false}
            onToggleFullscreen={() => {}}
            cdpConnected={cdpLive}
            cdpObserving={recorder.state.recording}
            recorderError={recorder.state.error}
          />
        </div>
        <div className="w-[380px] shrink-0 h-full border-l border-white/10">
          <ActionTape
            steps={tapeSteps}
            recording={recorder.state.recording}
            cdpConnected={cdpLive}
            replayEnabled={tapeSteps.length > 0 && cdpLive}
            replaying={replaying}
            replayStates={replayStates}
            onRemoveStep={removeStep}
            onMoveStep={moveStep}
            onClear={clearSteps}
            onSave={requestSave}
            onReplay={startTapeReplay}
            onStopReplay={stopReplay}
          />
        </div>
      </div>

      {/* Save dialog */}
      {saveOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="flex flex-col w-full max-w-md rounded-lg border border-slate-700 bg-[#0b101c] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-slate-700/60">
              <Save className="size-4" style={{ color: '#4ade80' }} />
              <span className="text-sm font-semibold text-slate-200">Сохранить в сценарий</span>
              <button onClick={() => setSaveOpen(false)} aria-label="Закрыть" className="ml-auto p-1 rounded hover:bg-white/5 text-slate-400 text-[16px] leading-none">&times;</button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setSaveTarget('current')}
                  className={`flex-1 px-2 py-2 rounded text-[11px] font-semibold border ${saveTarget === 'current' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}
                >
                  В текущий сценарий
                </button>
                <button
                  onClick={() => setSaveTarget('new')}
                  className={`flex-1 px-2 py-2 rounded text-[11px] font-semibold border ${saveTarget === 'new' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}
                >
                  <FolderPlus className="size-3 inline mr-1" /> Новый сценарий
                </button>
              </div>

              {saveTarget === 'current' ? (
                <div className="flex gap-2">
                  <button onClick={() => setSavePos('end')} className={`flex-1 px-2 py-1.5 rounded text-[10px] font-semibold border ${savePos === 'end' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>В конец</button>
                  <button onClick={() => setSavePos('cursor')} className={`flex-1 px-2 py-1.5 rounded text-[10px] font-semibold border ${savePos === 'cursor' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>В позицию курсора</button>
                </div>
              ) : (
                <div>
                  <Input
                    value={newName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewName(e.target.value); setNewNameError(null); }}
                    placeholder="имя_сценария (python-id)"
                    className="h-8 text-xs"
                    style={{ background: '#09090b', borderColor: newNameError ? '#ef4444' : '#1e293b', color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  {newNameError && <p className="mt-1 text-[10px]" style={{ color: '#f87171' }}>{newNameError}</p>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-t border-slate-700/60">
              <span className="text-[10px] text-slate-500 flex-1">{tapeSteps.length} шагов</span>
              <button onClick={() => setSaveOpen(false)} className="px-3 h-8 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200">Отмена</button>
              <button onClick={doSave} className="px-3 h-8 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/20">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Exit warning */}
      {exitPromptOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="flex flex-col w-full max-w-sm rounded-lg border border-amber-500/30 bg-[#0b101c] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-slate-700/60">
              <AlertTriangle className="size-4" style={{ color: '#f59e0b' }} />
              <span className="text-sm font-semibold text-slate-200">Несохранённые шаги</span>
            </div>
            <p className="px-4 py-3 text-[11px] text-slate-400">В ленте есть {tapeSteps.length} несохранённых шагов. Сохранить их в сценарий перед выходом?</p>
            <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-t border-slate-700/60">
              <button onClick={() => setExitPromptOpen(false)} className="px-3 h-8 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200">Отмена</button>
              <button onClick={() => { exitAfterSaveRef.current = true; setExitPromptOpen(false); requestSave(); }} className="px-3 h-8 rounded text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/20">Сохранить и выйти</button>
              <button onClick={onClose} className="px-3 h-8 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200">Выйти без сохранения</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}