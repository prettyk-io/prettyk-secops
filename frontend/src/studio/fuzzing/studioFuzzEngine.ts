/**
 * CD-9a: Движок фаззинга для Studio (Burp-killer).
 * Изолированный рантайм: генерация мутаций шаблона, запуск запросов,
 * подсчёт диффов и задержек, сбор результатов.
 */

export interface FuzzPosition {
  type: 'query' | 'body_field' | 'raw_body';
  name: string;
  originalValue: string;
}

/**
 * Burp Intruder-стиль режимы атаки:
 *  - sniper: один набор пейлоадов, по очереди в каждую позицию (N×P).
 *  - battering_ram: один набор, одновременно во все позиции (P).
 *  - pitchfork: свой набор на каждую позицию, итерация параллельно (P).
 *  - cluster_bomb: декартово произведение наборов по позициям (p1×p2×…).
 */
export type AttackMode = 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb';

export interface FuzzRequestItem {
  id: number;
  url: string;
  method: string;
  payload: string;
  paramName: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FuzzResultItem {
  id: number;
  payload: string;
  paramName: string;
  status: number;
  length: number;
  elapsedMs: number;
  diffCount: number;
  responseBody: string;
  error?: string;
  grepMatches?: Record<string, boolean>;
  grepExtracts?: Record<string, string[]>;
}

export interface GrepRule {
  key: string;
  pattern: string;
  isRegex?: boolean;
}

export const DEFAULT_STUDIO_PAYLOADS = [
  // Спецсимволы и кавычки
  "'",
  '"',
  '`',
  '<script>alert(1)</script>',
  '"><svg/onload=alert(1)>',
  // SQLi smoke
  "' OR '1'='1",
  "' UNION SELECT NULL--",
  "1; WAITFOR DELAY '0:0:5'--",
  // Command injection
  '; id',
  '| whoami',
  '`id`',
  '$(whoami)',
  // Traversal & SSTI
  '../../../../etc/passwd',
  '..\\..\\..\\windows\\win.ini',
  '{{7*7}}',
  '${7*7}',
  // Граничные значения и байты
  '0',
  '-1',
  '99999999',
  'null',
  '%00',
  '\\0',
  'A'.repeat(255),
];

/**
 * Создаёт пачку запросов для заданного параметра/позиции и набора плейлоадов.
 */
export function buildFuzzRequests(
  baseMethod: string,
  baseUrl: string,
  position: FuzzPosition,
  payloads: string[] = DEFAULT_STUDIO_PAYLOADS,
  baseHeaders: Record<string, string> = {},
  baseBody?: string
): FuzzRequestItem[] {
  const method = (baseMethod || 'GET').toUpperCase();

  return payloads.map((payload, idx) => {
    let finalUrl = baseUrl;
    let finalBody = baseBody;

    if (position.type === 'query') {
      try {
        const u = new URL(baseUrl, 'http://127.0.0.1');
        u.searchParams.set(position.name, payload);
        finalUrl = baseUrl.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
      } catch {
        const sep = baseUrl.includes('?') ? '&' : '?';
        finalUrl = `${baseUrl}${sep}${encodeURIComponent(position.name)}=${encodeURIComponent(payload)}`;
      }
    } else if (position.type === 'body_field') {
      if (baseBody && (baseBody.startsWith('{') || baseBody.startsWith('['))) {
        try {
          const parsed = JSON.parse(baseBody);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsed[position.name] = payload;
            finalBody = JSON.stringify(parsed);
          }
        } catch {
          finalBody = baseBody;
        }
      }
    } else if (position.type === 'raw_body') {
      finalBody = payload;
    }

    return {
      id: idx + 1,
      url: finalUrl,
      method,
      payload,
      paramName: position.name,
      headers: { ...baseHeaders },
      body: finalBody,
    };
  });
}

/**
 * Вычисляет разницу в символах / словах между baseline ответом и мутированным.
 */
export function calculateResponseDiff(baseline: string, current: string): number {
  if (baseline === current) return 0;
  return Math.abs(current.length - baseline.length);
}

/**
 * Применяет один пейлоад к одной позиции в URL/body (без создания запроса).
 * Возвращает { url, body } после подстановки.
 */
