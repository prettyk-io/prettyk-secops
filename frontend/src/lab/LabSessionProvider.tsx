import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LabGrepRule, LabResultItem } from './labApi';

let _seq = 0;

function uid(): string {
  _seq += 1;
  return `lab_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export type AttackMode = 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb';

export interface ParsedTarget {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  raw: string;
}

export interface PositionMarker {
  id: string;
  name: string;
  value: string;
  start: number;
  end: number;
}

export interface PayloadSetConfig {
  positionId: string;
  positionName: string;
  kind: 'preset' | 'custom' | 'numbers' | 'bruteforce';
  presetKey?: string;
  customItems: string[];
  numberStart: number;
  numberStop: number;
  numberStep: number;
  bruteCharset: string;
  bruteMinLen: number;
  bruteMaxLen: number;
  encoders: string[];
  prefix: string;
  suffix: string;
}

export interface AttackConfig {
  attackId: string;
  rawHttp: string;
  parsedTarget: ParsedTarget | null;
  markers: PositionMarker[];
  attackMode: AttackMode;
  payloadSets: PayloadSetConfig[];
  grepMatchPattern: string;
  grepExtractPattern: string;
}

export type LabView = 'wizard' | 'suite' | 'history' | 'templates' | 'settings';

export interface LabSessionState {
  instanceId: string;
  view: LabView;
  singleAttack: AttackConfig;
  suiteAttacks: AttackConfig[];
  isRunning: boolean;
  attackId: string | null;
  progress: { completed: number; total: number };
  results: LabResultItem[];
}

const EMPTY_ATTACK: AttackConfig = {
  attackId: '',
  rawHttp: '',
  parsedTarget: null,
  markers: [],
  attackMode: 'sniper',
  payloadSets: [],
  grepMatchPattern: '',
  grepExtractPattern: '',
};

function makeAttackConfig(): AttackConfig {
  return { ...EMPTY_ATTACK, attackId: uid() };
}

interface LabSessionContextValue {
  session: LabSessionState;
  setView: (v: LabView) => void;
  updateAttack: (patch: Partial<AttackConfig>) => void;
  resetAttack: () => void;
  setRunning: (running: boolean) => void;
  setAttackId: (id: string | null) => void;
  setProgress: (p: { completed: number; total: number }) => void;
  setResults: (r: LabResultItem[]) => void;
  addToSuite: (config: AttackConfig) => void;
  removeFromSuite: (idx: number) => void;
  reorderSuite: (from: number, to: number) => void;
  clearSuite: () => void;
}

const LabSessionContext = createContext<LabSessionContextValue | null>(null);

export function useLabSession(): LabSessionContextValue {
  const ctx = useContext(LabSessionContext);
  if (!ctx) throw new Error('useLabSession must be used within LabSessionProvider');
  return ctx;
}

export function LabSessionProvider({ children }: { children: ReactNode }) {
  const instanceId = useMemo(() => uid(), []);
  const [view, setView] = useState<LabView>('wizard');
  const [singleAttack, setSingleAttack] = useState<AttackConfig>(makeAttackConfig);
  const [suiteAttacks, setSuiteAttacks] = useState<AttackConfig[]>([]);
  const [isRunning, setRunning] = useState(false);
  const [attackId, setAttackId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<LabResultItem[]>([]);

  const updateAttack = useCallback((patch: Partial<AttackConfig>) => {
    setSingleAttack((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetAttack = useCallback(() => {
    setSingleAttack(makeAttackConfig());
  }, []);

  const addToSuite = useCallback((config: AttackConfig) => {
    setSuiteAttacks((prev) => [...prev, { ...config, attackId: uid() }]);
  }, []);

  const removeFromSuite = useCallback((idx: number) => {
    setSuiteAttacks((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const reorderSuite = useCallback((from: number, to: number) => {
    setSuiteAttacks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const clearSuite = useCallback(() => {
    setSuiteAttacks([]);
  }, []);

  const session = useMemo<LabSessionState>(() => ({
    instanceId,
    view,
    singleAttack,
    suiteAttacks,
    isRunning,
    attackId,
    progress,
    results,
  }), [instanceId, view, singleAttack, suiteAttacks, isRunning, attackId, progress, results]);

  const value = useMemo<LabSessionContextValue>(() => ({
    session,
    setView,
    updateAttack,
    resetAttack,
    setRunning,
    setAttackId,
    setProgress,
    setResults,
    addToSuite,
    removeFromSuite,
    reorderSuite,
    clearSuite,
  }), [session, updateAttack, resetAttack, addToSuite, removeFromSuite, reorderSuite, clearSuite]);

  return (
    <LabSessionContext.Provider value={value}>
      {children}
    </LabSessionContext.Provider>
  );
}