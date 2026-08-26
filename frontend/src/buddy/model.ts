/**
 * CO-PILOT META (PoC) — BuddyModel swap-контракт.
 *
 * Модель НЕ закрепляется. Qwen3.6-35B-A3B (native tool calling) — кандидат,
 * но движок работает с любым реализующим контракт `BuddyModel`.
 *
 * Для PoC есть `DeterministicBuddyModel` — детерминированная реализация,
 * которая НЕ выдумывает (всё неуверенное помечает assumption) и позволяет
 * прогнать весь pipeline без живого LLM. Это не «модель», а эталон поведения:
 * живая модель должна быть не хуже неё по честности (не выдумывать, не терять
 * intent, не выводить секреты).
 */

import type {
  BuddyIntent,
  SkeletonData,
  ClarificationResult,
  BuddyProposal,
  Contradiction,
  ClarificationQuestion,
} from './types';

// ---------------------------------------------------------------------------
// Swap-контракт
// ---------------------------------------------------------------------------

export interface BuddyModel {
  /** Имя/идентификатор модели (для диагностики, не закрепляется). */
  readonly name: string;

  /** Извлечь skeleton из свободного описания. Ничего не выдумывать — всё
   *  неуверенное помечать как assumption. */
  extractSkeleton(intent: BuddyIntent): SkeletonData;

  /** Найти пробелы и противоречия. Противоречия блокируют генерацию. */
  clarify(intent: BuddyIntent, skeleton: SkeletonData): ClarificationResult;

  /** Собрать один page object + один scenario (reviewable). */
  buildProposal(intent: BuddyIntent, skeleton: SkeletonData): BuddyProposal;
}

// ---------------------------------------------------------------------------
// DeterministicBuddyModel (PoC fallback, эталон честности)
// ---------------------------------------------------------------------------

let _idCounter = 0;
function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

export function __resetBuddyIdCounter(): void {
  _idCounter = 0;
}

// Простые эвристики для PoC: страницы из URL-подобных токенов, действия из
// глаголов. Всё нераспознанное — assumption, НЕ факт.
const PAGE_PATH_RE = /\/[a-z0-9\-_:]+/gi;

const ACTION_VERBS: Array<{ re: RegExp; kind: 'open' | 'click' | 'type' | 'navigate' }> = [
  { re: /открыва[ею]т\s+(.+)/i, kind: 'open' },
  { re: /нажима[ею]т\s+(.+)/i, kind: 'click' },
  { re: /клика[ею]т\s+(.+)/i, kind: 'click' },
  { re: /вводит\s+(.+)/i, kind: 'type' },
  { re: /печатает\s+(.+)/i, kind: 'type' },
  { re: /переходит\s+на\s+(.+)/i, kind: 'navigate' },
];

const APP_TYPE_RE: Array<{ re: RegExp; type: string }> = [
  { re: /\bSPA\b/i, type: 'SPA' },
  { re: /\bMPA\b/i, type: 'MPA' },
  { re: /портал/i, type: 'portal' },
  { re: /магазин|каталог|корзин/i, type: 'e-commerce' },
];

/** Разбить текст на предложения. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Извлечь страницы из текста: URL-токены + явные упоминания. */
function extractPages(texts: string[]): SkeletonData['pages'] {
  const pages: SkeletonData['pages'] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    // URL-подобные токены → страницы с явным путём
    for (const m of text.matchAll(PAGE_PATH_RE)) {
      const path = m[0].toLowerCase();
      if (!seen.has(path)) {
        seen.add(path);
        const name = path.replace(/^\//, '').replace(/[-_:]/g, ' ');
        pages.push({ id: nextId('page'), name, path, confidence: 'explicit' });
      }
    }
  }

  return pages;
}

/** Извлечь действия: глаголы + цель. Нераспознанное — не выдумываем. */
function extractActions(texts: string[]): SkeletonData['actions'] {
  const actions: SkeletonData['actions'] = [];
  for (const text of texts) {
    for (const sent of sentences(text)) {
      for (const { re, kind } of ACTION_VERBS) {
        const m = sent.match(re);
        if (m && m[1]) {
          const target = m[1].trim().replace(/[.,;]+$/, '');
          actions.push({
            id: nextId('act'),
            kind,
            target,
            confidence: target ? 'explicit' : 'assumption',
          });
          break;
        }
      }
    }
  }
  return actions;
}

/** Извлечь ожидания: глаголы «видит/проверяет/убеждается». */
function extractExpectations(texts: string[]): SkeletonData['expectations'] {
  const expectations: SkeletonData['expectations'] = [];
  const re = /видит|проверяет|убеждается|ожидает|должен появиться|должен быть/i;
  for (const text of texts) {
    for (const sent of sentences(text)) {
      if (re.test(sent)) {
        expectations.push({
          id: nextId('exp'),
          description: sent.trim(),
          confidence: 'explicit',
        });
      }
    }
  }
  return expectations;
}

/** Детерминированно пометить предположения (ничего не выдумывать). */
export class DeterministicBuddyModel implements BuddyModel {
  readonly name = 'deterministic-buddy-poc';

