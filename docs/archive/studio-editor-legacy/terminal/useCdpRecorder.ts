/**
 * POC-CDP-1/2/3/4/5: CDP Recorder hook.
 *
 * Polls /api/browser/observe/event for live CDP click observations,
 * converts them to DSL proposals, manages Accept/Reject, and creates
 * canonical steps with single identity for Studio + Editor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CdpObservation } from '../studio/browserSession';
import { getBrowserSession } from '../studio/browserSession';
import type { DiscoveryLocator, DSLProposal } from './DiscoveryOverlay';
import type { ScenarioStepModel, ActionKind, StrategyKind } from '../studio/scenarioStepModel';
import { SECRET_PLACEHOLDER, VALUE_PLACEHOLDER } from './redact';

let _cdpStepCounter = 0;
function cdpStepId(): string { _cdpStepCounter++; return `cdp-step-${Date.now()}-${_cdpStepCounter}`; }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CdpRecorderState {
  /** Recording active? */
  recording: boolean;
  /** Last CDP observation (real event from browser). */
  lastObservation: CdpObservation | null;
  /** Converted to DiscoveryLocator for overlay rendering. */
  locator: DiscoveryLocator | null;
  /** Pending proposal (waiting for Accept/Reject). */
  proposal: DSLProposal | null;
  /** Error / disconnected state. */
  error: string | null;
  /** CDP connected? */
  cdpConnected: boolean;
  /** Is step blocked by ambiguity? */
  ambiguous: boolean;
}

export interface CdpStepResult {
  /** The canonical step created after Accept. */
  step: ScenarioStepModel;
  /** Provenance marker for Editor DSL. */
  provenance: string;
  /** Event ID for traceability. */
  eventId: string;
}

