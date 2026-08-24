/**
 * Pretty assign RHS diagnostics (S3776).
 */
import {
  hasBarePrettyArg,
  isBarePrettyArg,
  isQuotedScalar,
  isRefToken,
} from './prettyToWire';
import { splitFirstToken } from './textScan';

export type RhsDiag = {
  severity: 'error';
  message: string;
  start: number;
  end: number;
};

type Push = (
  diagnostics: RhsDiag[],
  message: string,
  lineStart: number,
  lineEnd: number,
) => void;

const DATA_OP_HEADS = new Set(
  [
    'Склеить',
    'Содержит',
    'Подстрока',
    'Заменить',
    'ЗаменитьРег',
    'Разделить',
    'РазделитьРег',
    'Обрезать',
    'Начинается',
    'Заканчивается',
    'Верхний',
    'Нижний',
    'ВзятьДо',
    'ВзятьПосле',
    'Убрать',
    'СовпадаетРег',
    'ИзвлечьРег',
    'ИзвлечьРегВсе',
  ].map((s) => s.toLowerCase()),
);

const GENERATOR_EXACT = new Set(['uuid', 'сейчас', 'таймстамп', 'пошаблону']);

export const COLLECTION_RHS_HEADS = new Set(['список', 'массив', 'объект', 'словарь']);

export function matchDataOpRhs(rhs: string): { rest: string } | undefined {
  const { head, rest } = splitFirstToken(rhs.trim());
  if (!head || !DATA_OP_HEADS.has(head.toLowerCase()) || !rest) {
    return undefined;
  }
  return { rest };
}

export function isGeneratorRhs(rhs: string): boolean {
  const t = rhs.trim();
  if (!t || /\s/.test(t)) {
    return false;
  }
  const low = t.toLowerCase();
  if (GENERATOR_EXACT.has(low)) {
    return true;
  }
  return (
    low.startsWith('случайный') || low.startsWith('случайная') || low.startsWith('случайные')
  );
}

/** `Размер $x` / `Размер foo` — один аргумент или undefined. */
export function matchSizeRhsArg(rhs: string): string | undefined {
  const trimmed = rhs.trim();
  const { head, rest } = splitFirstToken(trimmed);
  if (head.toLowerCase() !== 'размер') {
    return undefined;
  }
  const arg = rest.trim();
  if (!arg || /\s/.test(arg)) {
    return undefined;
  }
  return arg;
}

export function diagnosePrettyAssignRhsLine(
  rhs: string,
  diagnostics: RhsDiag[],
  lineStart: number,
  lineEnd: number,
  helpers: {
    pushDiag: Push;
    bareArgMsg: string;
  },
): void {
  const sizeArg = matchSizeRhsArg(rhs);
  if (sizeArg !== undefined && !isRefToken(sizeArg) && !isQuotedScalar(sizeArg)) {
    helpers.pushDiag(
      diagnostics,
      'Размер: нужна ссылка $name или ${name}. Пример: Пусть $n = Размер $data_module',
      lineStart,
      lineEnd,
    );
  }
  const dataOp = matchDataOpRhs(rhs);
  if (dataOp && hasBarePrettyArg(dataOp.rest)) {
    helpers.pushDiag(diagnostics, helpers.bareArgMsg, lineStart, lineEnd);
    return;
  }
  if (!rhs || dataOp || sizeArg !== undefined || /\s/.test(rhs)) {
    return;
  }
  const first = splitFirstToken(rhs).head.toLowerCase();
  if (COLLECTION_RHS_HEADS.has(first) || isGeneratorRhs(rhs)) {
    return;
  }
  if (isBarePrettyArg(rhs)) {
    helpers.pushDiag(diagnostics, helpers.bareArgMsg, lineStart, lineEnd);
  }
}
