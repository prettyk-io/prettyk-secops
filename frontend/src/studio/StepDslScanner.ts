/**
 * WIRE-SYNC-F1: DSL-сканер — строит метаданные бейджей по массиву шагов.
 *
 * Анализирует DSL-текст (собранный через stepToDSL) и массив steps,
 * находит >@, >?, <!>, try-блоки.
 * Результат: DeckDslMeta для деки + blockMeta для каждого шага.
 */
import type { ScenarioStepModel, StepBlockMeta } from './scenarioStepModel';
import type { DeckDslMeta } from './ScenarioDeckStore';

interface Range { start: number; end: number; }

/** Найти все вхождения маркера в dslLines. */
function findMarkers(lines: string[], marker: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(marker)) result.push(i);
  }
  return result;
}

/** Найти строки, начинающиеся с ключевого слова (например try). */
function findKeywordStarts(lines: string[], keyword: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trimStart().startsWith(keyword)) result.push(i);
  }
  return result;
}

/** Сопоставить открывающую { с закрывающей } по indent или по маркеру конца блока. */
function findBlockEnd(lines: string[], start: number, endMarker?: string): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('{')) depth++;
    if (line.includes('}')) {
      depth--;
      if (depth === 0) return i;
    }
    // Фолбэк: блок без фигурных скобок заканчивается на маркере
    if (endMarker && line.includes(endMarker) && depth === 0 && i > start) return i - 1;
  }
  return lines.length - 1;
}

/** Построить DeckDslMeta по массиву шагов. */
export function scanDeckDsl(steps: ScenarioStepModel[]): DeckDslMeta | null {
  if (steps.length === 0) return null;

  const lines = steps.map((s) => {
    const a = s.action; const sv = s.strategyValue; const p = s.payload;
    if (a === 'Open') return `Open ${p || 'about:blank'}`;
    if (a === 'Wait') return `Wait ${p || '1000'}`;
    if (a === 'Spider') return 'SpiderScan';
    if (a === 'ActiveScan') return 'ActiveScan';
    if (a === 'FuzzWave') return `FuzzWave ${p || 'corpus'}`;
    if (a === 'Let') return `Let ${sv || 'var'} = ${p || '""'}`;
    if (a === 'Secret') return `Secret ${sv || 'key'} ${p || '""'}`;
    return `${a} ${s.strategy} "${sv}" ${p}`.trim();
  });

  // <!> — scenario failsafe: все шаги помечены continueOnError
  const scenarioFailsafe = lines[0]?.includes('<!>') ?? false;

  // >? — soft-skip: suffix на отдельных шагах
  const softLines = findMarkers(lines, '>?');

  // >@ — recover: primary шаг с >@, за ним блок восстановления в { }
  const recoverAtLines = findMarkers(lines, '>@');
  const recoverBlocks: DeckDslMeta['recoverBlocks'] = [];
  for (const idx of recoverAtLines) {
    const end = idx + 1 < lines.length && lines[idx + 1]!.trim().startsWith('{')
      ? findBlockEnd(lines, idx + 1)
      : idx;
    recoverBlocks.push({ primaryIndex: idx, recoverStart: idx + 1, recoverEnd: end });
  }

  // try — try/catch-блоки
  const tryStarts = findKeywordStarts(lines, 'try');
  const tryBlockRanges: Array<Range> = [];
  for (const start of tryStarts) {
    const end = findBlockEnd(lines, start);
    tryBlockRanges.push({ start, end });
  }

  // Назначить dslLine и blockMeta каждому шагу (только если ещё не установлены)
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.dslLine === undefined) step.dslLine = i + 2; // строка 1 = заголовок, шаги со строки 2

    const meta: StepBlockMeta[] = [];

    // SOFT бейдж
    if (lines[i]!.includes('>?')) {
      meta.push({ kind: 'soft', title: 'SOFT' });
    }
    // RECOVER бейдж (primary)
    if (lines[i]!.includes('>@')) {
      meta.push({ kind: 'recover', title: 'RECOVER' });
      // Добавить recoverSteps
      const rb = recoverBlocks.find((b) => b.primaryIndex === i);
      if (rb) {
        step.recoverSteps = steps.slice(rb.recoverStart, rb.recoverEnd + 1)
          .map((s) => ({ ...s, blockMeta: s.blockMeta ?? [{ kind: 'recover' as const, title: 'RECOVER' }] }));
      }
    }
    // TRY бейдж
    const inTry = tryBlockRanges.some((r) => i >= r.start && i <= r.end);
    if (inTry && !meta.some((m) => m.kind === 'try')) {
      meta.push({ kind: 'try', title: i === tryBlockRanges.find((r) => r.start === i)?.start ? 'TRY-BLOCK' : undefined });
    }

    if (meta.length > 0) step.blockMeta = meta;
  }

  if (!scenarioFailsafe && softLines.length === 0 && recoverBlocks.length === 0 && tryBlockRanges.length === 0) {
    return null; // нет оверлеев — нулевой шум
  }

  return { scenarioFailsafe, tryBlockRanges, recoverBlocks };
}