export interface UseCdpRecorderOptions {
  /** Which scenario deck to add steps to. */
  deckId: string;
  /** Called when a canonical step is created (for Studio StepPill + Editor DSL). */
  onStepAccepted?: (result: CdpStepResult) => void;
  /** Called when proposal is rejected. */
  onStepRejected?: () => void;
  /** Existing step DSL lines for duplicate detection. */
  existingDslLines?: string[];
  /** Existing manual locators (for manual trust: don't overwrite). */
  existingManualLocators?: Set<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_TO_STRATEGY: Record<string, StrategyKind> = {
  button: 'role',
  link: 'role',
  textbox: 'role',
  searchbox: 'role',
  combobox: 'role',
  checkbox: 'role',
  radio: 'role',
};

/** Build DiscoveryLocator from CDP observation. */
export function observationToLocator(obs: CdpObservation): DiscoveryLocator {
  const bestCandidate = obs.candidates?.[0];
  const tier = (bestCandidate?.tier as DiscoveryLocator['tier']) || 'T4';
  const pwLocator = bestCandidate?.value || `css ${obs.element.tag}`;
  return {
    role: obs.element.role || obs.element.tag,
    name: obs.element.accessibleName || obs.element.text || obs.element.tag,
    tier,
    pwLocator,
    cssSelector: obs.element.id ? `#${obs.element.id}` : obs.element.tag,
    position: {
      x: obs.element.rect.x,
      y: obs.element.rect.y,
      w: obs.element.rect.w,
      h: obs.element.rect.h,
    },
  };
}

/** Determine ActionKind from observation. */
export function observationToAction(obs: CdpObservation): ActionKind {
  if (obs.action === 'type') return 'Type';
  const role = (obs.element.role || '').toLowerCase();
  if (role === 'textbox' || role === 'searchbox') return 'Type';
  return 'Click';
}

/** Determine StrategyKind from observation. */
export function observationToStrategy(obs: CdpObservation): StrategyKind {
  const role = (obs.element.role || '').toLowerCase();
  return ROLE_TO_STRATEGY[role] || 'css';
}

/** Build DSL proposal string. */
export function observationToDsl(obs: CdpObservation): string {
  const action = observationToAction(obs);
  const strategy = observationToStrategy(obs);
  const name = obs.element.accessibleName || obs.element.text || obs.element.tag;

  if (action === 'Type') {
    // POC-CDP-5: plaintext never enters wire. Secret → $secret, else → $value reference.
    const val = obs.valueClass === 'secret' ? SECRET_PLACEHOLDER : VALUE_PLACEHOLDER;
    return `Type ${strategy}="${name}" ${val}`.trim();
  }
  return `Click ${strategy}="${name}"`.trim();
}

/** Build provenance marker for Editor DSL. */
export function buildProvenance(obs: CdpObservation): string {
  const tier = obs.candidates?.[0]?.tier || 'T4';
  const source = obs.candidates?.[0]?.kind || 'fallback';
  return `✨ Discovered ${tier} ${source}`;
}

/** Build ScenarioStepModel from observation. */
export function observationToStep(obs: CdpObservation): ScenarioStepModel {
  const action = observationToAction(obs);
  const strategy = observationToStrategy(obs);
  const strategyValue = obs.element.accessibleName || obs.element.text || obs.element.tag;
  // POC-CDP-5: payload never carries plaintext — Type carries a $reference.
  const payload = action === 'Type'
    ? (obs.valueClass === 'secret' ? SECRET_PLACEHOLDER : VALUE_PLACEHOLDER)
    : '';
  return {
    id: cdpStepId(),
    action,
    strategy,
    strategyValue,
    payload,
    continueOnError: false,
    led: 'predicted',
    debugResult: null,
  };
}

/** Gate decision for a single observation (pure, testable). */
export interface ObservationGateDecision {
  /** Apply the proposal? */
  apply: boolean;
  /** Is ambiguous (review needed)? */
  ambiguous: boolean;
  /** Is a duplicate event (already accepted)? */
  duplicate: boolean;
  /** Is a duplicate DSL (already in scenario)? */
  duplicateDsl: boolean;
  /** Is a manual locator that must not be overwritten? */
  manualTrust: boolean;
}

export function decideObservation(
  obs: CdpObservation,
  args: {
    acceptedEventIds: Set<string>;
    existingDslLines: string[];
    manualLocators?: Set<string>;
  },
): ObservationGateDecision {
  const dsl = observationToDsl(obs);
  const strategyValue = obs.element.accessibleName || obs.element.text || obs.element.tag;

  const duplicate = args.acceptedEventIds.has(obs.eventId);
  const duplicateDsl = args.existingDslLines.includes(dsl);
  const manualTrust = args.manualLocators?.has(strategyValue) ?? false;

  if (obs.isAmbiguous) {
    return { apply: false, ambiguous: true, duplicate, duplicateDsl, manualTrust };
  }
  if (duplicate) {
    return { apply: false, ambiguous: false, duplicate: true, duplicateDsl, manualTrust };
  }
  if (manualTrust) {
    return { apply: false, ambiguous: false, duplicate, duplicateDsl, manualTrust: true };
  }
  if (duplicateDsl) {
    return { apply: false, ambiguous: false, duplicate, duplicateDsl: true, manualTrust };
  }
  return { apply: true, ambiguous: false, duplicate: false, duplicateDsl: false, manualTrust: false };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 250; // fast poll for PoC — lower latency

export function useCdpRecorder(options: UseCdpRecorderOptions) {
  const { deckId, onStepAccepted, onStepRejected, existingDslLines = [], existingManualLocators } = options;

  const [state, setState] = useState<CdpRecorderState>({
    recording: false,
    lastObservation: null,
    locator: null,
    proposal: null,
    error: null,
    cdpConnected: false,
    ambiguous: false,
  });

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptedEventIds = useRef<Set<string>>(new Set());
  const onStepAcceptedRef = useRef(onStepAccepted);
  onStepAcceptedRef.current = onStepAccepted;
  const onStepRejectedRef = useRef(onStepRejected);
  onStepRejectedRef.current = onStepRejected;
  const existingDslLinesRef = useRef(existingDslLines);
  existingDslLinesRef.current = existingDslLines;
  const existingManualLocatorsRef = useRef(existingManualLocators);
  existingManualLocatorsRef.current = existingManualLocators;

  // ── Start recording ──
  const startRecording = useCallback(async () => {
    const session = getBrowserSession();
    const result = await session.startObserve();
    if (!result.ok) {
      setState(s => ({ ...s, error: result.error || 'CDP observe start failed', cdpConnected: false }));
      return;
    }
    acceptedEventIds.current.clear();
    setState(s => ({
      ...s,
      recording: true,
      error: null,
      proposal: null,
      locator: null,
      lastObservation: null,
      cdpConnected: true,
      ambiguous: false,
    }));
  }, []);

  // ── Stop recording ──
  const stopRecording = useCallback(async () => {
    const session = getBrowserSession();
    await session.stopObserve();
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setState(s => ({
      ...s,
      recording: false,
      error: null,
      proposal: null,
      locator: null,
      lastObservation: null,
      cdpConnected: false,
      ambiguous: false,
    }));
  }, []);

  // ── Process one observation ──
  const processObservation = useCallback((obs: CdpObservation) => {
    const decision = decideObservation(obs, {
      acceptedEventIds: acceptedEventIds.current,
      existingDslLines: existingDslLinesRef.current,
      manualLocators: existingManualLocatorsRef.current,
    });

    // Gate: ambiguous locator blocks auto-apply (POC-CDP-2)
    if (decision.ambiguous) {
      const locator = observationToLocator(obs);
      setState(s => ({
        ...s,
        lastObservation: obs,
        locator,
        proposal: null,
        ambiguous: true,
      }));
      return;
    }

    // Gate: duplicate event / duplicate DSL / manual trust (POC-CDP-5)
    if (!decision.apply) return;

    const dsl = observationToDsl(obs);
    const locator = observationToLocator(obs);
    const proposal: DSLProposal = {
      dsl,
      action: 'add_step',
      source: locator,
    };

    setState(s => ({
      ...s,
      lastObservation: obs,
      locator,
      proposal,
      ambiguous: false,
    }));
  }, []);

  // ── Accept proposal (POC-CDP-3) ──
  const acceptProposal = useCallback(() => {
    const obs = state.lastObservation;
    if (!obs) return;

    acceptedEventIds.current.add(obs.eventId);

    const step = observationToStep(obs);
    const provenance = buildProvenance(obs);

    onStepAcceptedRef.current?.({
      step,
      provenance,
      eventId: obs.eventId,
    });

    setState(s => ({ ...s, proposal: null, locator: null, ambiguous: false }));
  }, [state.lastObservation]);

  // ── Reject proposal (POC-CDP-3) ──
  const rejectProposal = useCallback(() => {
    onStepRejectedRef.current?.();
    setState(s => ({ ...s, proposal: null, locator: null, ambiguous: false }));
  }, []);

  // ── Polling effect ──
  useEffect(() => {
    if (!state.recording) return;

    const session = getBrowserSession();
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      // Don't poll while a proposal is pending
      if (state.proposal) return;

      const result = await session.getObservedEvent();
      if (stopped) return;

      if (!result.ok || !result.connected) {
        setState(s => ({
          ...s,
          cdpConnected: false,
          error: result.connected === false ? 'CDP disconnected' : 'Observe API error',
        }));
        return;
      }

      setState(s => (s.cdpConnected ? s : { ...s, cdpConnected: true, error: null }));

      if (result.event) {
        processObservation(result.event);
      }
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [state.recording, state.proposal, processObservation]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    acceptProposal,
    rejectProposal,
  };
}