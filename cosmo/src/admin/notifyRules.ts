/**
 * ADM-NOTIFY: оповещения Admin — смысл portal notifications as-is.
 * Тип · Заголовок · Адресаты (Команда = код приложения + роль) · Окно · Вкл.
 * Хранилище localStorage (как остальной Admin); live-сигналы из checks/evidence/deploys,
 * чтобы секция показывала «что реально сработало бы сейчас», а не только CRUD.
 */

import type { CheckInstance } from '../checks/types';
import type { CheckEvidenceRefs } from './evidenceTypes';
import { toneFromVerdict } from './adminGateUi';
import type { AdminWaiver, BankDeploy, DeployCheckLink } from './types';
import { summarizeWaiversExpiry } from './waiverExpiry';

export type NotifyChannel = 'gui' | 'email';

/** Команда адресатов = код приложения (project_id) + роль. */
export type NotifyRecipientTeam = {
  app_code: string;
  role: string;
};

export type NotifyRuleKind =
  | 'run_result'
  | 'gate_change'
  | 'waiver_expiry'
  | 'new_evidence'
  | 'dojo_drift';

export type NotifyRule = {
  id: string;
  kind: NotifyRuleKind;
  title: string;
  teams: NotifyRecipientTeam[];
  channels: NotifyChannel[];
  window_days: 7 | 30;
  enabled: boolean;
  created_at: string;
};

export const NOTIFY_KIND_LABEL: Record<NotifyRuleKind, string> = {
  run_result: 'Результат запуска',
  gate_change: 'Смена гейта',
  waiver_expiry: 'Истечение waiver',
  new_evidence: 'Новые доказательства',
  dojo_drift: 'Dojo drift (Critical/High)',
};

export const NOTIFY_ROLE_OPTIONS = [
  { value: 'Владелец приложения', label: 'Владелец приложения' },
  { value: 'SecOps', label: 'SecOps' },
  { value: 'Разработчик', label: 'Разработчик' },
];

export const NOTIFY_CHANNEL_LABEL: Record<NotifyChannel, string> = {
  gui: 'GUI',
  email: 'Email',
};

const NOTIFY_KEY = 'pk.admin.notify_rules.v1';

type Snapshot = { version: 1; rules: NotifyRule[] };

