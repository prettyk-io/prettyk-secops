/**
 * WireDocumentParser — AST-парсер текста сценария (Sugar DSL, MethodId, Wire)
 * в структурированную модель WireDocument с точными SourceSpan для синхронизации
 * Monaco Editor ↔ Canvas ScenarioDeckStore.
 *
 * Спецификация: docs/research/2026-08-27-wire-canvas-sync-plan.md
 */

import type { ActionKind, ScenarioStepModel, StrategyKind } from '../studio/scenarioStepModel';
import type { ScenarioDeckData } from '../studio/ScenarioDeckStore';

// ── Типы модели документа ──

export type WireNodeKind =
  | 'action'
  | 'declaration'
  | 'control_block'
  | 'comment'
  | 'empty_line'
  | 'metadata'
  | 'opaque';

export interface WireSourceSpan {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface AdvancedStepAnnotation {
  soft?: boolean; // >?
  recover?: {
    rawBody: string;
    steps: ScenarioStepModel[];
    retryPrimary: 1;
  };
  saveAs?: string; // -> $var
  hint?: string; // ># hint
}

export interface WireNode {
  id: string; // Детерминированный стабильный ID узла
  kind: WireNodeKind;
  raw: string; // Полный исходный текст узла
  span: WireSourceSpan;
  stepModel?: ScenarioStepModel;
  annotation?: AdvancedStepAnnotation;
  childNodes?: WireNode[];
  metaKey?: string;
  metaValue?: string;
  declaration?: {
    kind: 'let' | 'secret';
    name: string;
    value: string;
  };
  controlHeader?: string;
}

export interface WireDocument {
  rawText: string;
  revision: number;
  contentHash: string;
  scenarioFailsafe: boolean; // <!>
  meta: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  nodes: WireNode[];
}

// ── Детерминированный хэш строки ──

export function fastContentHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ── Вспомогательные функции маппинга действий и селекторов ──

const ACTION_VERB_MAP: Record<string, ActionKind> = {
  // Russian Sugar & Canonical MethodIds
  'клик': 'Click',
  'нажать': 'Click',
  'вставить': 'Type',
  'вставитьзначение': 'Type',
  'дописать': 'Type',
  'дописатьесть': 'Type',
  'дописатьтекст': 'Type',
  'очистить': 'Type',
  'очиститьзначение': 'Type',
  'открыть': 'Open',
  'открытьпоurl': 'Open',
  'ждать': 'Wait',
  'ждатьэлемент': 'Wait',
  'ждатьисчезновенияэлемента': 'Wait',
  'ждатьтекст': 'Wait',
  'ждатьurl': 'Wait',
  'пауза': 'Wait',
  'навести': 'Hover',
  'выбрать': 'Select',
  'выбратьпотексту': 'Select',
  'выбратьпозначению': 'Select',
  'скрин': 'Check',
  'скриншот': 'Check',
  'скриншотэлемента': 'Check',
  'проверить': 'Check',
  'проверитьзаголовок': 'Check',
  'проверитьurl': 'Check',
  'проверитьналичиеэлемента': 'Check',
  'проверитьвидимостьэлемента': 'Check',
  'проверитьневидимостьэлемента': 'Check',
  'проверитьтекст': 'Check',
  'проверитьтекстнастранице': 'Check',
  'проверитьравенство': 'Check',
  'проверитьвхождение': 'Check',
  'текст': 'Check',
  'получитьтекст': 'Check',
  'значение': 'Check',
  'получитьзначение': 'Check',
  'атрибут': 'Check',
  'получитьатрибут': 'Check',
  'пусть': 'Let',
  'секрет': 'Secret',
  'сканировать': 'ActiveScan',
  'фазз': 'FuzzWave',
  'мутировать': 'Mutate',
  'интрудер': 'Intruder',

  // English & Wire equivalents
  'click': 'Click',
  'type': 'Type',
  'send_keys': 'Type',
  'fill': 'Type',
  'open': 'Open',
  'open_by_url': 'Open',
  'wait': 'Wait',
  'wait_for_element': 'Wait',
  'hover': 'Hover',
  'select': 'Select',
  'select_by_text': 'Select',
  'select_by_value': 'Select',
  'presskey': 'PressKey',
  'check': 'Check',
  'crawl': 'Crawl',
  'activescan': 'ActiveScan',
  'fuzzwave': 'FuzzWave',
  'mutate': 'Mutate',
  'intruder': 'Intruder',
  'let': 'Let',
  'secret': 'Secret',
  'generateemail': 'GenerateEmail',
  'generatephone': 'GeneratePhone',
  'scannerreport': 'scannerReport',
};

function normalizeStrategy(rawStrat: string): StrategyKind {
  const lower = rawStrat.toLowerCase();
  if (lower === 'role' || lower === 'label' || lower === 'css' || lower === 'test_id' || lower === 'text' || lower === 'xpath') {
    return lower;
  }
  if (lower === 'id' || lower === 'qa') return 'test_id';
  if (lower === 'placeholder') return 'label';
  return 'css';
}

function detectStrategyFromValue(rawVal: string): { strategy: StrategyKind; value: string } {
  const val = rawVal.trim();
  if (val.startsWith('#') && !val.includes(' ') && val.length > 1) {
    return { strategy: 'test_id', value: val.slice(1) };
  }
  if (val.startsWith('.') && !val.includes(' ') && val.length > 1) {
    return { strategy: 'css', value: val };
  }
  if (val.startsWith('//') || val.startsWith('/')) {
    return { strategy: 'xpath', value: val };
  }
  if (val.startsWith('[') && val.endsWith(']')) {
    return { strategy: 'css', value: val };
  }
  return { strategy: 'text', value: val };
}

// ── Токенизация простой строки листа ──

function tokenizeLeaf(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= len) break;

    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      i++;
      let val = '';
      while (i < len && line[i] !== q) {
        if (line[i] === '\\' && i + 1 < len) {
          val += line[i + 1];
          i += 2;
        } else {
          val += line[i];
          i++;
        }
      }
      if (i < len) i++;
      tokens.push(val);
      continue;
    }

    let tok = '';
    while (i < len && line[i] !== ' ' && line[i] !== '\t') {
      tok += line[i];
      i++;
    }
    if (tok) tokens.push(tok);
  }
  return tokens;
}

