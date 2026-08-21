/**
 * Общие keyword-сниппеты языка для constructor + pk-script.
 * Не runtime-ворота — только AC / подсказки редактора.
 */
import type * as monacoNs from 'monaco-editor';

export type LanguageKw = { label: string; insertText: string; detail: string };

/** @-directives — header annotations (Description/Title/Tag/Author). */
export const AT_DIRECTIVE_KEYWORDS: ReadonlyArray<LanguageKw> = [
  { label: '@ Title', insertText: '@ Title ${1:название}', detail: 'заголовок сценария' },
  { label: '@ Название', insertText: '@ Название ${1:название}', detail: 'заголовок сценария' },
  { label: '@ Description', insertText: '@ Description ${1:описание}', detail: 'описание для Allure / шагов' },
  { label: '@ Описание', insertText: '@ Описание ${1:описание}', detail: 'описание для Allure / шагов' },
  { label: '@ Tag', insertText: '@ Tag ${1:тег}', detail: 'тег сценария' },
  { label: '@ Тег', insertText: '@ Тег ${1:тег}', detail: 'тег сценария' },
  { label: '@ Author', insertText: '@ Author ${1:автор}', detail: 'автор' },
  { label: '@ Автор', insertText: '@ Автор ${1:автор}', detail: 'автор' },
];

/** Control + must-have data — первая стрелка. */
export const ROOT_LANGUAGE_KEYWORDS: ReadonlyArray<LanguageKw> = [
  { label: 'Пусть', insertText: 'Пусть $${1:name} = ${2:value}', detail: 'присвоить переменную' },
  { label: 'Секрет', insertText: 'Секрет $${1:name} = ${2:value}', detail: 'секрет (маскируется в логах)' },
  { label: 'Если', insertText: 'Если ${1:cond} {\n\t$0\n}', detail: 'ветвление' },
  { label: 'ИначеЕсли', insertText: 'ИначеЕсли ${1:cond} {\n\t$0\n}', detail: 'ветка else-if' },
  { label: 'Иначе', insertText: 'Иначе {\n\t$0\n}', detail: 'ветка else' },
  { label: 'Цикл', insertText: 'Цикл ${1:n} {\n\t$0\n}', detail: 'счётный цикл' },
  {
    label: 'ДляКаждого',
    insertText: 'ДляКаждого $${1:item} В $${2:list} {\n\t$0\n}',
    detail: 'обход списка/словаря',
  },
  { label: 'Пока', insertText: 'Пока ${1:cond} {\n\t$0\n}', detail: 'while' },
  {
    label: 'Попробовать',
    insertText: 'Попробовать {\n\t$0\n} Перехватить {\n\t\n} Финализировать {\n\t\n}',
    detail: 'try/catch/finally',
  },
  { label: 'Перехватить', insertText: 'Перехватить {\n\t$0\n}', detail: 'catch' },
  { label: 'Финализировать', insertText: 'Финализировать {\n\t$0\n}', detail: 'finally' },
  { label: 'Группа', insertText: 'Группа "${1:title}" {\n\t$0\n}', detail: 'Allure-группа' },
  { label: 'Прервать', insertText: 'Прервать', detail: 'break' },
  { label: 'Продолжить', insertText: 'Продолжить', detail: 'continue' },
  { label: 'Добавить', insertText: 'Добавить ${1:value} в ${2:list}', detail: 'append в список' },
  { label: 'Размер', insertText: 'Размер ${1:name}', detail: 'длина списка/словаря' },
  { label: 'Склеить', insertText: 'Склеить ${1:a} ${2:b}', detail: 'склеить строки (RHS Пусть)' },
  { label: 'Содержит', insertText: 'Содержит ${1:hay} ${2:needle}', detail: 'bool: hay содержит needle' },
  { label: 'Обрезать', insertText: 'Обрезать ${1:s}', detail: 'strip пробелов (RHS Пусть)' },
  {
    label: 'СовпадаетРег',
    insertText: 'СовпадаетРег ${1:s} "${2:^\\\\d+$}"',
    detail: 'bool: re.search (RHS Пусть)',
  },
  {
    label: 'ЗаменитьРег',
    insertText: 'ЗаменитьРег ${1:s} "${2:\\\\s+}" "${3: }"',
    detail: 're.sub все вхождения (RHS Пусть)',
  },
  { label: 'То', insertText: 'То ', detail: 'часть Если … То' },
  { label: 'В', insertText: 'В ', detail: 'часть ДляКаждого … В' },
];

