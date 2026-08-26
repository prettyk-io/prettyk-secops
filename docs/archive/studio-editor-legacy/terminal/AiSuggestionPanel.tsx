/**
 * PK-WB-E7 — AI Suggestion Panel.
 *
 * Показывает AI-предложение как Monaco DiffEditor (side-by-side before/after).
 * Оператор явно принимает (Accept) или отклоняет (Reject) предложение.
 * AI не может менять scope/policy — только конструкторы шагов.
 */

import React, { useState, useCallback } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Zap,
  Bot,
} from 'lucide-react';
import type { AiSuggestion } from './aiSuggestionEngine';
import { validateSuggestion } from './aiSuggestionEngine';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AiSuggestionPanelProps {
  /** Список AI-предложений. */
  suggestions: AiSuggestion[];
  /** Callback: принять предложение. */
  onAccept: (suggestion: AiSuggestion) => void;
  /** Callback: отклонить предложение. */
  onReject: (suggestion: AiSuggestion) => void;
  /** Callback: принять все предложения. */
  onAcceptAll?: () => void;
  /** Callback: отклонить все. */
  onRejectAll?: () => void;
  /** Занят ли AI генерацией. */
  isGenerating?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeLabel(scope: AiSuggestion['scope']): string {
  const map: Record<string, string> = {
    step_constructor: 'Step DSL',
    scenario_metadata: 'Scenario Meta',
    page_constructor: 'Page DSL',
    module_content: 'Data Module',
    fuzzer_constructor: 'Fuzzer DSL',
  };
  return map[scope] || scope;
}

function SuggestionStatusBadge({ status }: { status: AiSuggestion['status'] }) {
  if (status === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
        <CheckCircle2 className="size-3" /> Accepted
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400">
        <XCircle className="size-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
      <AlertTriangle className="size-3" /> Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single Suggestion Card
// ---------------------------------------------------------------------------

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: AiSuggestion;
  onAccept: (s: AiSuggestion) => void;
  onReject: (s: AiSuggestion) => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const validation = validateSuggestion(suggestion);
  const isResolved = suggestion.status !== 'pending';

  const handleAccept = useCallback(() => {
    if (isResolved) return;
    onAccept(suggestion);
  }, [suggestion, isResolved, onAccept]);

  const handleReject = useCallback(() => {
    if (isResolved) return;
    onReject(suggestion);
  }, [suggestion, isResolved, onReject]);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden mb-3">
      {/* Header */}
      <div className="px-3 py-2.5 bg-white/[0.03] border-b border-white/10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Entity + scope */}
            <div className="flex items-center gap-2 mb-1">
              <Bot className="size-3.5 text-violet-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-200 truncate">
                {suggestion.entityLabel}
              </span>
              <Badge variant="outline" className="text-[9px] font-mono border-slate-700 text-slate-400 px-1.5 py-0 h-4">
                {scopeLabel(suggestion.scope)}
              </Badge>
            </div>

            {/* Explanation */}
            <p className="text-[10px] text-slate-400 leading-relaxed mb-1.5">
              {suggestion.explanation}
            </p>

            {/* Meta line */}
            <div className="flex items-center gap-2 text-[9px] text-slate-500">
              <span className="font-mono">{suggestion.id.slice(0, 16)}…</span>
              {suggestion.model && <span>{suggestion.model}</span>}
              <span className="text-slate-600">
                {new Date(suggestion.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <SuggestionStatusBadge status={suggestion.status} />
        </div>
      </div>

      {/* Diff */}
      {showDiff && (
        <div className="border-b border-white/10">
          <div className="h-[200px]">
            <DiffEditor
              height="100%"
              language="plaintext"
              original={suggestion.currentText}
              modified={suggestion.suggestedText}
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                glyphMargin: false,
                folding: false,
                lineDecorationsWidth: 4,
              }}
              theme="vs-dark"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 flex items-center justify-between bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setShowDiff(!showDiff)}
          className="text-[10px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
        >
          <Eye className="size-3" />
          {showDiff ? 'Hide Diff' : 'Show Diff'}
        </button>

        {!isResolved && (
          <div className="flex items-center gap-1.5">
            {!validation.valid && (
              <span
                className="text-[9px] text-amber-400 flex items-center gap-1"
                title={validation.reason}
              >
                <Shield className="size-3" />
                Blocked
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              className="h-6 px-2 text-[10px] border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="size-3 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAccept}
              disabled={!validation.valid}
              className="h-6 px-2 text-[10px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              <CheckCircle2 className="size-3 mr-1" />
              Accept
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function AiSuggestionPanel({
  suggestions,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  isGenerating = false,
}: AiSuggestionPanelProps) {
  const pending = suggestions.filter((s) => s.status === 'pending');
  const hasPending = pending.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="ai-suggestion-panel">
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-4 text-violet-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            AI Suggestions
          </h3>
          {pending.length > 0 && (
            <Badge variant="default" className="text-[9px] font-mono px-1.5 py-0 h-4 bg-violet-500/30 text-violet-300 border-violet-500/40 ml-auto">
              {pending.length}
            </Badge>
          )}
        </div>

        {/* Safety disclaimer */}
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/15 mb-2">
          <Shield className="size-3 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[9px] text-amber-400/80">
            AI can only suggest DSL step constructors and metadata. Scope, policy, and gate rules
            are <strong>immutable</strong> by AI. Every change requires explicit operator approval.
          </div>
        </div>

        {/* Generating indicator */}
        {isGenerating && (
          <div className="flex items-center gap-2 px-2 py-2 rounded bg-violet-500/10 border border-violet-500/20">
            <Zap className="size-3 text-violet-400 animate-pulse" />
            <span className="text-[10px] text-violet-300">AI is analyzing your scenario…</span>
          </div>
        )}

        {/* Batch actions */}
        {hasPending && onAcceptAll && onRejectAll && (
          <div className="flex items-center gap-1.5 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRejectAll}
              className="h-6 px-2 text-[10px] border-red-500/30 text-red-400 hover:bg-red-500/10 flex-1"
            >
              <XCircle className="size-3 mr-1" />
              Reject All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onAcceptAll}
              className="h-6 px-2 text-[10px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 flex-1"
            >
              <CheckCircle2 className="size-3 mr-1" />
              Accept All
            </Button>
          </div>
        )}
      </div>

      {/* Suggestions list */}
      <div className="flex-1 overflow-y-auto p-3">
        {suggestions.length === 0 && !isGenerating ? (
          <div className="py-8 text-center">
            <Bot className="size-8 text-slate-700 mx-auto mb-2" />
            <p className="text-[11px] text-slate-500">No AI suggestions yet</p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Click "AI Suggest" in the toolbar to analyze your scenario
            </p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))
        )}
      </div>
    </div>
  );
}