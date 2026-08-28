/**
 * Язык PrettyK: токены и LanguageConfiguration для Monaco.
 * Под капотом — setMonarchTokensProvider (движок редактора, не имя продукта).
 */
import type { languages } from 'monaco-editor';
import {
  methodIdAliases,
  methodIdEntries,
} from '../keywords/methodIds';
import { stripTrailingParenLabel } from '../keywords/textScan';
import {
  OBJECT_KEYWORDS,
  OBJECT_RHS,
  OPERATION_KEYWORDS,
  ROOT_LANGUAGE_KEYWORDS,
} from './languageKeywords';

/** Язык IDE PrettyK. */
export const PRETTYK_LANGUAGE_ID = 'prettyk';

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Без lookbehind. Якорь — начало строки / после `{([`, не любой пробел:
 * иначе гигантский alt MethodId дергается на каждое слово → лаг Backspace.
 */
function wordGroup(labels: readonly string[]): string {
  const uniq = [...new Set(labels.filter(Boolean))].sort((a, b) => b.length - a.length);
  const body = uniq.map(escapeRe).join('|');
  return `(?:^|[\\n{(\\[])\\s*(?:${body})(?![A-Za-zА-Яа-яЁё0-9_])`;
}

function labelsForComponents(components: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const entry of methodIdEntries) {
    if (components.has(entry.component)) {
      ids.add(entry.id);
    }
  }
  for (const [alias, canonical] of Object.entries(methodIdAliases)) {
    const entry = methodIdEntries.find((item) => item.id === canonical);
    if (entry && components.has(entry.component)) {
      ids.add(alias);
    }
  }
  return [...ids];
}

/** Как Пусть: core/allure-хром, не попадающий в scanner/selenium MethodId. */
const CHROME_KEYWORD_EXTRA = [
  'Пауза',
  'Скриншот',
  'СкриншотЭлемента',
  'ПриложитьСкриншот',
  'ПриложитьТекст',
  'ПриложитьJSON',
  'ПриложитьHTML',
  'ПриложитьФайл',
  'Лог',
  'ЛогПеременную',
  'Логировать',
  'ЛогСообщение',
] as const;

const CONTROL_WORDS = ROOT_LANGUAGE_KEYWORDS.map((item) => item.label);
const OBJECT_WORDS = [
  ...OBJECT_KEYWORDS.map((item) => stripTrailingParenLabel(item.label)),
  ...OBJECT_RHS.map((item) => item.label),
  'Операция',
  'Элемент',
];
const OPS_WORDS = OPERATION_KEYWORDS.map((item) => item.label);
const COND_OPS = ['содержит', 'совпадает', 'рег', 'начинается', 'заканчивается'] as const;

const KEYWORD_WORDS = [
  ...CONTROL_WORDS,
  ...OBJECT_WORDS,
  ...OPS_WORDS,
  ...COND_OPS,
  ...CHROME_KEYWORD_EXTRA,
];

const CHROME_SET = new Set<string>(CHROME_KEYWORD_EXTRA);
const scanner_WORDS = labelsForComponents(new Set(['scanner']));
const FUZZ_WORDS = labelsForComponents(new Set(['fuzz']));
const SELENIUM_WORDS = labelsForComponents(new Set(['webdriver', 'inspector'])).filter(
  (name) => !CHROME_SET.has(name),
);

const KEYWORD_RE = new RegExp(wordGroup(KEYWORD_WORDS));
const scanner_METHOD_RE = scanner_WORDS.length > 0 ? new RegExp(wordGroup(scanner_WORDS)) : null;
const FUZZ_METHOD_RE = FUZZ_WORDS.length > 0 ? new RegExp(wordGroup(FUZZ_WORDS)) : null;
const SELENIUM_METHOD_RE =
  SELENIUM_WORDS.length > 0 ? new RegExp(wordGroup(SELENIUM_WORDS)) : null;

