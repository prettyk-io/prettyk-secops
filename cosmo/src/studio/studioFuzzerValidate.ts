/**
 * Client validate + paste parse for Fuzzer form (S3776 extract from studioFuzzers).
 */
import { listResourceAsNames } from './studioResources';
import {
  fuzzerIdError,
  isKnownCorpusRef,
  normalizeWaveAlgorithm,
  splitCorpusRefs,
  type FuzzerFields,
  type FuzzerMethod,
  type FuzzTargetFields,
} from './studioFuzzers';

export type FuzzerFormIssue = { field: string; message: string };

export interface ParsePasteResult {
  targets: FuzzTargetFields[];
  errors: string[];
}

const METHODS = new Set<FuzzerMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MASK_RE = /\{MASK(?:_\d+)?\}/;

function validateCorpusValue(
  issues: FuzzerFormIssue[],
  field: string,
  corpusRaw: string,
  resources: readonly string[],
  label: string,
): void {
  const corpus = corpusRaw.trim();
  // пусто / auto → runtime matrix (fuzz dictionaries wave B)
  if (!corpus || corpus.toLowerCase() === 'auto') {
    return;
  }
  const parts = splitCorpusRefs(corpus);
  if (parts.length === 0) {
    return;
  }
  for (const part of parts) {
    if (!isKnownCorpusRef(part, resources)) {
      issues.push({
        field,
        message: `${label}: corpus «${part}» — нет resource as и не intent_* preset`,
      });
    }
  }
}

function validateTargetRow(
  issues: FuzzerFormIssue[],
  target: FuzzTargetFields,
  index: number,
  resources: readonly string[],
): void {
  const idx = String(index + 1);
  if (!target.url.trim()) {
    issues.push({
      field: `targets[${String(index)}].url`,
      message: `Строка ${idx}: URL цели пуст`,
    });
  }
  validateCorpusValue(
    issues,
    `targets[${String(index)}].corpus`,
    target.corpus,
    resources,
    `Строка ${idx}`,
  );
  const method = String(target.method || 'GET').toUpperCase();
  const body = (target.body ?? '').trim();
  const hasMask = MASK_RE.test(target.url) || MASK_RE.test(body);
  if (!hasMask && method !== 'GET') {
    issues.push({
      field: `targets[${String(index)}].body`,
      message: `Строка ${idx}: для ${method} нужна маска {MASK}/{MASK_n} в URL или body`,
    });
  }
}

/** Client validate формы Fuzzer. */
export function validateFuzzerFields(
  fields: FuzzerFields,
  formData: unknown,
): FuzzerFormIssue[] {
  const issues: FuzzerFormIssue[] = [];
  const idErr = fuzzerIdError(fields.id);
  if (idErr) {
    issues.push({ field: 'id', message: idErr });
  }

  const resources = listResourceAsNames(formData);
  validateCorpusValue(issues, 'corpus', fields.corpus, resources, 'Corpus');

  const mode = normalizeWaveAlgorithm(fields.algorithm);
  if (!fields.algorithm.trim()) {
    issues.push({ field: 'algorithm', message: 'Укажите алгоритм волны' });
  }

  if (!fields.targets || fields.targets.length === 0) {
    issues.push({
      field: 'targets',
      message: 'Таблица целей targets должна содержать хотя бы 1 строку',
    });
  } else {
    for (let index = 0; index < fields.targets.length; index += 1) {
      validateTargetRow(issues, fields.targets[index]!, index, resources);
    }
    if (mode === 'pitchfork' || mode === 'cluster_bomb') {
      if (fields.targets.length < 2) {
        issues.push({
          field: 'algorithm',
          message: `${mode}: нужно ≥2 цели в targets[] (иначе это sniper одной оси)`,
        });
      }
    }
  }

  if (
    !Number.isFinite(fields.policy.max_requests) ||
    fields.policy.max_requests < 1 ||
    fields.policy.max_requests > 25
  ) {
    issues.push({ field: 'policy.max_requests', message: 'max_requests: 1…25' });
  }
  if (
    !Number.isFinite(fields.policy.requests_per_second) ||
    fields.policy.requests_per_second <= 0 ||
    fields.policy.requests_per_second > 1
  ) {
    issues.push({ field: 'policy.requests_per_second', message: 'rps: (0…1]' });
  }
  return issues;
}

function splitPasteParts(rawLine: string): string[] {
  let parts = rawLine
    .split('\t')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 1 && rawLine.includes(',')) {
    parts = rawLine
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (parts.length === 1) {
    const ws = rawLine
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (ws.length >= 2) {
      parts = ws;
    }
  }
  return parts;
}

function parsePasteLine(line: string): FuzzTargetFields | null {
  const parts = splitPasteParts(line);
  if (parts.length < 1) {
    return null;
  }
  const url = parts[0]!;
  let method: FuzzerMethod = 'GET';
  let corpus = 'auto';
  if (parts.length === 2) {
    const mid = parts[1]!.toUpperCase();
    if (METHODS.has(mid as FuzzerMethod)) {
      method = mid as FuzzerMethod;
    } else {
      corpus = parts[1]!;
    }
  } else if (parts.length >= 3) {
    const mid = parts[1]!.toUpperCase();
    if (METHODS.has(mid as FuzzerMethod)) {
      method = mid as FuzzerMethod;
      corpus = parts.slice(2).join(',');
    } else {
      corpus = parts.slice(1).join(',');
    }
  }
  return { url, method, corpus, body: '' };
}

/** Парсинг вставки буфера (TSV, CSV, пробелы): url [method] corpus. */
export function parsePasteTargets(rawText: string): ParsePasteResult {
  const targets: FuzzTargetFields[] = [];
  const errors: string[] = [];

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parsed = parsePasteLine(line);
    if (parsed) {
      targets.push(parsed);
    }
  }

  if (targets.length === 0 && rawText.trim()) {
    errors.push('Не удалось разобрать ни одной строки URL');
  }
  return { targets, errors };
}