/**
 * Контейнеры / локаторы — ворота «Объект» (зеркало Операция).
 * Не runtime-префикс: в сценарии пиши `Пусть … = Объект {` без слова-ворот.
 */
export const OBJECT_KEYWORDS: ReadonlyArray<LanguageKw> = [
  {
    label: 'Объект',
    insertText: 'Пусть ${1:x} = Объект {\n\t$0\n}',
    detail: 'Объект → DTO / запись',
  },
  {
    label: 'Словарь',
    insertText: 'Пусть ${1:map} = Словарь {\n\t$0\n}',
    detail: 'Объект → карта (ДляКаждого k,v)',
  },
  {
    label: 'Список',
    insertText: 'Пусть ${1:items} = Список [$0]',
    detail: 'Объект → список',
  },
  {
    label: 'Массив',
    insertText: 'Пусть ${1:items} = Список [$0]',
    detail: 'Объект → alias Списка',
  },
  {
    label: 'Элемент',
    insertText: 'Пусть ${1:el} = Элемент css ${2:#id}',
    detail: 'Объект → lazy локатор (не WebElement)',
  },
  {
    label: 'Локатор',
    insertText: 'Пусть ${1:el} = Локатор css ${2:#id}',
    detail: 'Объект → синоним Элемент',
  },
  {
    label: 'Селектор',
    insertText: 'Пусть ${1:el} = Селектор css ${2:#id}',
    detail: 'Объект → синоним Элемент',
  },
  {
    label: 'КоллекцияЭлементов',
    insertText: 'Пусть ${1:rows} = КоллекцияЭлементов css ${2:.item}',
    detail: 'Объект → lazy коллекция (Selene all)',
  },
  {
    label: 'Элемент (макет)',
    insertText: 'Элемент ${1:email} = css ${2:#email}',
    detail: 'Объект → декларация в макете страницы',
  },
  {
    label: 'Операция (макет)',
    insertText: 'Операция ${1:Войти} {\n\t$0\n}',
    detail: 'Объект → named action страницы',
  },
];

/** RHS после `Пусть … =` — литералы без обёртки Пусть. */
export const OBJECT_RHS: ReadonlyArray<LanguageKw> = [
  { label: 'Объект', insertText: 'Объект {\n\t$0\n}', detail: 'литерал DTO' },
  { label: 'Словарь', insertText: 'Словарь {\n\t$0\n}', detail: 'литерал словаря' },
  { label: 'Список', insertText: 'Список [$0]', detail: 'литерал списка' },
  { label: 'Массив', insertText: 'Список [$0]', detail: 'alias Списка' },
  { label: 'Элемент', insertText: 'Элемент css ${1:#id}', detail: 'lazy локатор' },
  { label: 'Локатор', insertText: 'Локатор css ${1:#id}', detail: 'синоним Элемент' },
  { label: 'Селектор', insertText: 'Селектор css ${1:#id}', detail: 'синоним Элемент' },
  {
    label: 'КоллекцияЭлементов',
    insertText: 'КоллекцияЭлементов css ${1:.item}',
    detail: 'lazy коллекция',
  },
];

