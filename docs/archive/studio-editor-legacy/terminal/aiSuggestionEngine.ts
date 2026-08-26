/**
 * PK-WB-E7 — AI Suggestion Engine.
 *
 * Протокол: AI предлагает изменение → diff → explicit approval оператора.
 *
 * Жёсткие ограничения:
 * — AI НЕ может менять scope (allowedHosts, allowedPaths, schemes, environment).
 * — AI НЕ может менять policy / gate-правила.
 * — AI НЕ может выполнять destructive-действия.
 * — Только DSL-constructor шагов и метаданные сценариев (title, description).
 *
 * Все предложения — только через diff → explicit approval.
 */

import type { DslTabKind } from '../wired/wiredDslCodec';
import { writeConstructorText } from '../wired/wiredDslCodec';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Что AI предлагает изменить. */
export type AiSuggestionScope =
  | 'step_constructor'   // DSL-текст шага
  | 'scenario_metadata'  // title, description сценария
  | 'page_constructor'   // DSL-текст страницы
  | 'module_content'     // содержимое data-модуля
  | 'fuzzer_constructor'; // DSL-текст фаззера

/** Запрещённые для AI области. */
export const AI_FORBIDDEN_SCOPES = [
  'scope_rules',
  'policy_rules',
  'gate_thresholds',
  'environment_config',
  'infrastructure',
  'security_configuration',
  'destructive_action',
] as const;

export type AiForbiddenScope = (typeof AI_FORBIDDEN_SCOPES)[number];

/** Одно AI-предложение: что изменить и на что. */
export interface AiSuggestion {
  /** Уникальный id предложения. */
  id: string;
  /** Время генерации. */
  createdAt: string;
  /** Что предлагается изменить. */
  scope: AiSuggestionScope;
  /** Идентификатор сущности (scenario_name, page key, module name, fuzzer title). */
  entityId: string;
  /** Человекочитаемая метка сущности. */
  entityLabel: string;
  /** DSL-путь в formData (JSON pointer). */
  dslPath: string;
  /** Текущий текст (before). */
  currentText: string;
  /** Предложенный текст (after). */
  suggestedText: string;
  /** Человекочитаемое объяснение от AI: что и почему. */
  explanation: string;
  /** Модель, сгенерировавшая предложение. */
  model?: string;
  /** Статус предложения. */
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

/** Пакет предложений (AI может предложить несколько изменений за раз). */
export interface AiSuggestionBatch {
  /** Уникальный id батча. */
  id: string;
  /** Время генерации. */
  createdAt: string;
  /** Предложения в составе батча. */
  suggestions: AiSuggestion[];
  /** Общее объяснение от AI. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Safety: Sanitization & Scope Lock
// ---------------------------------------------------------------------------

/**
 * Проверить: может ли path быть изменён AI?
 * Возвращает true, если path указывает на разрешённый constructor/text field.
 */
export function isAiMutablePath(path: string): boolean {
  // Разрешённые паттерны: только constructor / content поля
  const allowedPatterns = [
    /\/constructor$/,
    /\/content$/,
    /\/scenario_name$/,
    /\/description$/,
    /\/title$/,
    /\/name$/,
  ];

  return allowedPatterns.some((pattern) => pattern.test(path));
}

/**
 * Проверить: не затрагивает ли path запрещённые scope?
 * Возвращает запрещённый scope или null если чисто.
 */
export function detectForbiddenScope(path: string): AiForbiddenScope | null {
  if (
    path.includes('/infrastructure') ||
    path.includes('/security_configuration')
  ) {
    return 'security_configuration';
  }
  if (path.includes('/test_suites/regulation')) {
    return 'scope_rules';
  }
  if (path.includes('/policy') || path.includes('/gate')) {
    return 'policy_rules';
  }
  if (
    path.includes('/environment') ||
    path.includes('/allowedHosts') ||
    path.includes('/allowedPaths') ||
    path.includes('/allowedSchemes') ||
    path.includes('/schemes')
  ) {
    return 'environment_config';
  }
  if (
    path.includes('destructive') ||
    path.includes('/wipe') ||
    path.includes('/delete')
  ) {
    return 'destructive_action';
  }
  return null;
}

/**
 * Санитизировать AI-предложенный текст:
 * — Убрать попытки инжекта shell-команд
 * — Нормализовать пробелы
 * — Проверить длину (не более 100KB)
 */
export function sanitizeAiText(text: string): string {
  const MAX_LENGTH = 100_000;

  let sanitized = text;

  // Убираем shell injection паттерны
  sanitized = sanitized.replace(/`[^`]*`/g, (match) => {
    // Разрешены только безопасные backtick-строки (комментарии, path-литералы)
    if (
      match.includes('rm ') ||
      match.includes('curl ') ||
      match.includes('wget ') ||
      match.includes('eval ') ||
      match.includes('exec') ||
      match.includes('nc ') ||
      match.includes('bash') ||
      match.includes('sudo')
    ) {
      return `\`[SANITIZED — blocked shell command]\``;
    }
    return match;
  });

  // Truncate
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.slice(0, MAX_LENGTH) + '\n// [TRUNCATED — exceeds AI limit]';
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Suggestion Builder
// ---------------------------------------------------------------------------