  extractSkeleton(intent: BuddyIntent): SkeletonData {
    const texts = intent.messages.map((m) => m.text);

    const pages = extractPages(texts);
    const actions = extractActions(texts);
    const expectations = extractExpectations(texts);

    // Transitions: связываем страницы в порядке появления
    const transitions: SkeletonData['transitions'] = [];
    for (let i = 0; i < pages.length - 1; i++) {
      transitions.push({
        id: nextId('tr'),
        from: pages[i]!.name,
        to: pages[i + 1]!.name,
        via: 'navigate',
        confidence: 'assumption', // порядок — предположение, не факт
      });
    }

    // App type
    const appType = APP_TYPE_RE.find(({ re }) => texts.some((t) => re.test(t)))?.type;

    // Assumptions: всё, что не удалось распознать уверенно
    const assumptions: SkeletonData['assumptions'] = [];
    if (pages.length === 0) {
      assumptions.push({
        id: nextId('asm'),
        about: 'страницы приложения',
        reason: 'В описании не найдено ни одного URL-пути или явного имени страницы',
      });
    }
    if (actions.length === 0) {
      assumptions.push({
        id: nextId('asm'),
        about: 'действия пользователя',
        reason: 'В описании не найдено глаголов действия (открыть/нажать/ввести)',
      });
    }
    if (expectations.length === 0) {
      assumptions.push({
        id: nextId('asm'),
        about: 'ожидаемый результат',
        reason: 'В описании не найдено ожидания (видит/проверяет/должен быть)',
      });
    }
    transitions.forEach((t) => {
      if (t.confidence === 'assumption') {
        assumptions.push({
          id: nextId('asm'),
          about: `переход ${t.from} → ${t.to}`,
          reason: 'Порядок переходов не подтверждён явно, помечен как предположение',
        });
      }
    });

    return { appType, pages, transitions, actions, expectations, assumptions };
  }

  clarify(intent: BuddyIntent, skeleton: SkeletonData): ClarificationResult {
    const questions: ClarificationQuestion[] = [];
    const contradictions: Contradiction[] = [];

    // Пробелы
    if (skeleton.pages.length === 0) {
      questions.push({
        id: nextId('q'),
        about: 'страницы',
        question: 'Какие страницы есть в приложении? Укажите хотя бы одну (URL или имя).',
      });
    }
    if (skeleton.actions.length === 0) {
      questions.push({
        id: nextId('q'),
        about: 'действия',
        question: 'Какие действия выполняет пользователь? (открывает/нажимает/вводит)',
      });
    }
    if (skeleton.expectations.length === 0) {
      questions.push({
        id: nextId('q'),
        about: 'результат',
        question: 'Какой результат должен увидеть пользователь? (что должно появиться/измениться)',
      });
    }

    // Противоречия: ловим по СЫРОМУ тексту сообщений, а не по dedup-страницам.
    // Паттерн «X и есть, и нет» / «X на /path, но X нет» / дубль пути.
    const rawText = intent.messages.map((m) => m.text).join('\n');

    // 1. Дубль одного и того же пути в рамках одного сообщения
    const pathCounts = new Map<string, number>();
    for (const text of intent.messages.map((m) => m.text)) {
      for (const m of text.matchAll(PAGE_PATH_RE)) {
        const path = m[0].toLowerCase();
        pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
      }
    }
    for (const [path, count] of pathCounts) {
      if (count > 1) {
        contradictions.push({
          id: nextId('ctr'),
          left: path,
          right: path,
          detail: `Страница "${path}" упомянута ${count} раз — требуется уточнение, одно ли это состояние`,
        });
      }
    }

    // 2. Явное «X есть ... но X нет» (негативные маркеры рядом с сущностью)
    const negRe = /\b(нет|отсутствует|не существует|не показывается|убрали|удалили)\b/i;
    const entityRe = /\b(корзин|товар|страниц|кнопк|каталог|форма|меню)\w*\b/i;

    for (const text of intent.messages.map((m) => m.text)) {
      const neg = text.match(negRe);
      const entities = text.match(new RegExp(entityRe.source, 'gi')) ?? [];
      if (neg && entities.length > 0) {
        contradictions.push({
          id: nextId('ctr'),
          left: entities[0]!,
          right: 'нет',
          detail: `Утверждение «${neg[0]}» для «${entities[0]}» противоречит описанию сущности — генерация заблокирована`,
        });
      }
    }

    return {
      complete: questions.length === 0 && contradictions.length === 0,
      questions,
      contradictions,
    };
  }

  buildProposal(intent: BuddyIntent, skeleton: SkeletonData): BuddyProposal {
    // Один page object = первая (или единственная) страница + элементы
    const firstPage = skeleton.pages[0];
    const pageName = firstPage?.name ?? 'Main';
    const pagePath = firstPage?.path;

    const elements = firstPage
      ? [{ name: firstPage.name, locator: firstPage.path ?? firstPage.name }]
      : [];

    // Один scenario: Open первой страницы + действия + ожидания
    const steps: BuddyProposal['scenario']['steps'] = [];
    if (firstPage) {
      steps.push({
        id: nextId('step'),
        dsl: `Open ${pagePath ?? '/'}`,
        action: 'Open',
        strategy: 'css',
        strategyValue: '',
        payload: pagePath ?? '/',
      });
    }
    for (const act of skeleton.actions) {
      const dsl = act.kind === 'click'
        ? `Click css "${act.target}"`
        : act.kind === 'type'
          ? `Type css "${act.target}" $value`
          : act.kind === 'open' || act.kind === 'navigate'
            ? `Open ${act.target}`
            : `${act.kind} ${act.target}`;
      steps.push({
        id: nextId('step'),
        dsl,
        action: act.kind === 'click' ? 'Click' : act.kind === 'type' ? 'Type' : 'Open',
        strategy: 'css',
        strategyValue: act.target,
        payload: act.value ?? '',
      });
    }

    return {
      id: nextId('prop'),
      pageObject: { name: pageName, path: pagePath, elements },
      scenario: {
        name: 'Scenario',
        steps,
        expectations: skeleton.expectations,
      },
      sourceIntentId: intent.messages[0]?.id ?? 'intent',
    };
  }
}

/** Дефолтная swap-модель PoC. Живая модель подключается заменой константы. */
export const DEFAULT_BUDDY_MODEL: BuddyModel = new DeterministicBuddyModel();