/** Тяжёлые строки — только группа Операция / после `=` в Пусть. */
export const OPERATION_KEYWORDS: ReadonlyArray<LanguageKw> = [
  {
    label: 'ИзвлечьРег',
    insertText: 'Пусть ${1:x} = ИзвлечьРег ${2:s} "${3:(\\\\d+)}"',
    detail: 'Операция → первая группа / match',
  },
  {
    label: 'ИзвлечьРегВсе',
    insertText: 'Пусть ${1:x} = ИзвлечьРегВсе ${2:s} "${3:\\\\d+}"',
    detail: 'Операция → все match → Список',
  },
  {
    label: 'РазделитьРег',
    insertText: 'Пусть ${1:x} = РазделитьРег ${2:s} "${3:\\\\s+}"',
    detail: 'Операция → re.split → Список',
  },
  {
    label: 'Подстрока',
    insertText: 'Пусть ${1:x} = Подстрока ${2:s} ${3:0} ${4:5}',
    detail: 'Операция → slice',
  },
  {
    label: 'Заменить',
    insertText: 'Пусть ${1:x} = Заменить ${2:s} "${3:old}" "${4:new}"',
    detail: 'Операция → replace литерал',
  },
  {
    label: 'Разделить',
    insertText: 'Пусть ${1:x} = Разделить ${2:s} "${3:,}"',
    detail: 'Операция → split → Список',
  },
  {
    label: 'Начинается',
    insertText: 'Пусть ${1:ok} = Начинается ${2:s} "${3:prefix}"',
    detail: 'Операция → startsWith',
  },
  {
    label: 'Заканчивается',
    insertText: 'Пусть ${1:ok} = Заканчивается ${2:s} "${3:suffix}"',
    detail: 'Операция → endsWith',
  },
  { label: 'Верхний', insertText: 'Пусть ${1:x} = Верхний ${2:s}', detail: 'Операция → UPPER' },
  { label: 'Нижний', insertText: 'Пусть ${1:x} = Нижний ${2:s}', detail: 'Операция → lower' },
  {
    label: 'ВзятьДо',
    insertText: 'Пусть ${1:x} = ВзятьДо ${2:s} "${3:delim}"',
    detail: 'Операция → fetch left',
  },
  {
    label: 'ВзятьПосле',
    insertText: 'Пусть ${1:x} = ВзятьПосле ${2:s} "${3:delim}"',
    detail: 'Операция → fetch right',
  },
  {
    label: 'Убрать',
    insertText: 'Пусть ${1:x} = Убрать ${2:s} "${3:piece}"',
    detail: 'Операция → remove литерал',
  },
  {
    label: 'СлучайныйEmail',
    insertText: 'Пусть $${1:email} = СлучайныйEmail',
    detail: 'Операция → уникальный email (домен опционально)',
  },
  {
    label: 'СлучайнаяСтрока',
    insertText: 'Пусть ${1:x} = СлучайнаяСтрока ${2:8}',
    detail: 'Операция → буквы+цифры заданной длины',
  },
  {
    label: 'СлучайноеЧисло',
    insertText: 'Пусть ${1:n} = СлучайноеЧисло ${2:1} ${3:100}',
    detail: 'Операция → int в диапазоне',
  },
  {
    label: 'СлучайныеЦифры',
    insertText: 'Пусть ${1:pin} = СлучайныеЦифры ${2:4}',
    detail: 'Операция → строка из цифр',
  },
  {
    label: 'СлучайныеБуквы',
    insertText: 'Пусть ${1:x} = СлучайныеБуквы ${2:8}',
    detail: 'Операция → строка из букв',
  },
  {
    label: 'СлучайныеСтрочные',
    insertText: 'Пусть ${1:x} = СлучайныеСтрочные ${2:8}',
    detail: 'Операция → строчные буквы',
  },
  {
    label: 'СлучайныеПрописные',
    insertText: 'Пусть ${1:x} = СлучайныеПрописные ${2:8}',
    detail: 'Операция → прописные буквы',
  },
  {
    label: 'СлучайныйТелефон',
    insertText: 'Пусть ${1:phone} = СлучайныйТелефон',
    detail: 'Операция → телефон (код страны опционально)',
  },
  {
    label: 'ПоШаблону',
    insertText: 'Пусть ${1:x} = ПоШаблону "${2:[A-Z]{3}-[0-9]{4}}"',
    detail: 'Операция → генерация по шаблону',
  },
  { label: 'UUID', insertText: 'Пусть ${1:id} = UUID', detail: 'Операция → uuid4' },
  {
    label: 'Сейчас',
    insertText: 'Пусть ${1:now} = Сейчас',
    detail: 'Операция → дата-время строкой (формат опционально)',
  },
  {
    label: 'Таймстамп',
    insertText: 'Пусть ${1:ts} = Таймстамп',
    detail: 'Операция → unix-время, int',
  },
  {
    label: 'ФорматДаты',
    insertText: 'Пусть ${1:s} = ФорматДаты ${2:dt} "${3:%d.%m.%Y}"',
    detail: 'Операция → дата → строка',
  },
  {
    label: 'РазобратьДату',
    insertText: 'Пусть ${1:dt} = РазобратьДату ${2:s} "${3:%Y-%m-%d %H:%M:%S}"',
    detail: 'Операция → строка → дата',
  },
];