export function applyPayloadToTarget(
  baseUrl: string,
  baseBody: string | undefined,
  position: FuzzPosition,
  payload: string
): { url: string; body?: string } {
  let finalUrl = baseUrl;
  let finalBody = baseBody;

  if (position.type === 'query') {
    try {
      const u = new URL(baseUrl, 'http://127.0.0.1');
      u.searchParams.set(position.name, payload);
      finalUrl = baseUrl.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
    } catch {
      const sep = baseUrl.includes('?') ? '&' : '?';
      finalUrl = `${baseUrl}${sep}${encodeURIComponent(position.name)}=${encodeURIComponent(payload)}`;
    }
  } else if (position.type === 'body_field') {
    if (baseBody && (baseBody.startsWith('{') || baseBody.startsWith('['))) {
      try {
        const parsed = JSON.parse(baseBody);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed[position.name] = payload;
          finalBody = JSON.stringify(parsed);
        }
      } catch {
        finalBody = baseBody;
      }
    }
  } else if (position.type === 'raw_body') {
    finalBody = payload;
  }

  return { url: finalUrl, body: finalBody };
}

/**
 * Burp Intruder-стиль: генерация пачки запросов по мульти-словарной схеме атаки.
 * Поддерживает sniper / battering_ram / pitchfork / cluster_bomb.
 *
 * Семантика:
 *  - sniper: один список пейлоадов → по очереди в каждую позицию (N позиций × P пейлоадов).
 *  - battering_ram: один пейлоад во все позиции одновременно (P пейлоадов).
 *  - pitchfork: свой список на каждую позицию, итерация параллельно (max длина);
 *    если список позиции короче шага — остаётся оригинальное значение.
 *  - cluster_bomb: декартово произведение списков (len(set1) × len(set2) × …).
 */
export function buildAttackRequests(
  baseMethod: string,
  baseUrl: string,
  positions: FuzzPosition[],
  payloadSets: string[][],
  mode: AttackMode,
  baseHeaders: Record<string, string> = {},
  baseBody?: string,
): FuzzRequestItem[] {
  const method = (baseMethod || 'GET').toUpperCase();
  if (!positions.length) return [];

  const set0 = payloadSets[0] ?? [];
  if (set0.length === 0) return [];

  const buildItem = (
    id: number,
    position: FuzzPosition,
    payload: string,
    paramName: string,
  ): FuzzRequestItem => {
    const target = applyPayloadToTarget(baseUrl, baseBody, position, payload);
    return {
      id,
      url: target.url,
      method,
      payload,
      paramName,
      headers: { ...baseHeaders },
      body: target.body,
    };
  };

  if (mode === 'battering_ram') {
    // Один набор → один пейлоад во все позиции одновременно.
    return set0.map((payload, idx) => {
      let url = baseUrl;
      let body = baseBody;
      for (const pos of positions) {
        const t = applyPayloadToTarget(url, body, pos, payload);
        url = t.url;
        body = t.body;
      }
      return {
        id: idx + 1,
        url,
        method,
        payload,
        paramName: positions.map((p) => p.name).join(','),
        headers: { ...baseHeaders },
        body,
      };
    });
  }

  if (mode === 'cluster_bomb') {
    // Декартово произведение: каждый набор — на свою позицию.
    const perPosSets = positions.map((_, i) => payloadSets[i] ?? set0);
    if (perPosSets.some((s) => s.length === 0)) return [];
    const out: FuzzRequestItem[] = [];
    const idCounter = { n: 0 };
    const cartesian = (depth: number, acc: { url: string; body?: string; payloads: string[] }) => {
      if (depth >= positions.length) {
        idCounter.n += 1;
        if (idCounter.n > 50000) return;
        out.push({
          id: idCounter.n,
          url: acc.url,
          method,
          payload: acc.payloads.join('|'),
          paramName: positions.map((p) => p.name).join(','),
          headers: { ...baseHeaders },
          body: acc.body,
        });
        return;
      }
      const pos = positions[depth];
      if (!pos) return;
      for (const pld of perPosSets[depth] || []) {
        const t = applyPayloadToTarget(acc.url, acc.body, pos, pld);
        cartesian(depth + 1, {
          url: t.url,
          body: t.body,
          payloads: [...acc.payloads, pld],
        });
        if (idCounter.n > 50000) break;
      }
    };
    cartesian(0, { url: baseUrl, body: baseBody, payloads: [] });
    return out;
  }

  // pitchfork: свой набор на каждую позицию, параллельно.
  if (mode === 'pitchfork') {
    const perPosSets = positions.map((_, i) => payloadSets[i] ?? []);
    const maxLen = Math.max(...perPosSets.map((s) => s.length));
    const out: FuzzRequestItem[] = [];
    for (let step = 0; step < maxLen; step += 1) {
      let url = baseUrl;
      let body = baseBody;
      const payloads: string[] = [];
      for (let i = 0; i < positions.length; i += 1) {
        const pos = positions[i];
        if (!pos) continue;
        const set = perPosSets[i] ?? [];
        // Набор короче шага → остаётся оригинальное значение позиции.
        const pld = step < set.length ? (set[step] as string) : pos.originalValue;
        payloads.push(pld);
        const t = applyPayloadToTarget(url, body, pos, pld);
        url = t.url;
        body = t.body;
      }
      out.push({
        id: step + 1,
        url,
        method,
        payload: payloads.join('|'),
        paramName: positions.map((p) => p.name).join(','),
        headers: { ...baseHeaders },
        body,
      });
    }
    return out;
  }

  // sniper (default): один набор → по очереди в каждую позицию.
  const out: FuzzRequestItem[] = [];
  let id = 0;
  for (const pos of positions) {
    for (const pld of set0) {
      id += 1;
      out.push(buildItem(id, pos, pld, pos.name));
    }
  }
  return out;
}