let suggestionCounter = 0;

/**
 * Создать AI-предложение для изменения constructor-текста шага.
 */
export function createStepSuggestion(
  entityId: string,
  entityLabel: string,
  dslPath: string,
  currentText: string,
  suggestedText: string,
  explanation: string,
  model?: string,
): AiSuggestion {
  return {
    id: `ai-sugg-${Date.now().toString(36)}-${++suggestionCounter}`,
    createdAt: new Date().toISOString(),
    scope: detectSuggestionScope(dslPath),
    entityId,
    entityLabel,
    dslPath,
    currentText,
    suggestedText: sanitizeAiText(suggestedText),
    explanation,
    model,
    status: 'pending',
  };
}

function detectSuggestionScope(path: string): AiSuggestionScope {
  if (path.includes('/pages/')) return 'page_constructor';
  if (path.includes('/fuzzers/')) return 'fuzzer_constructor';
  if (path.includes('/imports/')) return 'module_content';
  if (
    path.includes('/scenario_name') ||
    path.includes('/description') ||
    path.includes('/title')
  ) {
    return 'scenario_metadata';
  }
  return 'step_constructor';
}

// ---------------------------------------------------------------------------
// Acceptance: Apply Suggestion
// ---------------------------------------------------------------------------

/**
 * Применить принятое AI-предложение к formData.
 * Возвращает новый formData (immutable).
 */
export function applySuggestion(
  formData: unknown,
  suggestion: AiSuggestion,
): unknown {
  return writeConstructorText(formData, suggestion.dslPath, suggestion.suggestedText);
}

/**
 * Проверить: можно ли безопасно применить предложение?
 * Возвращает ошибку, если path затрагивает запрещённый scope.
 */
export function validateSuggestion(
  suggestion: AiSuggestion,
): { valid: true } | { valid: false; reason: string } {
  const forbidden = detectForbiddenScope(suggestion.dslPath);
  if (forbidden) {
    return {
      valid: false,
      reason: `AI suggestion targets forbidden scope: "${forbidden}". Only step constructors and metadata can be modified by AI.`,
    };
  }

  if (!isAiMutablePath(suggestion.dslPath)) {
    return {
      valid: false,
      reason: `Path "${suggestion.dslPath}" is not AI-mutable. Only constructor, content, and metadata fields are allowed.`,
    };
  }

  if (suggestion.currentText === suggestion.suggestedText) {
    return {
      valid: false,
      reason: 'Suggested text is identical to current text — no changes to apply.',
    };
  }

  return { valid: true };
}

/** Сгенерировать построчный diff для отображения в Monaco DiffEditor. */
export function suggestionDiffLines(
  suggestion: AiSuggestion,
): Array<{ marker: ' ' | '-' | '+'; text: string }> {
  const currentLines = suggestion.currentText.split('\n');
  const suggestedLines = suggestion.suggestedText.split('\n');
  const result: Array<{ marker: ' ' | '-' | '+'; text: string }> = [];
  const maxLen = Math.max(currentLines.length, suggestedLines.length);

  for (let i = 0; i < maxLen; i++) {
    const cur = currentLines[i] ?? '';
    const sug = suggestedLines[i] ?? '';
    if (cur === sug) {
      result.push({ marker: ' ', text: cur });
    } else {
      if (cur) result.push({ marker: '-', text: cur });
      if (sug) result.push({ marker: '+', text: sug });
    }
  }

  return result;
}

/** Сбросить счётчик предложений (для тестов). */
export function __resetSuggestionCounter(): void {
  suggestionCounter = 0;
}