export const OPERATION_RHS: ReadonlyArray<LanguageKw> = OPERATION_KEYWORDS.map((kw) => ({
  label: kw.label,
  insertText: kw.insertText.replace(/^Пусть \$\{1:\w+\} = /, ''),
  detail: kw.detail,
}));

export const TRY_QUESTION_SNIPPET: LanguageKw = {
  label: '?',
  insertText: '? {\n\t$0\n} > {\n\t\n} >! {\n\t\n}',
  detail: 'try/catch/finally (зеркало Попробовать)',
};

/** Родственные блоки языка: catch / finally / полное Попробовать. */
export const TRY_RELATED_SNIPPETS: ReadonlyArray<LanguageKw> = [
  TRY_QUESTION_SNIPPET,
  {
    label: '> {…}',
    insertText: '> {\n\t$0\n}',
    detail: 'блок catch (после ? {…})',
  },
  {
    label: '>! {…}',
    insertText: '>! {\n\t$0\n}',
    detail: 'блок finally (после ? / >)',
  },
  {
    label: 'Попробовать',
    insertText: 'Попробовать {\n\t$0\n} Перехватить {\n\t\n} Финализировать {\n\t\n}',
    detail: 'try/catch/finally словами',
  },
];

/** Хвост строки после range вставки пуст → можно полный конструктор-сниппет. */
export function lineTailEmptyAfterRange(
  lineContent: string,
  rangeEndColumn1Based: number,
): boolean {
  return lineContent.slice(rangeEndColumn1Based - 1).trim().length === 0;
}

/**
 * Range замены для AC: слово у курсора ∪ выделение в том же редакторе.
 * Без выделения Monaco вставляет insertText в word-range и старый текст остаётся рядом.
 */
export function completionReplaceRange(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
): monacoNs.IRange {
  const word = model.getWordUntilPosition(position);
  let startColumn = word.startColumn;
  let endColumn = Math.max(word.endColumn, position.column);
  for (const ed of monaco.editor.getEditors()) {
    if (ed.getModel() !== model) {
      continue;
    }
    const sel = ed.getSelection();
    if (!sel || sel.isEmpty()) {
      continue;
    }
    if (
      sel.startLineNumber === position.lineNumber &&
      sel.endLineNumber === position.lineNumber
    ) {
      startColumn = Math.min(startColumn, sel.startColumn, sel.endColumn);
      endColumn = Math.max(endColumn, sel.startColumn, sel.endColumn);
    }
  }
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn,
  };
}

function keywordOnlyInsert(label: string, lineAfterRange: string): string {
  const needsSpace = lineAfterRange.length > 0 && !/^\s/.test(lineAfterRange);
  return needsSpace ? `${label} ` : label;
}

export function languageKwItems(
  monaco: typeof monacoNs,
  keywords: ReadonlyArray<LanguageKw>,
  range: monacoNs.IRange,
  sortPrefix: string,
  /** false → только label (строка после курсора/выделения не пуста). */
  fullSnippet = true,
  lineAfterRange = '',
): monacoNs.languages.CompletionItem[] {
  return keywords.map((kw) => {
    const useFull = fullSnippet || kw.insertText === kw.label;
    const insertText = useFull
      ? kw.insertText
      : keywordOnlyInsert(kw.label, lineAfterRange);
    return {
      label: kw.label,
      kind:
        kw.label === '?'
          ? monaco.languages.CompletionItemKind.Snippet
          : monaco.languages.CompletionItemKind.Keyword,
      insertText,
      insertTextRules: useFull
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      detail: kw.detail,
      range,
      sortText: `${sortPrefix}${kw.label}`,
    };
  });
}

/** Полный сниппет только если хвост строки после range пуст. */
export function languageKwItemsForModel(
  monaco: typeof monacoNs,
  keywords: ReadonlyArray<LanguageKw>,
  range: monacoNs.IRange,
  sortPrefix: string,
  model: monacoNs.editor.ITextModel,
): monacoNs.languages.CompletionItem[] {
  const line = model.getLineContent(range.startLineNumber);
  const full = lineTailEmptyAfterRange(line, range.endColumn);
  const after = line.slice(range.endColumn - 1);
  return languageKwItems(monaco, keywords, range, sortPrefix, full, after);
}
