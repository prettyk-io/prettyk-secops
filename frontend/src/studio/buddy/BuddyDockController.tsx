/**
 * CO-PILOT META (PoC) BUD-10 — BuddyDockController (интеграция дока в Studio).
 *
 * ЕДИНСТВЕННАЯ точка сборки Boss-движка + live runner + Flash-виджетов.
 *
 * Владеет `BuddyEngine` (с `makeCdpStepRunner(targetUrl)` в конструкторе),
 * подписан на его состояние, мапит состояние → view-пропсы через adapters.ts
 * и рендерит CopilotDock с виджетами по фазе движка. Хоткеи (Enter/Esc/Space)
 * привязаны к Apply/Reject/TakeControl через useBuddyHotkeys.
 *
 * НЕ пишет в workspace напрямую — только прокидывает callbacks (approve/reject),
 * применяемые через engine (см. PO-контракт: до approval workspace не меняется).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuddyEngine, type BuddyEngineState, type BuddyEnginePhase } from '../../buddy/buddyEngine';
import { makeCdpStepRunner } from '../../buddy/cdpStepRunner';
import { CopilotDock, CopilotRail } from './CopilotDock';
import { LaunchpadHero } from './LaunchpadHero';
import { SkeletonCard } from './SkeletonCard';
import { ClarificationChips } from './ClarificationChips';
import { LiveDiffBanner } from './LiveDiffBanner';
import { StepRadar } from './StepRadar';
import { EvidenceMatrix } from './EvidenceMatrix';
import { useBuddyHotkeys } from './buddyHotkeys';
import {
  mapSkeleton,
  mapClarificationResult,
  mapProposalToDiff,
  mapRunToStepRadar,
  mapEvidenceMatrix,
  type BuddyPhase,
} from './adapters';

export interface BuddyDockControllerProps {
  /** Разрешённый тестовый target (для live runner). */
  targetUrl?: string;
  /** Начальная ширина дока (канон 340). */
  width?: number;
  /** Колбэк после approve proposal — прокидывается для интеграции workspace (не PoC-скоп). */
  onApprovedProposal?: (state: BuddyEngineState) => void;
}

/** Map BuddyEnginePhase → BuddyPhase (LED-рельс). */
function toBuddyPhase(phase: BuddyEnginePhase, running: boolean): BuddyPhase {
  if (running) return 'running';
  switch (phase) {
    case 'collecting':
    case 'skeleton':
      return 'idle';
    case 'clarifying':
      return 'waiting';
    case 'proposal':
      return 'thinking';
    case 'approved':
    case 'running':
      return 'running';
    case 'rejected':
      return 'idle';
    case 'finished':
      return 'done';
    default:
      return 'idle';
  }
}

export function BuddyDockController({
  targetUrl = 'https://bank.local',
  width = 340,
  onApprovedProposal,
}: BuddyDockControllerProps) {
  const [expanded, setExpanded] = useState(true);
  const [engineState, setEngineState] = useState<BuddyEngineState>(() => new BuddyEngine().getState());

  // Engine + runner: единственная точка сборки
  const engineRef = useRef<BuddyEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BuddyEngine({
      runner: makeCdpStepRunner(targetUrl),
      maxTimeMs: 60_000,
      maxIterations: 10,
    });
    engineRef.current.subscribe(setEngineState);
  }
  const engine = engineRef.current;

  const phase: BuddyPhase = toBuddyPhase(
    engineState.phase,
    engineState.runState?.phase === 'running',
  );

  // ── callbacks ──

  const submitIntent = useCallback((text: string) => {
    engine.addMessage(text);
  }, [engine]);

  const buildProposal = useCallback(() => {
    engine.buildProposal();
  }, [engine]);

  const approveProposal = useCallback(() => {
    engine.approveProposal();
    onApprovedProposal?.(engine.getState());
  }, [engine, onApprovedProposal]);

  const rejectProposal = useCallback(() => {
    engine.rejectProposal();
  }, [engine]);

  const run = useCallback(() => {
    void engine.run();
  }, [engine]);

  const stopRun = useCallback(() => {
    engine.stopRun();
  }, [engine]);

  // ── view-данные (мапинг Boss → View через adapters) ──

  const skeletonView = useMemo(
    () => (engineState.skeleton ? mapSkeleton(engineState.skeleton, lastIntentText(engineState)) : null),
    [engineState.skeleton, engineState.intent],
  );

  const clarifications = useMemo(
    () => (engineState.clarification ? mapClarificationResult(engineState.clarification) : []),
    [engineState.clarification],
  );

  const diffView = useMemo(
    () => (engineState.proposal ? mapProposalToDiff(engineState.proposal) : null),
    [engineState.proposal],
  );

  const radarView = useMemo(
    () => (engineState.runState && engineState.runState.phase !== 'idle'
      ? mapRunToStepRadar(engineState.runState)
      : null),
    [engineState.runState],
  );

  const evidenceView = useMemo(
    () => (engineState.evidence ? mapEvidenceMatrix(engineState.evidence) : null),
    [engineState.evidence],
  );

  // ── hotkeys ──
  useBuddyHotkeys({
    enabled: expanded,
    onApply: () => {
      if (engineState.phase === 'proposal') approveProposal();
      else if (engineState.phase === 'approved') run();
    },
    onReject: () => {
      if (engineState.phase === 'proposal') rejectProposal();
    },
    onTakeControl: () => {
      if (engineState.runState?.phase === 'running') stopRun();
    },
  });

  // ── render ──

  // Пустой проект → Launchpad Hero (центр)
  if (engineState.phase === 'collecting' && engineState.intent.messages.length === 0) {
    return (
      <div className="shrink-0 flex flex-col overflow-hidden border-l border-slate-700/50 bg-[#0B0F17]" style={{ width }}>
        <LaunchpadHero onSubmitIntent={submitIntent} />
      </div>
    );
  }

  return (
    <CopilotDock
      phase={phase}
      expanded={expanded}
      onToggleExpanded={() => setExpanded(v => !v)}
      title={engineState.status || 'Buddy'}
      width={width}
    >
      {/* Clarification → чипсы */}
      {clarifications.map((c, i) => (
        <ClarificationChips key={i} clarification={c} onSelect={() => { /* ответ чипса в PoC = пересборка */ }} />
      ))}

      {/* Skeleton */}
      {skeletonView && (
        <SkeletonCard skeleton={skeletonView} />
      )}

      {/* LiveDiff (proposal) */}
      {diffView && engineState.phase === 'proposal' && (
        <LiveDiffBanner diff={diffView} onApply={approveProposal} onReject={rejectProposal} />
      )}

      {/* Approved → кнопка Run */}
      {engineState.phase === 'approved' && (
        <button
          onClick={run}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(90deg, #a855f7, #38bdf8)' }}
          data-testid="buddy-run"
        >
          Запустить проверку
        </button>
      )}

      {/* Run → StepRadar */}
      {radarView && (
        <StepRadar state={radarView} onTakeControl={stopRun} />
      )}

      {/* Evidence */}
      {evidenceView && (
        <EvidenceMatrix matrix={evidenceView} />
      )}
    </CopilotDock>
  );
}

/** Последний текст оператора для intent-подписи SkeletonCard. */
function lastIntentText(state: BuddyEngineState): string {
  const last = state.intent.messages[state.intent.messages.length - 1];
  return last?.text ?? '';
}

/** Реэкспорт для тестов и внешней интеграции. */
export { CopilotRail };
