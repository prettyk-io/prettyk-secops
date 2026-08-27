/**
 * PK-WB-B1/B4 — BrowserSession Manager.
 *
 * Один CDP connection, изолированные BrowserContexts для Operator / Run / Debug.
 * Гарантирует: один Chromium-процесс, ноль дублирования.
 *
 * API серверного слоя (Playground :8765):
 *   GET  /api/browser/status              → BrowserSessionStatus
 *   POST /api/browser/navigate            → { url, context }
 *   POST /api/browser/screenshot          → { context } → { screenshot_base64 }
 *   POST /api/browser/eval                → { expression, context }
 *   POST /api/browser/context/ensure      → { context, url? } → { contextId }
 *   POST /api/browser/context/destroy     → { context }
 */

import { API_BASE } from '../api/apiBase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Изолированный контекст браузера: cookies/storage/сессии не пересекаются. */
export type BrowserContextKind = 'operator' | 'run' | 'debug';

/** Общий статус CDP-соединения. */
export interface BrowserSessionStatus {
  ok: boolean;
  connected: boolean;
  /** URL активной страницы в контексте оператора. */
  url?: string | null;
  /** Title страницы. */
  title?: string | null;
  /** Активные контексты. */
  contexts: BrowserContextKind[];
  /** Версия браузера / Chrome. */
  browserVersion?: string;
  /** Stable identity of the internal Studio authoring browser object. */
  browserId?: string | null;
  /** This session is for authoring, never execution. */
  purpose?: 'authoring';
  /** Internal Playwright transport, not external browser-hands CDP. */
  transport?: 'playwright';
  headless?: boolean;
}

/** Результат навигации. */
export interface NavigateResult {
  ok: boolean;
  url: string;
  /** Заголовок страницы после навигации. */
  title?: string;
  /** Время загрузки ms. */
  loadTimeMs?: number;
}

/** Результат скриншота. */
export interface ScreenshotResult {
  ok: boolean;
  /** Base64-encoded PNG. */
  screenshot?: string;
  /** Размеры вьюпорта. */
  viewport?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// BrowserSession — core manager
// ---------------------------------------------------------------------------

export class BrowserSession {
  private connected = false;
  private activeContexts: Set<BrowserContextKind> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private changeListeners: Set<() => void> = new Set();
  private lastStatus: BrowserSessionStatus | null = null;

  /** Подписаться на изменение статуса. Возвращает unsubscribe. */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  private notify(): void {
    this.changeListeners.forEach((fn) => fn());
  }

  // ── API methods ──

