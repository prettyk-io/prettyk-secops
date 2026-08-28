/**
 * WireDocumentSerializer — хирургический сериализатор и патчер AST.
 *
 * Позволяет точечно заменять узлы по SourceSpan без полной перегенерации документа.
 * Обеспечивает 100% сохранение окружающих блоков (try/catch, >@ { recover }, >?,
 * комментариев, метаданных и отступов).
 *
 * Спецификация: docs/research/2026-08-27-wire-canvas-sync-plan.md
 */

import type { ScenarioStepModel } from '../studio/scenarioStepModel';
import type { WireDocument, WireNode } from './wireDocumentParser';
import { parseWireDocument } from './wireDocumentParser';

// ── Вспомогательное форматирование значений с кавычками ──

function quoteIfNeeded(val: string): string {
  if (!val) return '""';
  if (val.includes(' ') || val.includes('\t') || val.includes('"')) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

// ── Форматирование первичного действия (Primary Action) ──

export function formatPrimaryAction(
  step: ScenarioStepModel,
  originalRaw?: string,
): string {
  const orig = (originalRaw || '').trim();
  const isWire = orig.includes('|');

  // 1. Если оригинал был в wire-формате (component|action|args...)
  if (isWire) {
    const act = step.action;
    if (act === 'Open') {
      return `webdriver|open|${step.payload || 'about:blank'}`;
    }
    if (act === 'Wait') {
      if (step.strategyValue) {
        return `webdriver|wait_for_element|${step.strategy}|${step.strategyValue}|${step.payload || '10'}`;
      }
      return `webdriver|pause|${step.payload || '1000'}`;
    }
    if (act === 'Click') {
      return `webdriver|click|${step.strategy}|${step.strategyValue}`;
    }
    if (act === 'Type') {
      return `webdriver|send_keys|${step.strategy}|${step.strategyValue}|${step.payload}`;
    }
    if (act === 'Hover') {
      return `webdriver|hover|${step.strategy}|${step.strategyValue}`;
    }
    if (act === 'Select') {
      return `webdriver|select_by_text|${step.strategy}|${step.strategyValue}|${step.payload}`;
    }
    if (act === 'Let') {
      return `data|let|${step.strategyValue}|${step.payload}`;
    }
    if (act === 'Secret') {
      return `data|secret|${step.strategyValue}|${step.payload}`;
    }
    return `webdriver|action|${step.strategy}|${step.strategyValue}|${step.payload}`.trim();
  }

  // 2. Если оригинал был на русском MethodId / Sugar DSL
  const isMethodIdLong = /^нажать(?:\s|$)/i.test(orig) || /^вставитьзначение(?:\s|$)/i.test(orig) || /^открытьпоurl(?:\s|$)/i.test(orig);
  const act = step.action;
  const strat = step.strategy;
  const stratVal = step.strategyValue;
  const payload = step.payload;

  if (act === 'Open') {
    const verb = isMethodIdLong ? 'ОткрытьПоURL' : 'Открыть';
    return `${verb} ${quoteIfNeeded(payload || 'about:blank')}`;
  }

  if (act === 'Wait') {
    const verb = isMethodIdLong ? 'ЖдатьЭлемент' : 'Ждать';
    if (stratVal) {
      return `${verb} ${strat} ${quoteIfNeeded(stratVal)} ${payload ? quoteIfNeeded(payload) : ''}`.trim();
    }
    return `${verb} ${payload || '1000'}`;
  }

  if (act === 'Click') {
    const verb = isMethodIdLong ? 'Нажать' : 'Клик';
    if (strat === 'test_id') {
      const formattedId = stratVal.startsWith('#') ? stratVal : `#${stratVal}`;
      return `${verb} ${formattedId}`;
    }
    if (strat === 'css') {
      if (stratVal.startsWith('.') || stratVal.startsWith('#') || stratVal.startsWith('[')) {
        return `${verb} ${stratVal}`;
      }
      return `${verb} css ${quoteIfNeeded(stratVal)}`;
    }
    return `${verb} ${strat} ${quoteIfNeeded(stratVal)}`;
  }

  if (act === 'Type') {
    const verb = isMethodIdLong ? 'ВставитьЗначение' : 'Вставить';
    if (strat === 'test_id') {
      const formattedId = stratVal.startsWith('#') ? stratVal : `#${stratVal}`;
      return `${verb} ${formattedId} ${quoteIfNeeded(payload)}`;
    }
    if (strat === 'css') {
      if (stratVal.startsWith('.') || stratVal.startsWith('#') || stratVal.startsWith('[')) {
        return `${verb} ${stratVal} ${quoteIfNeeded(payload)}`;
      }
      return `${verb} css ${quoteIfNeeded(stratVal)} ${quoteIfNeeded(payload)}`;
    }
    return `${verb} ${strat} ${quoteIfNeeded(stratVal)} ${quoteIfNeeded(payload)}`;
  }

  if (act === 'Hover') {
    return `Навести ${strat} ${quoteIfNeeded(stratVal)}`;
  }

  if (act === 'Select') {
    return `Выбрать ${strat} ${quoteIfNeeded(stratVal)} ${quoteIfNeeded(payload)}`;
  }

  if (act === 'Let') {
    const varName = stratVal.startsWith('$') ? stratVal : `$${stratVal}`;
    return `Пусть ${varName} = ${quoteIfNeeded(payload)}`;
  }

  if (act === 'Secret') {
    const varName = stratVal.startsWith('$') ? stratVal : `$${stratVal}`;
    return `Секрет ${varName} = ${quoteIfNeeded(payload)}`;
  }

  if (act === 'Check') {
    if (stratVal) {
      return `Проверить ${strat} ${quoteIfNeeded(stratVal)} ${payload ? quoteIfNeeded(payload) : ''}`.trim();
    }
    return `Скрин ${payload || ''}`.trim();
  }

  if (act === 'Crawl') return 'crawl';
  if (act === 'ActiveScan') return 'ActiveScan';
  if (act === 'FuzzWave') return `FuzzWave ${payload || 'corpus'}`;
  if (act === 'GenerateEmail') return 'GenerateEmail';
  if (act === 'GeneratePhone') return 'GeneratePhone';

  // Fallback: стандартный Sugar вид
  return `${act} ${strat} ${quoteIfNeeded(stratVal)} ${payload ? quoteIfNeeded(payload) : ''}`.trim();
}

// ── Рекурсивный поиск узла по ID ──

function findNodeById(nodes: WireNode[], stepId: string): WireNode | null {
  for (const node of nodes) {
    if (node.id === stepId) return node;
    if (node.childNodes && node.childNodes.length > 0) {
      const child = findNodeById(node.childNodes, stepId);
      if (child) return child;
    }
  }
  return null;
}

// ── Главная функция: applyCanvasStepPatch ──

export interface PatchStepResult {
  newText: string;
  newDoc: WireDocument;
  patchedNode: WireNode | null;
}

export function applyCanvasStepPatch(
  doc: WireDocument,
  stepId: string,
  patch: Partial<ScenarioStepModel>,
): PatchStepResult {
  const targetNode = findNodeById(doc.nodes, stepId);
  if (!targetNode || !targetNode.stepModel) {
    return {
      newText: doc.rawText,
      newDoc: doc,
      patchedNode: null,
    };
  }

  const updatedStepModel: ScenarioStepModel = {
    ...targetNode.stepModel,
    ...patch,
  };

  // 1. Извлекаем ведущие отступы оригинальной строки
  const indentMatch = targetNode.raw.match(/^([ \t]*)/);
  const indent = indentMatch ? indentMatch[1] : '';

  // 2. Форматируем первичную часть
  const primaryFormatted = formatPrimaryAction(updatedStepModel, targetNode.raw);

  // 3. Собираем строку с модификаторами
  let assembled = `${indent}${primaryFormatted}`;

  // 3.1. -> $var
  if (targetNode.annotation?.saveAs) {
    assembled += ` -> ${targetNode.annotation.saveAs}`;
  }

  // 3.2. ># hint
  if (targetNode.annotation?.hint) {
    assembled += ` ># ${targetNode.annotation.hint}`;
  }

  // 3.3. >@ { recover } или >?
  if (targetNode.annotation?.recover) {
    const rawBody = targetNode.annotation.recover.rawBody;
    if (rawBody.includes('\n')) {
      assembled += ` >@ {\n${rawBody}\n${indent}}`;
    } else {
      assembled += ` >@ { ${rawBody} }`;
    }
  } else if (
    patch.continueOnError !== undefined
      ? patch.continueOnError
      : targetNode.annotation?.soft || targetNode.stepModel.continueOnError
  ) {
    assembled += ' >?';
  }

  // 4. Хирургическая подстановка по span [startOffset..endOffset]
  const before = doc.rawText.slice(0, targetNode.span.startOffset);
  const after = doc.rawText.slice(targetNode.span.endOffset);
  const newText = before + assembled + after;

  // 5. Перепарсинг документа для обновления всех span и хэшей
  const newDoc = parseWireDocument(newText, doc.revision + 1);
  const newPatchedNode = findNodeById(newDoc.nodes, stepId);

  return {
    newText,
    newDoc,
    patchedNode: newPatchedNode,
  };
}
