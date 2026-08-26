/**
 * PK-WB-C4 — Commit Diff View: Monaco side-by-side + semantic change summary.
 *
 * Встраивается в EditorWorkbench как отдельная вкладка правой панели
 * или как модальное окно. Показывает:
 * 1. Историю коммитов (слева) — выбор двух ревизий для сравнения.
 * 2. Monaco diff editor (в центре) — построчное сравнение DSL.
 * 3. Semantic change cards (справа/снизу) — типизированные изменения.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  GitCompare,
  GitCommit,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  MinusCircle,
  Edit3,
  Tag,
  RotateCcw,
  FileText,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  listCommits,
  getCommit,
  computeSemanticDiff,
  type CommitRecord,
  type SemanticChange,
  type ChangeKind,
} from '../checks/commitEngine';
import { readConstructorText, firstDslTab, findDslTab, type DslTabRef } from '../wired/wiredDslCodec';

// ---------------------------------------------------------------------------
// Change kind → icon + label
// ---------------------------------------------------------------------------

const CHANGE_META: Record<ChangeKind, { icon: LucideIcon; label: string; color: string }> = {
  ADD_STEP: { icon: PlusCircle, label: 'Step added', color: 'text-green-400' },
  REMOVE_STEP: { icon: MinusCircle, label: 'Step removed', color: 'text-red-400' },
  MODIFY_STEP: { icon: Edit3, label: 'Step modified', color: 'text-amber-400' },
  RENAME_ENTITY: { icon: Tag, label: 'Renamed', color: 'text-violet-400' },
  MOVE_STEP: { icon: RotateCcw, label: 'Step moved', color: 'text-blue-400' },
  ADD_SCENARIO: { icon: PlusCircle, label: 'Scenario added', color: 'text-green-400' },
  REMOVE_SCENARIO: { icon: MinusCircle, label: 'Scenario removed', color: 'text-red-400' },
  MODIFY_REGULATION: { icon: FileText, label: 'Regulation changed', color: 'text-sky-400' },
  ADD_RESOURCE: { icon: PlusCircle, label: 'Resource added', color: 'text-green-400' },
  REMOVE_RESOURCE: { icon: MinusCircle, label: 'Resource removed', color: 'text-red-400' },
  MODIFY_RESOURCE: { icon: Edit3, label: 'Resource changed', color: 'text-amber-400' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function dslFromCommit(commit: CommitRecord, activeTab?: DslTabRef | null): string {
  if (!commit || !commit.wired) return '';
  const wired = commit.wired as Record<string, unknown>;
  // ER-4: bind diff to the selected entity, not always the first tab.
  const tab =
    (activeTab ? findDslTab(wired, activeTab.kind, activeTab.entityId) : null) ??
    firstDslTab(wired);
  if (!tab) return '';
  return readConstructorText(wired, tab.path);
}

/**
 * ER-5: mask secret values (token / password / secret / cookie / api-key) in the
 * read-only diff view so credentials never appear in plaintext in the DOM.
 * Machine contract (formData / commits) is untouched — this is display-only.
 */