const FACADE_scanner_RE = /(?:^|[\s{(\[])scanner(?![A-Za-zА-Яа-яЁё0-9_])/;
const FACADE_RE = /(?:^|[\s{(\[])(?:HTTP|Сессия|Драйвер|CDP|WD|Браузер)(?![A-Za-zА-Яа-яЁё0-9_])/;

const rootRules: languages.IMonarchLanguageRule[] = [
  [/\bcss\b/, { token: 'pk.locator', next: '@afterCss' }],
  [
    /\b(?:xpath|id|name|class|class_name|tag|tag_name|link|link_text|partial_link|partial_link_text|text|contains_text|text_contains)\b/,
    'pk.locator',
  ],
  // Отчёт / scanner Отчёт: format|template (как css/xpath).
  [
    /\b(?:traditional-html-plus|traditional-json-plus|traditional-xml-plus|traditional-html|traditional-json|traditional-xml|traditional-md|traditional-pdf|risk-confidence-html|high-level-report|sarif-json|sarif|modern|xml|json|html|md)\b/,
    'pk.locator',
  ],
  // @-директивы метаданных (@Title, @ Title, @Description, @ Description...) — жёлтый акцент.
  [/^\s*@\s*[A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё.-]*/, 'pk.atheader'],
  // Как language_parse._strip_comments: `/#/…` — URL-hash, не comment.
  // До общего argument, чтобы `host/#/x` не съел `/` и не оставил `#…` комментарием.
  [/\/#[^\s]*/, 'pk.argument'],
  // $ / ${…}: `$` синий (WD); `{`/`}` — delimiter (чёрные в теме), не selenium.
  // Имя — локатор/scanner. В строках — те же правила (@string*).
  [/\$(?=\{)/, { token: 'pk.method.selenium', next: '@varBraceOpen' }],
  [/\$(?=[A-Za-z_])/, { token: 'pk.method.selenium', next: '@varDollar' }],
  [/\$/, 'pk.variable.invalid'],
  // Scenario failsafe `<!>` (не action `>?`) — жёлтый акцент.
  [/^<!>/, 'pk.scenario.failsafe'],
  [/^\s*>!/, 'pk.keyword'],
  [/^\s*>/, 'pk.keyword'],
  [/^\s*\?/, 'pk.keyword'],
  [FACADE_scanner_RE, 'pk.method.scanner'],
  // Сессия / HTTP / … — тот же keyword, что Пусть (не серый facade).
  [FACADE_RE, 'pk.keyword'],
  [KEYWORD_RE, 'pk.keyword'],
];

if (scanner_METHOD_RE) {
  rootRules.push([scanner_METHOD_RE, 'pk.method.scanner']);
}
if (FUZZ_METHOD_RE) {
  // Тот же акцент, что scanner: сценарный Intruder-слой, не серый argument.
  rootRules.push([FUZZ_METHOD_RE, 'pk.method.scanner']);
}
if (SELENIUM_METHOD_RE) {
  rootRules.push([SELENIUM_METHOD_RE, 'pk.method.selenium']);
}

/** Bare numeric literals. Ids with digits stay in {@link PRETTYK_ARGUMENT_RE}. */
export const PRETTYK_NUMBER_RE = /\b\d+(?:\.\d+)?\b/;
/** Catch-all atom (ids, paths). Digits included — иначе `password2` → arg+number. */
export const PRETTYK_ARGUMENT_RE = /(?:[^\s#{}$\[\]()"'\/]|\/(?!#))+/;

rootRules.push(
  [/"/, { token: 'pk.string', next: '@stringDQ' }],
  [/'/, { token: 'pk.string', next: '@stringSQ' }],
  // Line-comment `#` вне строк; `css #id` — в @afterCss; `/#/…` — выше.
  [/#[^\n]*/, 'pk.comment'],
  [PRETTYK_NUMBER_RE, 'pk.number'],
  [/[{}()\[\]]/, 'delimiter.pk'],
  // Не глотать `/` перед `#` (`…/#/route`).
  [PRETTYK_ARGUMENT_RE, 'pk.argument'],
);

/** `$path` / `${path}` — как снаружи строк (зеркало expr.match_ref_at). */
// Сегменты строками (не RegExp.source + '?'): иначе `\]?` вместо `(?:\[…\])?`
// и `$username` крашится в одну букву. DRY устраивает Sonar, матч — нас.
const VAR_IDENT = String.raw`[A-Za-z_][A-Za-z0-9_]*`;
const VAR_INDEX_OPT = String.raw`(?:\[-?\d+\])?`;
const VAR_SEGMENT = `${VAR_IDENT}${VAR_INDEX_OPT}`;
export const VAR_DOLLAR_PATH = new RegExp(`${VAR_SEGMENT}(?:\\.${VAR_SEGMENT})*`);
const VAR_ENV_PATH = /ENV:[A-Za-z_][A-Za-z0-9_]*/;

const stringRefRules: languages.IMonarchLanguageRule[] = [
  [/\\./, 'pk.string'],
  [/\$(?=\{)/, { token: 'pk.method.selenium', next: '@varBraceOpen' }],
  [/\$(?=[A-Za-z_])/, { token: 'pk.method.selenium', next: '@varDollar' }],
  [/\$/, 'pk.variable.invalid'],
];

export const PRETTYK_TOKENS: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenizer: {
    root: rootRules,
    // switchTo (не next): иначе после `}` остаёмся в varBraceOpen и
    // следующий `"` строки съедается как invalid → весь хвост файла «строка».
    varBraceOpen: [
      [/\{/, { token: 'delimiter.pk', switchTo: '@varBrace' }],
      [/./, { token: 'pk.variable.invalid', next: '@pop' }],
    ],
    varBrace: [
      [/[^}]+/, 'pk.locator'],
      [/\}/, { token: 'delimiter.pk', next: '@pop' }],
      [/./, { token: 'pk.variable.invalid', next: '@pop' }],
    ],
    varDollar: [
      [VAR_DOLLAR_PATH, { token: 'pk.locator', next: '@pop' }],
      [VAR_ENV_PATH, { token: 'pk.locator', next: '@pop' }],
      [/./, { token: 'pk.variable.invalid', next: '@pop' }],
    ],
    // Лог "обход $n URL" / Пусть … = "…$x…"
    stringDQ: [
      ...stringRefRules,
      [/[^\\$"]+/, 'pk.string'],
      [/"/, { token: 'pk.string', next: '@pop' }],
    ],
    stringSQ: [
      ...stringRefRules,
      [/[^\\$']+/, 'pk.string'],
      [/'/, { token: 'pk.string', next: '@pop' }],
    ],
    // После `css` один селектор/ссылка и сразу root.
    // next:@varDollar оставлял afterCss на стеке → следующие MethodId без цвета.
    afterCss: [
      [/\s+/, 'white'],
      [/#?[^\s#{}$\[\]()"'\\]+/, { token: 'pk.argument', next: '@pop' }],
      [/\$(?=\{)/, { token: 'pk.method.selenium', switchTo: '@varBraceOpen' }],
      [/\$(?=[A-Za-z_])/, { token: 'pk.method.selenium', switchTo: '@varDollar' }],
      [/"/, { token: 'pk.string', switchTo: '@stringDQ' }],
      [/'/, { token: 'pk.string', switchTo: '@stringSQ' }],
      [/./, { token: 'pk.argument', next: '@pop' }],
    ],
  },
};

export const PRETTYK_LANGUAGE_CONFIG: languages.LanguageConfiguration = {
  comments: { lineComment: '#' },
  wordPattern: /[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/g,
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '${', close: '}' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
  ],
  surroundingPairs: [
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
  ],
};
