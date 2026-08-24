import type * as monacoNs from 'monaco-editor';
import { LIVE_BASE } from '../api/apiBase';

export interface SpiderUrlEntry {
  url: string;
  status: number;
  redirectUrl?: string;
  note?: string;
}

interface RunsIndexEntry {
  run_id: string;
  check_id?: string;
  instance_id?: string;
  app_code?: string;
  created_at?: number;
}

const PRETTYK_SPIDER_COMPLETIONS_PROVIDER = 'prettyk-spider-completions';

function fetchSpiderUrls(): Promise<SpiderUrlEntry[]> {
  return fetch(`${LIVE_BASE}/api/diary/spider_urls`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data: unknown) => {
      const arr = Array.isArray(data) ? data : [];
      return arr as SpiderUrlEntry[];
    })
    .catch(() => []);
}

function fetchAllRunUrls(): Promise<SpiderUrlEntry[]> {
  return fetch(`${LIVE_BASE}/api/runs/index`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((index: unknown) => {
      const entries = (Array.isArray(index) ? index : []) as RunsIndexEntry[];
      if (entries.length === 0) return [];
      const lastRun = entries[entries.length - 1];
      if (!lastRun?.run_id) return [];

      return fetch(`${LIVE_BASE}/api/journal/latest?run_id=${encodeURIComponent(lastRun.run_id)}`)
        .then((r2) => r2.json())
        .then((journal: unknown) => extractUrlsFromJournal(journal))
        .catch(() => []);
    })
    .catch(() => []);
}

function extractUrlsFromJournal(journal: unknown): SpiderUrlEntry[] {
  const urls = new Map<string, SpiderUrlEntry>();
  const events = Array.isArray(journal) ? journal : (journal as Record<string, unknown>)?.events;
  if (!Array.isArray(events)) return [];

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text : '';
    const urlMatch = text.match(/https?:\/\/[^\s"'|]+/gi);
    if (!urlMatch) continue;

    for (const u of urlMatch) {
      try {
        const url = new URL(u);
        const key = url.pathname;
        if (!urls.has(key)) {
          const status = typeof e.status === 'number' ? e.status : 200;
          urls.set(key, {
            url: url.pathname + url.search + url.hash,
            status,
            note: status >= 400 ? `${status}` : status >= 300 ? `${status}→` : undefined,
          });
        }
      } catch { /* invalid URL */ }
    }
  }
  return Array.from(urls.values()).slice(0, 100);
}

const DEMO_URLS: SpiderUrlEntry[] = [
  { url: '/login', status: 200 },
  { url: '/dashboard', status: 302 },
  { url: '/api/users', status: 401 },
  { url: '/admin', status: 403 },
  { url: '/backup.zip', status: 200, note: '⚠️' },
  { url: '/robots.txt', status: 200 },
  { url: '/.env', status: 403 },
  { url: '/swagger.json', status: 200 },
];

function statusLabel(entry: SpiderUrlEntry): string {
  if (entry.note) return entry.note;
  const s = entry.status;
  if (s >= 200 && s < 300) return '200';
  if (s >= 300 && s < 400) return `${s}`;
  if (s >= 400 && s < 500) return `${s}`;
  if (s >= 500) return `${s}`;
  return `${s}`;
}

function statusSort(entry: SpiderUrlEntry): number {
  const s = entry.status;
  if (s >= 200 && s < 300) return 0;
  if (s >= 300 && s < 400) return 1;
  if (s >= 400 && s < 500) return 2;
  return 3;
}

export function registerSpiderCompletionProvider(
  monaco: typeof monacoNs,
): monacoNs.IDisposable {
  let cachedUrls: SpiderUrlEntry[] = DEMO_URLS;
  let lastFetch = 0;
  let fetchPromise: Promise<void> | null = null;

  async function refreshUrls(): Promise<void> {
    if (Date.now() - lastFetch < 15000) return;
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
      const spider = await fetchSpiderUrls();
      if (spider.length > 0) {
        cachedUrls = spider;
      } else {
        const runs = await fetchAllRunUrls();
        if (runs.length > 0) cachedUrls = runs;
      }
      cachedUrls.sort((a, b) => statusSort(a) - statusSort(b));
      lastFetch = Date.now();
      fetchPromise = null;
    })();

    return fetchPromise;
  }

  refreshUrls();

  return monaco.languages.registerCompletionItemProvider('prettyk', {
    triggerCharacters: ['/', ' '],

    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);

      const openUrlMatch = textBeforeCursor.match(/(?:ОткрытьПоURL|открытьпоурл|открытьпоURL|открытьПоURL|Открыть(?:_|\s)(?:страницу|Страницу))\s+(.*)$/i);
      if (!openUrlMatch) return { suggestions: [] };

      refreshUrls();

      const prefix = openUrlMatch[1] || '';
      const items = cachedUrls
        .filter((u) => !prefix || u.url.toLowerCase().includes(prefix.toLowerCase()))
        .slice(0, 15)
        .map((u, idx) => ({
          label: u.url,
          kind: monaco.languages.CompletionItemKind.File,
          insertText: u.url,
          detail: `HTTP ${u.status}${u.note ? ` ${u.note}` : ''}`,
          documentation: `${u.url} → HTTP ${u.status}${u.redirectUrl ? ` (redirect → ${u.redirectUrl})` : ''}`,
          sortText: String(statusSort(u)).padStart(2, '0') + String(idx).padStart(3, '0'),
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column - prefix.length,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }));

      return { suggestions: items };
    },
  });
}