/**
 * Выполняет один фаззинг-запрос через fetch (с замером времени и обработкой ошибок).
 */
export async function executeFuzzRequest(
  item: FuzzRequestItem,
  baselineBody: string = '',
  fetchFn: typeof fetch = fetch,
  grepMatchRules: GrepRule[] = [],
  grepExtractRules: GrepRule[] = []
): Promise<FuzzResultItem> {
  const start = Date.now();
  try {
    const res = await fetchFn(item.url, {
      method: item.method,
      headers: item.headers,
      body: item.method !== 'GET' && item.method !== 'HEAD' ? item.body : undefined,
    });
    const text = await res.text();
    const elapsedMs = Date.now() - start;
    const diffCount = calculateResponseDiff(baselineBody, text);
    const grepMatches = evaluateGrepMatches(text, grepMatchRules);
    const grepExtracts = evaluateGrepExtracts(text, grepExtractRules);

    return {
      id: item.id,
      payload: item.payload,
      paramName: item.paramName,
      status: res.status,
      length: text.length,
      elapsedMs,
      diffCount,
      responseBody: text,
      grepMatches,
      grepExtracts,
    };
  } catch (err: any) {
    const elapsedMs = Date.now() - start;
    return {
      id: item.id,
      payload: item.payload,
      paramName: item.paramName,
      status: 0,
      length: 0,
      elapsedMs,
      diffCount: 0,
      responseBody: '',
      error: err?.message || 'Network Error',
    };
  }
}

/** Проверяет наличие подстрок или регулярных выражений в теле ответа (Grep Match) */
export function evaluateGrepMatches(text: string, rules: GrepRule[]): Record<string, boolean> {
  if (!rules || rules.length === 0) return {};
  const res: Record<string, boolean> = {};
  for (const rule of rules) {
    if (!rule.pattern) continue;
    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, 'i');
        res[rule.key] = re.test(text);
      } catch {
        res[rule.key] = text.toLowerCase().includes(rule.pattern.toLowerCase());
      }
    } else {
      res[rule.key] = text.toLowerCase().includes(rule.pattern.toLowerCase());
    }
  }
  return res;
}

/** Извлекает группы захвата или подстроки из тела ответа (Grep Extract) */
export function evaluateGrepExtracts(text: string, rules: GrepRule[]): Record<string, string[]> {
  if (!rules || rules.length === 0) return {};
  const res: Record<string, string[]> = {};
  for (const rule of rules) {
    if (!rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, rule.isRegex ? 'gi' : 'i');
      if (rule.isRegex) {
        const matches = [...text.matchAll(re)];
        res[rule.key] = matches.map((m) => m[1] ?? m[0]);
      } else {
        const idx = text.indexOf(rule.pattern);
        res[rule.key] = idx !== -1 ? [rule.pattern] : [];
      }
    } catch {
      res[rule.key] = [];
    }
  }
  return res;
}