export function generateNotifyId(): string {
  return `n-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function readRaw(): string | undefined {
  try {
    return window.localStorage.getItem(NOTIFY_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeRaw(value: string): void {
  try {
    window.localStorage.setItem(NOTIFY_KEY, value);
  } catch {
    /* ignore */
  }
}

function loadSnapshot(): Snapshot {
  const raw = readRaw();
  if (!raw) {
    return { version: 1, rules: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed?.version === 1 && Array.isArray(parsed.rules)) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return { version: 1, rules: [] };
}

function saveSnapshot(snap: Snapshot): void {
  writeRaw(JSON.stringify(snap));
}

export function listNotifyRules(): NotifyRule[] {
  return loadSnapshot().rules;
}

export function upsertNotifyRule(
  input: Omit<NotifyRule, 'id' | 'created_at'>,
): NotifyRule {
  const snap = loadSnapshot();
  const rule: NotifyRule = {
    ...input,
    id: generateNotifyId(),
    created_at: new Date().toISOString(),
  };
  snap.rules = [...snap.rules, rule];
  saveSnapshot(snap);
  return rule;
}

export function setNotifyRuleEnabled(id: string, enabled: boolean): void {
  const snap = loadSnapshot();
  snap.rules = snap.rules.map((r) => (r.id === id ? { ...r, enabled } : r));
  saveSnapshot(snap);
}

export function deleteNotifyRule(id: string): void {
  const snap = loadSnapshot();
  snap.rules = snap.rules.filter((r) => r.id !== id);
  saveSnapshot(snap);
}

/* ------------------------------------------------------------------ */
/* Live-сигналы: что в данных программы сейчас триггерило бы правила.  */
/* ------------------------------------------------------------------ */

export type NotifySignal = {
  key: string;
  kind: NotifyRuleKind;
  title: string;
  app_code?: string;
  at: string;
  tone: 'error' | 'warning' | 'info';
};

export type CollectNotifySignalInput = {
  checks?: readonly CheckInstance[];
  deploys?: readonly BankDeploy[];
  evidence?: readonly CheckEvidenceRefs[];
  waivers?: readonly AdminWaiver[];
  /** check_id → deploy link, для app_code у run-сигналов. */
  links?: readonly DeployCheckLink[];
  nowMs?: number;
};

function appCodeForDeploy(
  deploys: readonly BankDeploy[],
  deployId: string | undefined,
): string | undefined {
  if (!deployId) return undefined;
  const dep = deploys.find((d) => d.deploy_id === deployId);
  return dep?.project_id;
}

/** Run-level signal: failed status или fail-вердикт в окне nowMs - windowDays. */
function runResultSignals(
  checks: readonly CheckInstance[],
  deploys: readonly BankDeploy[],
  linkByCheck: Map<string, string>,
  nowMs: number,
  windowDays: number,
): NotifySignal[] {
  const floor = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const signals: NotifySignal[] = [];
  for (const check of checks) {
    for (const run of check.runs ?? []) {
      const raw = run.ended_at || run.started_at;
      const t = raw ? Date.parse(raw) : Number.NaN;
      if (!Number.isFinite(t) || t < floor) continue;
      const tone = toneFromVerdict(run.ci_verdict);
      if (tone !== 'fail' && run.status !== 'failed') continue;
      const appCode = appCodeForDeploy(
        deploys,
        linkByCheck.get(check.check_id),
      );
      signals.push({
        key: `run:${check.check_id}:${run.run_id}`,
        kind: 'run_result',
        title: check.title || check.check_id,
        app_code: appCode,
        at: raw ?? '',
        tone: 'error',
      });
    }
  }
  return signals;
}

function gateChangeSignals(
  deploys: readonly BankDeploy[],
): NotifySignal[] {
  const signals: NotifySignal[] = [];
  for (const d of deploys) {
    if (d.last_gate === 'fail') {
      signals.push({
        key: `gate:${d.deploy_id}:fail`,
        kind: 'gate_change',
        title: `${d.application_name || d.deploy_id} — FAIL`,
        app_code: d.project_id,
        at: d.deployed_at ?? '',
        tone: 'error',
      });
    } else if (d.last_gate === 'watch') {
      signals.push({
        key: `gate:${d.deploy_id}:watch`,
        kind: 'gate_change',
        title: `${d.application_name || d.deploy_id} — WATCH`,
        app_code: d.project_id,
        at: d.deployed_at ?? '',
        tone: 'warning',
      });
    }
  }
  return signals;
}

function waiverSignals(
  waivers: readonly AdminWaiver[] | undefined,
  nowMs: number,
): NotifySignal[] {
  const summary = summarizeWaiversExpiry(waivers, nowMs);
  return [
    ...summary.expired.map((w) => ({
      key: `waiver:${w.title}:expired`,
      kind: 'waiver_expiry' as const,
      title: `${w.title} — истёк`,
      at: w.expires_at ?? '',
      tone: 'error' as const,
    })),
    ...summary.soon.map((w) => ({
      key: `waiver:${w.title}:soon`,
      kind: 'waiver_expiry' as const,
      title: `${w.title} — через ${w.daysLeft} д.`,
      at: w.expires_at ?? '',
      tone: 'warning' as const,
    })),
  ];
}

function evidenceSignals(
  evidence: readonly CheckEvidenceRefs[],
  nowMs: number,
  windowDays: number,
): NotifySignal[] {
  const floor = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const byCheck = new Map<string, CheckEvidenceRefs>();
  for (const refs of evidence) {
    const prev = byCheck.get(refs.check_id);
    if (!prev || String(refs.updated_at ?? '').localeCompare(String(prev.updated_at ?? '')) >= 0) {
      byCheck.set(refs.check_id, refs);
    }
  }
  const signals: NotifySignal[] = [];
  for (const refs of byCheck.values()) {
    const raw = refs.updated_at;
    if (!raw) continue;
    const t = Date.parse(raw);
    if (!Number.isFinite(t) || t < floor) continue;
    signals.push({
      key: `evidence:${refs.check_id}:${raw}`,
      kind: 'new_evidence',
      title: `Новые доказательства · ${refs.check_id}`,
      at: raw,
      tone: 'info',
    });
  }
  return signals;
}

function dojoDriftSignals(
  evidence: readonly CheckEvidenceRefs[],
  nowMs: number,
  windowDays: number,
): NotifySignal[] {
  const floor = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const signals: NotifySignal[] = [];
  for (const refs of evidence) {
    const stats = refs.dojo?.stats;
    if (!stats) continue;
    const critical = Number(stats.critical || 0);
    const high = Number(stats.high || 0);
    if (critical === 0 && high === 0) continue;
    const raw = refs.updated_at;
    if (raw) {
      const t = Date.parse(raw);
      if (!Number.isFinite(t) || t < floor) continue;
    }
    const key = `dojo_drift:${refs.check_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push({
      key,
      kind: 'dojo_drift',
      title: `${refs.check_id} — Dojo C ${critical} / H ${high}`,
      at: raw ?? '',
      tone: critical > 0 ? 'error' : 'warning',
    });
  }
  return signals;
}

export function collectNotifySignals(
  input: CollectNotifySignalInput = {},
): NotifySignal[] {
  const nowMs = input.nowMs ?? Date.now();
  const checks = input.checks ?? [];
  const deploys = input.deploys ?? [];
  const linkByCheck = new Map<string, string>();
  for (const link of input.links ?? []) {
    if (!linkByCheck.has(link.check_id)) {
      linkByCheck.set(link.check_id, link.deploy_id);
    }
  }
  const signals = [
    ...runResultSignals(checks, deploys, linkByCheck, nowMs, 30),
    ...gateChangeSignals(deploys),
    ...waiverSignals(input.waivers, nowMs),
    ...evidenceSignals(input.evidence ?? [], nowMs, 30),
    ...dojoDriftSignals(input.evidence ?? [], nowMs, 30),
  ];
  return signals.sort((a, b) => b.at.localeCompare(a.at));
}

function signalMatchesRule(rule: NotifyRule, signal: NotifySignal): boolean {
  if (rule.kind !== signal.kind) return false;
  if (rule.teams.length === 0 || !signal.app_code) return true;
  return rule.teams.some((t) => t.app_code === signal.app_code);
}

export type NotifyFiring = {
  rule: NotifyRule;
  signals: NotifySignal[];
};

/** Enabled rules + сигналы, которые сработали бы сейчас. */
export function deriveNotifyFirings(
  rules: readonly NotifyRule[],
  signals: readonly NotifySignal[],
): NotifyFiring[] {
  return rules
    .filter((r) => r.enabled)
    .map((rule) => ({
      rule,
      signals: signals.filter((s) => signalMatchesRule(rule, s)),
    }))
    .filter((f) => f.signals.length > 0);
}