  private browserUrl(path: string): string {
    return `${API_BASE}${path}`;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.browserUrl(path), {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      throw new Error(`Browser API ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /** Запросить статус CDP-соединения. */
  async getStatus(): Promise<BrowserSessionStatus> {
    try {
      const status = await this.fetchJson<BrowserSessionStatus>('/api/browser/status');
      this.connected = status.connected;
      this.lastStatus = status;
      this.notify();
      return status;
    } catch {
      this.connected = false;
      this.notify();
      return { ok: true, connected: false, contexts: [], purpose: 'authoring', transport: 'playwright' };
    }
  }

  /** Обеспечить наличие контекста (создать при необходимости). */
  async ensureContext(context: BrowserContextKind, startUrl?: string): Promise<boolean> {
    try {
      const body: Record<string, unknown> = { context };
      if (startUrl) body.url = startUrl;
      const result = await this.fetchJson<{ ok: boolean; contextId?: string }>(
        '/api/browser/context/ensure',
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (result.ok) {
        this.activeContexts.add(context);
        this.notify();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Уничтожить контекст (освободить ресурсы). */
  async destroyContext(context: BrowserContextKind): Promise<boolean> {
    try {
      await this.fetchJson('/api/browser/context/destroy', {
        method: 'POST',
        body: JSON.stringify({ context }),
      });
      this.activeContexts.delete(context);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  /** Навигация в указанном контексте. */
  async navigate(
    url: string,
    context: BrowserContextKind = 'operator',
  ): Promise<NavigateResult> {
    return this.fetchJson<NavigateResult>('/api/browser/navigate', {
      method: 'POST',
      body: JSON.stringify({ url, context }),
    });
  }

  /** Сделать скриншот в указанном контексте. */
  async screenshot(context: BrowserContextKind = 'operator'): Promise<ScreenshotResult> {
    return this.fetchJson<ScreenshotResult>('/api/browser/screenshot', {
      method: 'POST',
      body: JSON.stringify({ context }),
    });
  }

  /** Выполнить JavaScript в контексте. */
  async eval(expression: string, context: BrowserContextKind = 'operator'): Promise<unknown> {
    return this.fetchJson('/api/browser/eval', {
      method: 'POST',
      body: JSON.stringify({ expression, context }),
    });
  }

  // ── Polling ──

  /** Запустить периодический опрос статуса. */
  startPolling(intervalMs = 3000): void {
    this.stopPolling();
    this.getStatus(); // immediate
    this.pollTimer = setInterval(() => this.getStatus(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── State accessors ──

  isConnected(): boolean {
    return this.connected;
  }

  hasContext(context: BrowserContextKind): boolean {
    return this.activeContexts.has(context);
  }

  getActiveContexts(): BrowserContextKind[] {
    return Array.from(this.activeContexts);
  }

  getLastStatus(): BrowserSessionStatus | null {
    return this.lastStatus;
  }

  // ── Lifecycle ──

  /** Полная очистка: остановить опрос, уничтожить все контексты. */
  async shutdown(): Promise<void> {
    this.stopPolling();
    const contexts = this.getActiveContexts();
    await Promise.all(contexts.map((c) => this.destroyContext(c)));
    this.connected = false;
    this.notify();
  }

  // ── CDP Observe (POC-CDP-1) ──

  /** Запустить захват кликов в живом CDP. */
  async startObserve(): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/observe/start', { method: 'POST', body: '{}' });
    } catch {
      return { ok: false, error: 'observe/start failed' };
    }
  }

  /** Остановить захват кликов. */
  async stopObserve(): Promise<{ ok: boolean; eventsDiscarded?: number }> {
    try {
      return await this.fetchJson('/api/browser/observe/stop', { method: 'POST', body: '{}' });
    } catch {
      return { ok: false };
    }
  }

  /** Получить одно наблюдение (pop из очереди). Возвращает null если нет событий. */
  async getObservedEvent(): Promise<{ ok: boolean; connected: boolean; observing: boolean; event: CdpObservation | null }> {
    try {
      return await this.fetchJson('/api/browser/observe/event', { method: 'POST', body: '{}' });
    } catch {
      return { ok: false, connected: false, observing: false, event: null };
    }
  }

  /** HDO-F1: Отправить координаты клика headless-браузеру (page.mouse.click). */
  async observeClick(x: number, y: number): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/observe/click', {
        method: 'POST',
        body: JSON.stringify({ x, y }),
      });
    } catch {
      return { ok: false, error: 'observe/click failed' };
    }
  }
}

/** Живое CDP-наблюдение: один клик → один event. */
export interface CdpCandidate {
  kind: string;
  value: string;
  score: number;
  tier: string;
  unique: boolean;
}

export interface CdpObservation {
  eventId: string;
  timestamp: number;
  action: 'click' | 'type';
  element: {
    tag: string;
    id?: string;
    classes?: string;
    text?: string;
    rect: { x: number; y: number; w: number; h: number };
    role?: string;
    accessibleName?: string;
  };
  candidates?: CdpCandidate[];
  isAmbiguous?: boolean;
  valueClass?: 'secret' | 'email' | 'phone' | 'unknown';
}

// ---------------------------------------------------------------------------
// Singleton — один BrowserSession на всё приложение
// (B4: один процесс, ноль дублирования)
// ---------------------------------------------------------------------------

let globalSession: BrowserSession | null = null;

/** Получить (или создать) единственный экземпляр BrowserSession. */
export function getBrowserSession(): BrowserSession {
  if (!globalSession) {
    globalSession = new BrowserSession();
  }
  return globalSession;
}

/** Уничтожить синглтон (для тестов). */
export function __resetBrowserSessionForTests(): void {
  if (globalSession) {
    globalSession.stopPolling();
  }
  globalSession = null;
}