export interface AttackModeMeta {
  value: AttackMode;
  emoji: string;
  label: string;
  hint: string;
}

export const ATTACK_MODES: AttackModeMeta[] = [
  {
    value: 'sniper',
    emoji: '🎯',
    label: 'Sniper',
    hint: 'Один список пейлоадов по очереди в каждую позицию',
  },
  {
    value: 'battering_ram',
    emoji: '🔨',
    label: 'Battering Ram',
    hint: 'Один пейлоад во все позиции одновременно',
  },
  {
    value: 'pitchfork',
    emoji: '🍴',
    label: 'Pitchfork',
    hint: 'Свой список пейлоадов на каждую позицию, итерация параллельно',
  },
  {
    value: 'cluster_bomb',
    emoji: '💣',
    label: 'Cluster Bomb',
    hint: 'Декартово произведение всех списков пейлоадов на позиции',
  },
];

export interface PayloadPreset {
  key: string;
  label: string;
  payloads: string[];
}

/** Быстрые пресеты словарей для Payload Sets. */
export const PAYLOAD_PRESETS: PayloadPreset[] = [
  {
    key: 'sqli',
    label: 'SQL Injection',
    payloads: [
      "' OR '1'='1",
      "' OR '1'='1'--",
      "' UNION SELECT NULL--",
      "' UNION SELECT NULL,NULL--",
      "1; WAITFOR DELAY '0:0:5'--",
      "1' AND 1=1--",
      "'; DROP TABLE users--",
      "' OR 1=1 LIMIT 1--",
    ],
  },
  {
    key: 'xss_ssti',
    label: 'XSS/SSTI',
    payloads: [
      '<script>alert(1)</script>',
      '"><svg/onload=alert(1)>',
      "<img src=x onerror=alert(1)>",
      "'><script>alert(document.cookie)</script>",
      '{{7*7}}',
      '${7*7}',
      '#{7*7}',
      '<%= 7*7 %>',
    ],
  },
  {
    key: 'path_traversal',
    label: 'Path Traversal',
    payloads: [
      '../../../../etc/passwd',
      '../../../../etc/shadow',
      '..\\..\\..\\..\\windows\\win.ini',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc/passwd',
    ],
  },
  {
    key: 'admin_logins',
    label: 'Admin Logins',
    payloads: [
      'admin',
      'administrator',
      'root',
      'admin:admin',
      'admin:password',
      'admin:123456',
      'admin:admin123',
      "' OR '1'='1",
    ],
  },
  {
    key: 'boundary',
    label: 'Boundary Numbers',
    payloads: [
      '-1',
      '0',
      '1',
      '2147483647',
      '2147483648',
      '999999999999',
      '-999999999999',
      '1e309',
      'NaN',
      'Infinity',
    ],
  },
];

/** Подсчёт общего количества генерируемых запросов до старта. */
export function computeTotalRequests(
  mode: AttackMode,
  positions: FuzzPosition[],
  payloadSets: string[][],
): number {
  if (positions.length === 0) return 0;
  if (mode === 'sniper') {
    return positions.length * (payloadSets[0]?.length ?? 0);
  }
  if (mode === 'battering_ram') {
    return payloadSets[0]?.length ?? 0;
  }
  const sets = positions.map((_, i) => payloadSets[i] ?? payloadSets[0] ?? []);
  if (mode === 'pitchfork') {
    return sets.reduce((m, s) => Math.max(m, s.length), 0);
  }
  if (sets.some((s) => s.length === 0)) return 0;
  return sets.reduce((acc, s) => acc * s.length, 1);
}

export interface ReflectionPart {
  text: string;
  match: boolean;
}

/** Разбивает текст ответа на части с отметкой, где встречается отражённый пейлоад. */
export function splitReflectionHighlight(text: string, payload: string): ReflectionPart[] {
  if (!payload) return [{ text, match: false }];
  const parts: ReflectionPart[] = [];
  let cursor = 0;
  let idx = text.indexOf(payload);
  while (idx !== -1) {
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), match: false });
    parts.push({ text: payload, match: true });
    cursor = idx + payload.length;
    idx = text.indexOf(payload, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  if (parts.length === 0) parts.push({ text, match: false });
  return parts;
}