export function redactDslSecrets(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.replace(
        /(\b(?:token|password|secret|cookie|api[_-]?key)\b\s*[:=]\s*)(\S+)/gi,
        '$1••••••',
      ),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommitDiffViewProps {
  /** ID текущего чека. */
  checkId: string;
  /** Активная сущность — diff привязывается к ней (ER-4), не к первой вкладке. */
  activeTab?: DslTabRef | null;
  /** Callback при закрытии (если в модалке). */
  onClose?: () => void;
  /** Класс для стилизации контейнера. */
  className?: string;
  /** Режим отображения: inline (внутри панели) | standalone (на весь экран). */
  variant?: 'inline' | 'standalone';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommitDiffView({
  checkId,
  activeTab,
  onClose,
  className,
  variant = 'inline',
}: CommitDiffViewProps) {
  const commits = useMemo(() => listCommits(checkId), [checkId]);

  const [fromIdx, setFromIdx] = useState<number>(0);
  const [toIdx, setToIdx] = useState<number>(commits.length - 1);
  const [semanticChanges, setSemanticChanges] = useState<SemanticChange[]>([]);

  // Reset indices when commits list changes
  useEffect(() => {
    if (commits.length >= 2) {
      setFromIdx(0);
      setToIdx(commits.length - 1);
    }
  }, [commits.length]);

  const fromCommit = commits[fromIdx] ?? null;
  const toCommit = commits[toIdx] ?? null;

  // Compute diff whenever from/to changes
  useEffect(() => {
    if (!fromCommit || !toCommit) {
      setSemanticChanges([]);
      return;
    }
    try {
      const changes = computeSemanticDiff(
        fromCommit.wired as Record<string, unknown>,
        toCommit.wired as Record<string, unknown>,
        fromCommit.resources ?? {},
        toCommit.resources ?? {},
      );
      setSemanticChanges(changes);
    } catch {
      setSemanticChanges([]);
    }
  }, [fromCommit, toCommit]);

  // ── States ──

  if (commits.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 text-slate-500', className)}>
        <GitCommit className="size-12 opacity-20" />
        <p className="text-sm font-semibold">No commits yet</p>
        <p className="text-[10px] max-w-[240px] text-center">
          Save your draft and use Ctrl+S to create the first immutable revision.
        </p>
      </div>
    );
  }

  if (commits.length === 1) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 text-slate-500', className)}>
        <GitCommit className="size-12 opacity-20" />
        <p className="text-sm font-semibold">Only one commit</p>
        <p className="text-[10px] max-w-[240px] text-center">
          Create at least two revisions to compare them.
        </p>
      </div>
    );
  }

  // ── Diff content ──

  const fromDsl = fromCommit ? redactDslSecrets(dslFromCommit(fromCommit, activeTab)) : '';
  const toDsl = toCommit ? redactDslSecrets(dslFromCommit(toCommit, activeTab)) : '';

  const isInline = variant === 'inline';

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-[#0b101c] text-slate-200',
        isInline && 'h-full',
        variant === 'standalone' && 'h-screen',
        className,
      )}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 h-10 shrink-0 border-b border-slate-700/50 bg-[#0c1225]">
        <GitCompare className="size-4 text-cyan-400 mr-1" />
        <span className="text-xs font-bold text-slate-300 tracking-wide">DIFF</span>

        {/* From selector */}
        <select
          value={fromIdx}
          onChange={(e) => setFromIdx(Number(e.target.value))}
          className="ml-2 h-6 text-[10px] bg-slate-900 border border-slate-700 rounded px-1.5 text-slate-300 font-mono outline-none cursor-pointer"
        >
          {commits.map((c, i) => (
            <option key={c.commitId} value={i} disabled={i >= toIdx}>
              {c.commitId.slice(0, 6)} — {c.message}
            </option>
          ))}
        </select>

        <span className="text-[9px] text-slate-500">→</span>

        {/* To selector */}
        <select
          value={toIdx}
          onChange={(e) => setToIdx(Number(e.target.value))}
          className="h-6 text-[10px] bg-slate-900 border border-slate-700 rounded px-1.5 text-slate-300 font-mono outline-none cursor-pointer"
        >
          {commits.map((c, i) => (
            <option key={c.commitId} value={i} disabled={i <= fromIdx}>
              {c.commitId.slice(0, 6)} — {c.message}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Semantic change count badge */}
        {semanticChanges.length > 0 && (
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            {semanticChanges.length} change{semanticChanges.length !== 1 ? 's' : ''}
          </span>
        )}

        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-slate-400 text-[10px]">
            ✕
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className={cn('flex flex-1 min-h-0', isInline ? 'flex-col' : 'flex-row')}>
        {/* ── Monaco Diff ── */}
        <div className={cn('flex-1 min-h-0', isInline ? 'h-[55%]' : '')}>
          <div className="flex items-center gap-2 px-2 h-5 bg-slate-900/50 border-b border-slate-700/30 text-[9px] text-slate-500 font-mono">
            <span className="text-red-400/70">− {fromCommit?.commitId.slice(0, 7)}</span>
            <span className="text-slate-600">|</span>
            <span className="text-green-400/70">+ {toCommit?.commitId.slice(0, 7)}</span>
          </div>
          <div className="flex-1">
            <DiffEditor
              height="100%"
              language="plaintext"
              original={fromDsl}
              modified={toDsl}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                fontSize: 12,
                fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                renderWhitespace: 'none',
                padding: { top: 8, bottom: 8 },
                overviewRulerBorder: false,
                hideUnchangedRegions: { enabled: true, revealLineCount: 2 },
              }}
              loading={
                <div className="flex items-center justify-center h-full text-xs text-slate-500">
                  Loading diff…
                </div>
              }
            />
          </div>
        </div>

        {/* ── Semantic Changes ── */}
        <div
          className={cn(
            'shrink-0 overflow-y-auto border-slate-700/50 bg-[#080c14]',
            isInline ? 'h-[45%] border-t' : 'w-72 border-l',
          )}
        >
          <div className="flex items-center gap-1.5 px-2.5 h-7 shrink-0 border-b border-slate-700/30 bg-slate-900/30 sticky top-0 z-10">
            <AlertCircle className="size-3 text-cyan-400" />
            <span className="text-[10px] font-semibold text-slate-400">Semantic Changes</span>
          </div>

          {semanticChanges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-slate-600">
              <GitCompare className="size-6 opacity-30" />
              <p className="text-[10px]">No semantic changes detected</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-1.5">
              {semanticChanges.map((change, i) => {
                const meta = CHANGE_META[change.kind] ?? {
                  icon: AlertCircle,
                  label: change.kind,
                  color: 'text-slate-400',
                };
                const Icon = meta.icon;

                return (
                  <div
                    key={`${change.kind}-${change.entityId}-${i}`}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors"
                  >
                    <Icon className={cn('size-3.5 shrink-0 mt-0.5', meta.color)} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-semibold text-slate-300 leading-tight truncate">
                        {change.label}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {meta.label}
                      </span>
                      {change.before !== undefined && change.after !== undefined && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="text-[9px] text-red-400/60 font-mono line-through leading-tight break-all">
                            {String(change.before).slice(0, 60)}
                          </span>
                          <span className="text-[9px] text-green-400/60 font-mono leading-tight break-all">
                            {String(change.after).slice(0, 60)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact commit history panel (for embedding in sidebar)
// ---------------------------------------------------------------------------

export interface CommitTimelineProps {
  checkId: string;
  onSelectCommit?: (commit: CommitRecord) => void;
  activeCommitId?: string | null;
}

export function CommitTimeline({
  checkId,
  onSelectCommit,
  activeCommitId,
}: CommitTimelineProps) {
  const commits = useMemo(() => listCommits(checkId), [checkId]);

  if (commits.length === 0) {
    return (
      <div className="px-3 py-4 text-[10px] text-slate-500 text-center">
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {commits.map((commit, idx) => {
        const isActive = commit.commitId === activeCommitId;
        const isLatest = idx === commits.length - 1;

        return (
          <button
            key={commit.commitId}
            type="button"
            onClick={() => onSelectCommit?.(commit)}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors w-full',
              isActive
                ? 'bg-cyan-500/10 border border-cyan-500/30'
                : 'hover:bg-white/[0.03] border border-transparent',
            )}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center shrink-0 pt-0.5">
              <div
                className={cn(
                  'size-2 rounded-full border',
                  isLatest
                    ? 'bg-cyan-500 border-cyan-500 shadow-[0_0_6px_rgba(56,189,248,0.4)]'
                    : 'bg-slate-700 border-slate-600',
                )}
              />
              {idx < commits.length - 1 && (
                <div className="w-px flex-1 min-h-[8px] bg-slate-700/50 my-0.5" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[10px] font-semibold text-slate-300 leading-tight truncate">
                {commit.message || 'Untitled'}
              </span>
              <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1.5">
                <span>{commit.commitId.slice(0, 7)}</span>
                <span>·</span>
                <span>{formatTimestamp(commit.timestamp)}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}