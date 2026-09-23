/**
 * BrowserStudioDesk — полноразмерная Студия Записи Браузера (BROWSER-STUDIO-1).
 *
 * Overlay поверх Monaco: верх — аспект-fit вьюпорт (BrowserStage embedded),
 * низ — Лента Действий (ActionTape). Каждый CDP-клик/ввод auto-коммитится в
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

  const removeStep = useCallback((index: number) => {
    setTapeSteps((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const clearSteps = useCallback(() => {
    setTapeSteps([]);
    setDirty(false);
  }, []);

  const linesForTape = useCallback(() => tapeSteps.map((s) => stepToDSL(s)), [tapeSteps]);

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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#080c14', color: '#e2e8f0', fontFamily: 'Golos UI, sans-serif' }}>
      {/* Header */}
      <div className="h-11 px-3 shrink-0 flex items-center gap-2" style={{ borderBottom: '1px solid #1e293b', background: '#0b101c' }}>
        <Film className="size-4" style={{ color: '#22d3ee' }} />
        <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Browser Studio</span>
        <span
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
          style={recorder.state.cdpConnected
            ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
            : { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="size-1.5 rounded-full" style={{ background: recorder.state.cdpConnected ? '#22c55e' : '#ef4444' }} />
          {recorder.state.cdpConnected ? 'браузер подключён' : 'браузер не подключён'}
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

      {/* Body: viewport (top) + tape (bottom) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex">
          <BrowserStage
            mode={stageMode}
            onModeChange={(m) => {
              if (m === 'record') recorder.startRecording();
              else recorder.stopRecording();
            }}
            targetUrl="http://juice-shop:3000"
            embedded
            fullscreen={false}
            onToggleFullscreen={() => {}}
            cdpConnected={recorder.state.cdpConnected}
            cdpObserving={recorder.state.recording}
            recorderError={recorder.state.error}
          />
        </div>
        <div className="h-[40%] min-h-[180px] shrink-0" style={{ borderTop: '1px solid #1e293b' }}>
          <ActionTape
            steps={tapeSteps}
            recording={recorder.state.recording}
            cdpConnected={recorder.state.cdpConnected}
            onRemoveStep={removeStep}
            onClear={clearSteps}
            onSave={requestSave}
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