// ── Парсер отдельной primary строки действия ──

function parsePrimaryAction(primaryStr: string, id: string): ScenarioStepModel | undefined {
  const trimmed = primaryStr.trim();
  if (!trimmed) return undefined;

  // 1. Wire-формат (component|action|arg1|arg2...)
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map((p) => p.trim());
    const actionPart = parts[1] || '';
    const actKey = actionPart.toLowerCase();
    const action: ActionKind = ACTION_VERB_MAP[actKey] || 'Check';

    let strategy: StrategyKind = 'css';
    let strategyValue = '';
    let payload = '';

    if (action === 'Open') {
      payload = parts[2] || '';
    } else if (action === 'Wait') {
      if (parts.length > 3) {
        strategy = normalizeStrategy(parts[2] || 'css');
        strategyValue = parts[3] || '';
        payload = parts[4] || '';
      } else {
        payload = parts[2] || '1000';
      }
    } else if (action === 'Let' || action === 'Secret') {
      strategyValue = parts[2] || '';
      payload = parts[3] || '';
    } else {
      if (parts.length >= 4) {
        strategy = normalizeStrategy(parts[2] || 'css');
        strategyValue = parts[3] || '';
        payload = parts.slice(4).join(' ');
      } else if (parts.length === 3) {
        strategyValue = parts[2] || '';
      }
    }

    return {
      id,
      action,
      strategy,
      strategyValue,
      payload,
      continueOnError: false,
      led: 'queued',
      debugResult: null,
    };
  }

  // 2. Общий токен-парсер (Sugar, MethodIds, English)
  const tokens = tokenizeLeaf(trimmed);
  if (tokens.length === 0) return undefined;

  const first = tokens[0]!;
  const firstLower = first.toLowerCase();
  const action = ACTION_VERB_MAP[firstLower];
  if (!action) {
    return undefined;
  }

  let strategy: StrategyKind = 'css';
  let strategyValue = '';
  let payload = '';

  const args = tokens.slice(1);

  if (action === 'Open') {
    payload = args[0] || '';
  } else if (action === 'Wait') {
    if (args.length >= 2 && ['css', 'xpath', 'text', 'id', 'role', 'label', 'test_id'].includes(args[0]!.toLowerCase())) {
      strategy = normalizeStrategy(args[0]!);
      strategyValue = args[1] || '';
      payload = args[2] || '';
    } else {
      payload = args[0] || '1000';
    }
  } else if (action === 'Let' || action === 'Secret') {
    const joined = args.join(' ');
    const eqIdx = joined.indexOf('=');
    if (eqIdx >= 0) {
      strategyValue = joined.slice(0, eqIdx).trim().replace(/^\$/, '');
      payload = joined.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    } else {
      strategyValue = (args[0] || '').replace(/^\$/, '');
      payload = (args[1] || '').replace(/^["']|["']$/g, '');
    }
  } else if (action === 'Crawl' || action === 'ActiveScan') {
    payload = args.join(' ');
  } else {
    // Actions: Click, Type, Hover, Select, PressKey, Check, etc.
    if (args.length > 0) {
      const firstArg = args[0]!;
      const firstArgLower = firstArg.toLowerCase();
      if (['role', 'label', 'test_id', 'css', 'text', 'placeholder', 'xpath'].includes(firstArgLower)) {
        strategy = normalizeStrategy(firstArgLower);
        strategyValue = args[1] || '';
        payload = args.slice(2).join(' ');
      } else {
        const detected = detectStrategyFromValue(firstArg);
        strategy = detected.strategy;
        strategyValue = detected.value;
        payload = args.slice(1).join(' ');
      }
    }
  }

  return {
    id,
    action,
    strategy,
    strategyValue,
    payload,
    continueOnError: false,
    led: 'queued',
    debugResult: null,
  };
}

// ── Извлечение модификаторов из строки действия ──

interface ExtractedModifiers {
  primary: string;
  annotation: AdvancedStepAnnotation;
}

function extractModifiers(rawLine: string, lineIndex: number): ExtractedModifiers {
  let line = rawLine.trim();
  const annotation: AdvancedStepAnnotation = {};

  // 1. >? (soft / failsafe) в самом конце
  if (line.endsWith('>?') || /\s+>\?\s*$/.test(line)) {
    annotation.soft = true;
    line = line.replace(/\s*>\?\s*$/, '').trim();
  }

  // 2. >@ { recover }
  const recMatch = line.match(/>@\s*\{/);
  if (recMatch && recMatch.index !== undefined) {
    const startBrace = line.indexOf('{', recMatch.index);
    let depth = 1;
    let endBrace = -1;
    for (let i = startBrace + 1; i < line.length; i++) {
      if (line[i] === '{') depth++;
      else if (line[i] === '}') {
        depth--;
        if (depth === 0) {
          endBrace = i;
          break;
        }
      }
    }

    if (endBrace > startBrace) {
      let rawBody = line.slice(startBrace + 1, endBrace);
      const isMultiline = rawBody.includes('\n');
      if (isMultiline) {
        rawBody = rawBody.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
      } else {
        rawBody = rawBody.trim();
      }

      const recoverSteps: ScenarioStepModel[] = [];
      const innerLines = rawBody.split(/[\n;]/).map((l) => l.trim()).filter(Boolean);
      innerLines.forEach((innerLine, idx) => {
        const subId = `step-rec-${lineIndex}-${idx + 1}`;
        const subStep = parsePrimaryAction(innerLine, subId);
        if (subStep) recoverSteps.push(subStep);
      });

      annotation.recover = {
        rawBody,
        steps: recoverSteps,
        retryPrimary: 1,
      };

      line = (line.slice(0, recMatch.index).trim() + ' ' + line.slice(endBrace + 1).trim()).trim();
    }
  }

  // 3. Поиск всех маркеров ># (hint) и -> (saveAs)
  const markers: Array<{ type: 'hint' | 'pipe'; index: number }> = [];
  const hintMatch = line.match(/>#\s*/);
  if (hintMatch && hintMatch.index !== undefined) {
    markers.push({ type: 'hint', index: hintMatch.index });
  }
  const pipeMatch = line.match(/->\s*/);
  if (pipeMatch && pipeMatch.index !== undefined) {
    markers.push({ type: 'pipe', index: pipeMatch.index });
  }

  markers.sort((a, b) => a.index - b.index);

  if (markers.length > 0) {
    const primaryCut = markers[0]!.index;
    for (let m = 0; m < markers.length; m++) {
      const cur = markers[m]!;
      const nextIndex = m + 1 < markers.length ? markers[m + 1]!.index : line.length;
      if (cur.type === 'hint') {
        const hintContent = line.slice(cur.index + 2, nextIndex).trim();
        annotation.hint = hintContent;
      } else if (cur.type === 'pipe') {
        const pipeContent = line.slice(cur.index + 2, nextIndex).trim();
        const varTok = pipeContent.split(/\s+/)[0] || '';
        annotation.saveAs = varTok.startsWith('$') ? varTok : `$${varTok}`;
      }
    }
    line = line.slice(0, primaryCut).trim();
  }

  return { primary: line, annotation };
}

// ── Главный публичный API: parseWireDocument ──

export function parseWireDocument(text: string, revision = 1): WireDocument {
  const contentHash = fastContentHash(text);
  const nodes: WireNode[] = [];
  const meta: WireDocument['meta'] = {};
  let scenarioFailsafe = false;

  if (text.length === 0) {
    return {
      rawText: '',
      revision,
      contentHash,
      scenarioFailsafe: false,
      meta,
      nodes: [],
    };
  }

  const lines = text.split('\n');
  let currentOffset = 0;
  let lineIdx = 0;

  while (lineIdx < lines.length) {
    const rawLine = lines[lineIdx]!;
    const lineStartOffset = currentOffset;
    const lineEndOffset = currentOffset + rawLine.length;
    const lineNumber = lineIdx + 1;
    const trimmed = rawLine.trim();

    // 1. Пустая строка
    if (!trimmed) {
      nodes.push({
        id: `node-${lineNumber}-empty`,
        kind: 'empty_line',
        raw: rawLine,
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
      currentOffset += rawLine.length + 1;
      lineIdx++;
      continue;
    }

    // 2. Комментарий
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      nodes.push({
        id: `node-${lineNumber}-comment`,
        kind: 'comment',
        raw: rawLine,
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
      currentOffset += rawLine.length + 1;
      lineIdx++;
      continue;
    }

    // 3. Scenario-level Failsafe <!>
    if (trimmed === '<!>') {
      scenarioFailsafe = true;
      nodes.push({
        id: `node-${lineNumber}-failsafe`,
        kind: 'metadata',
        raw: rawLine,
        metaKey: 'failsafe',
        metaValue: '<!>',
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
      currentOffset += rawLine.length + 1;
      lineIdx++;
      continue;
    }

    // 4. Метаданные (@ Title, @ Description, @ Tag)
    if (trimmed.startsWith('@')) {
      const match = trimmed.match(/^@\s*([A-Za-zА-Яа-я0-9_-]+)\s*:\s*(.*)$/);
      let metaKey = '';
      let metaValue = '';

      if (match && match[1]) {
        metaKey = match[1].toLowerCase();
        metaValue = match[2] || '';
      } else {
        metaKey = 'meta';
        metaValue = trimmed.slice(1).trim();
      }

      if (metaKey === 'title' || metaKey === 'заголовок') {
        meta.title = metaValue;
      } else if (metaKey === 'description' || metaKey === 'описание') {
        meta.description = metaValue;
      } else if (metaKey === 'tag' || metaKey === 'tags' || metaKey === 'тег' || metaKey === 'теги') {
        const parsedTags = metaValue.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
        meta.tags = [...(meta.tags || []), ...parsedTags];
      }

      nodes.push({
        id: `node-${lineNumber}-meta`,
        kind: 'metadata',
        raw: rawLine,
        metaKey,
        metaValue,
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
      currentOffset += rawLine.length + 1;
      lineIdx++;
      continue;
    }

    // 5. Декларации (Пусть / Секрет / Let / Secret)
    if (/^(пусть|секрет|let|secret)(?:\s+|$)/i.test(trimmed)) {
      const isLet = /^(пусть|let)(?:\s+|$)/i.test(trimmed);
      const declType: 'let' | 'secret' = isLet ? 'let' : 'secret';
      const stepId = `step-${lineNumber}-${fastContentHash(trimmed).slice(0, 6)}`;
      const stepModel = parsePrimaryAction(trimmed, stepId);

      let declName = '';
      let declVal = '';
      if (stepModel) {
        declName = stepModel.strategyValue;
        declVal = stepModel.payload;
      }

      nodes.push({
        id: stepId,
        kind: 'declaration',
        raw: rawLine,
        stepModel,
        declaration: {
          kind: declType,
          name: declName,
          value: declVal,
        },
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
      currentOffset += rawLine.length + 1;
      lineIdx++;
      continue;
    }

    // 6. Многострочный блок >@ { ... }
    if (trimmed.includes('>@') && trimmed.includes('{') && !trimmed.includes('}')) {
      let blockRaw = rawLine;
      let endLineIdx = lineIdx;
      let depth = (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;

      while (endLineIdx + 1 < lines.length && depth > 0) {
        endLineIdx++;
        const nextLine = lines[endLineIdx]!;
        blockRaw += '\n' + nextLine;
        depth += (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length;
      }

      const blockEndOffset = currentOffset + blockRaw.length;
      const stepId = `step-${lineNumber}-${fastContentHash(blockRaw).slice(0, 6)}`;
      const { primary, annotation } = extractModifiers(blockRaw, lineNumber);
      const stepModel = parsePrimaryAction(primary, stepId);

      if (stepModel && annotation.soft) {
        stepModel.continueOnError = true;
      }

      nodes.push({
        id: stepId,
        kind: 'action',
        raw: blockRaw,
        stepModel,
        annotation,
        span: {
          startOffset: lineStartOffset,
          endOffset: blockEndOffset,
          startLine: lineNumber,
          endLine: endLineIdx + 1,
        },
      });

      currentOffset += blockRaw.length + 1;
      lineIdx = endLineIdx + 1;
      continue;
    }

    // 7. Контрольные блоки (try / catch / finally / if / while / for / loop)
    if (/^(try|catch|finally|if|while|for|loop)(?:\s|\{|$)/i.test(trimmed) && trimmed.includes('{')) {
      let blockRaw = rawLine;
      let endLineIdx = lineIdx;
      let depth = (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;

      while (endLineIdx + 1 < lines.length && depth > 0) {
        endLineIdx++;
        const nextLine = lines[endLineIdx]!;
        blockRaw += '\n' + nextLine;
        depth += (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length;
      }

      const blockEndOffset = currentOffset + blockRaw.length;
      nodes.push({
        id: `node-${lineNumber}-ctrl-${fastContentHash(blockRaw).slice(0, 6)}`,
        kind: 'control_block',
        raw: blockRaw,
        controlHeader: trimmed.split('{')[0]?.trim() || trimmed,
        span: {
          startOffset: lineStartOffset,
          endOffset: blockEndOffset,
          startLine: lineNumber,
          endLine: endLineIdx + 1,
        },
      });

      currentOffset += blockRaw.length + 1;
      lineIdx = endLineIdx + 1;
      continue;
    }

    // 8. Обычное действие сценария (однострочный action с возможными модификаторами)
    const stepId = `step-${lineNumber}-${fastContentHash(trimmed).slice(0, 6)}`;
    const { primary, annotation } = extractModifiers(trimmed, lineNumber);
    const stepModel = parsePrimaryAction(primary, stepId);

    if (stepModel) {
      if (annotation.soft) {
        stepModel.continueOnError = true;
      }
      nodes.push({
        id: stepId,
        kind: 'action',
        raw: rawLine,
        stepModel,
        annotation,
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
    } else {
      // Opaque / неизвестная строка
      nodes.push({
        id: `node-${lineNumber}-opaque`,
        kind: 'opaque',
        raw: rawLine,
        span: {
          startOffset: lineStartOffset,
          endOffset: lineEndOffset,
          startLine: lineNumber,
          endLine: lineNumber,
        },
      });
    }

    currentOffset += rawLine.length + 1;
    lineIdx++;
  }

  return {
    rawText: text,
    revision,
    contentHash,
    scenarioFailsafe,
    meta,
    nodes,
  };
}

// ── Проекция WireDocument в ScenarioDeckData[] для Canvas ──

export function documentToScenarioDecks(
  doc: WireDocument,
  defaultDeckId = 'main-deck',
): ScenarioDeckData[] {
  const steps: ScenarioStepModel[] = [];

  for (const node of doc.nodes) {
    if (node.kind === 'action' && node.stepModel) {
      steps.push({
        ...node.stepModel,
        continueOnError: Boolean(node.annotation?.soft || node.stepModel.continueOnError),
      });
    } else if (node.kind === 'declaration' && node.stepModel) {
      steps.push(node.stepModel);
    }
  }

  const deck: ScenarioDeckData = {
    id: defaultDeckId,
    title: doc.meta.title || 'Сценарий',
    description: doc.meta.description || '',
    continueOnError: doc.scenarioFailsafe,
    collapsed: false,
    steps,
  };

  return [deck];
}
