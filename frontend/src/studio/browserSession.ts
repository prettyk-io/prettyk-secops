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
import type { ScenarioStepModel } from './scenarioStepModel';
import type { ReplayOptions, ReplayRunResult, StepExecutionResult, ReplayStepState } from '../terminal/replayRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Изолированный контекст браузера: cookies/storage/сессии не пересекаются. */
export type BrowserContextKind = 'operator' | 'run' | 'debug';

/** Общий статус CDP-соединения. */
export interface BrowserSessionStatus {
  ok: boolean;
  connected: boolean;
  url?: string | null;
  title?: string | null;
  contexts: BrowserContextKind[];
  browserVersion?: string;
  browserId?: string | null;
  purpose?: 'authoring';
  transport?: 'playwright';
  /** VP-L1: runtime всегда "container" */
  runtime?: 'container';
  headless?: boolean;
  streamUrl?: string | null;
  /** VP-L1: сообщение об ошибке при недоступном контейнере */
  error?: string | null;
  /** SOR-F1: WS canvas URL из pk-control session endpoint (dynamic relay). */
  canvasUrl?: string | null;
  /** SOR-F2: здоровье сессии — ready / recovering / degraded. */
  sessionHealth?: 'ready' | 'recovering' | 'degraded' | null;
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
    // BBA-FE-2: отказоустойчивость к мокам/прокси, не реализующим `text()`.
    // Приоритет — реальный `text()` (обычный fetch), иначе сериализуем `json()`.
    const text = typeof res.text === 'function'
      ? await res.text()
      : JSON.stringify(await res.json());
    if (!text) {
      throw new Error(`Browser API empty response (backend down?)`);
    }
    return JSON.parse(text) as T;
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

  /** WIRE-SYNC-L1: Получить последний JPEG-кадр из CDP screencast. */
  async getScreencastFrame(): Promise<{ ok: boolean; frame?: string | null; waiting?: boolean; error?: string }> {
    return this.fetchJson('/api/browser/screencast/frame', {
      method: 'POST',
      body: '{}',
    });
  }

  /** Выполнить JavaScript в контексте. */
  async eval(expression: string, context: BrowserContextKind = 'operator'): Promise<unknown> {
    return this.fetchJson('/api/browser/eval', {
      method: 'POST',
      body: JSON.stringify({ expression, context }),
    });
  }

  /** BBA-2: точные метрики вьюпорта для координатного маппинга. */
  async viewport(): Promise<{ ok: boolean; viewportWidth?: number; viewportHeight?: number; deviceScaleFactor?: number; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/viewport', { method: 'POST', body: '{}' });
    } catch {
      return { ok: false, error: 'viewport failed' };
    }
  }

  /** BBA-3: нажатие клавиши. */
  async keyboardPress(key: string): Promise<{ ok: boolean; key?: string; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/keyboard', { method: 'POST', body: JSON.stringify({ key }) });
    } catch {
      return { ok: false, error: 'keyboard failed' };
    }
  }

  /** BBA-3: wheel-скролл. */
  async mouseWheel(dx: number, dy: number): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/wheel', { method: 'POST', body: JSON.stringify({ dx, dy }) });
    } catch {
      return { ok: false, error: 'wheel failed' };
    }
  }

  /** BBA-3: drag-and-drop по координатам. */
  async mouseDrag(x1: number, y1: number, x2: number, y2: number): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/drag', { method: 'POST', body: JSON.stringify({ x1, y1, x2, y2 }) });
    } catch {
      return { ok: false, error: 'drag failed' };
    }
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

  /** HDO: Отправить координаты клика headless-браузеру (page.mouse.click). */
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

  /** BBA-FE-1: координатный клик в режиме author (без observe/start). */
  async clickAt(x: number, y: number): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.fetchJson('/api/browser/mouse/click', {
        method: 'POST',
        body: JSON.stringify({ x, y }),
      });
    } catch {
      return { ok: false, error: 'mouse/click failed' };
    }
  }

  // ── BBA-FE-2 / BBA-FE-3: Replay Runner ──

  /**
   * Выполнить ОДИН шаг сценария через живой бэкенд-роут BBA-EXEC-1
   * `POST /api/browser/step/execute`.
   *
   * DSL-шаги (Let, Secret, Generate, Crawl, FuzzWave и т.д.) не являются
   * браузерными — no-op, не ошибка.
   */
  async executeStep(step: ScenarioStepModel, signal?: AbortSignal): Promise<StepExecutionResult> {
    const dto = scenarioStepToBackendDto(step);
    if (!dto) return { ok: true };
    try {
      const r = await this.fetchJson<BackendStepResult>('/api/browser/step/execute', {
        method: 'POST',
        body: JSON.stringify({ step: dto }),
        signal,
      });
      return fromBackendStepResult(r);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Прогнать сценарий через живой бэкенд-роут BBA-EXEC-1
   * `POST /api/browser/scenario/replay` (отдаёт агрегат по завершении).
   *
   * Шаги с `startIndex` срезаются (Continue после ошибки), DSL-only шаги
   * помечаются passed локально (бэкенд их не получает).
   */
  async replayScenario(
    steps: ScenarioStepModel[],
    options: ReplayOptions = {},
  ): Promise<ReplayRunResult> {
    const { signal, startIndex = 0, onStepState, continueOnError = false } = options;

    // Собираем только браузерные шаги с картой исходных индексов.
    const browserIndexes: number[] = [];
    const dtos: BackendStepDto[] = [];
    for (let i = startIndex; i < steps.length; i++) {
      const dto = scenarioStepToBackendDto(steps[i]!);
      if (dto) {
        browserIndexes.push(i);
        dtos.push(dto);
      }
    }

    const states: ReplayStepState[] = [];
    const push = (st: ReplayStepState) => {
      states.push(st);
      onStepState?.(st);
    };

    if (dtos.length === 0) {
      // Нет браузерных шагов — все no-op, passed.
      for (let i = startIndex; i < steps.length; i++) {
        push({ stepId: steps[i]!.id, index: i, status: 'passed' });
      }
      return { states, aborted: !!signal?.aborted, stoppedOnError: false };
    }

    try {
      const res = await this.fetchJson<BackendScenarioResult>('/api/browser/scenario/replay', {
        method: 'POST',
        body: JSON.stringify({ steps: dtos, stop_on_failure: !continueOnError }),
        signal,
      });

      const byIndex = new Map<number, BackendStepResult>();
      browserIndexes.forEach((origIdx, k) => {
        const br = res.steps[k];
        if (br) byIndex.set(origIdx, br);
      });

      for (let i = startIndex; i < steps.length; i++) {
        const step = steps[i]!;
        const br = byIndex.get(i);
        if (!br) {
          if (browserIndexes.includes(i)) {
            // Браузерный шаг, который бэкенд не исполнил (stop_on_failure).
            push({ stepId: step.id, index: i, status: 'failed', error: 'step not executed' });
          } else {
            push({ stepId: step.id, index: i, status: 'passed' });
          }
          continue;
        }
        push(fromBackendStepState(step.id, i, br));
      }

      // verdict === 'failed' означает, что агрегат содержал ошибки.
      // «Остановился на ошибке» (нужен Continue) — только если не continueOnError.
      return { states, aborted: false, stoppedOnError: res.verdict === 'failed' && !continueOnError };
    } catch (e) {
      if (signal?.aborted) {
        for (let i = startIndex; i < steps.length; i++) {
          push({ stepId: steps[i]!.id, index: i, status: 'failed', error: 'aborted' });
        }
        return { states, aborted: true, stoppedOnError: false };
      }
      const error = e instanceof Error ? e.message : String(e);
      for (let i = startIndex; i < steps.length; i++) {
        push({ stepId: steps[i]!.id, index: i, status: 'failed', error });
      }
      return { states, aborted: false, stoppedOnError: true };
    }
  }
}

// ---------------------------------------------------------------------------
// BBA-FE-3: маппинг ScenarioStepModel ↔ DTO бэкенд-роутов BBA-EXEC-1
// ---------------------------------------------------------------------------

/** DTO шага для POST /api/browser/step/execute (и steps[] в scenario/replay). */
export interface BackendStepDto {
  action: string;
  target?: string;
  value?: string | null;
  strategy?: string;
  timeout_ms?: number;
  step_id?: string;
}

/** Ответ POST /api/browser/step/execute (один шаг). */
export interface BackendStepResult {
  step_id: string;
  action: string;
  status: 'passed' | 'failed' | 'cancelled';
  duration_ms: number;
  error: string | null;
  screenshot_b64: string | null;
}

/** Ответ POST /api/browser/scenario/replay (агрегат). */
export interface BackendScenarioResult {
  ok: boolean;
  steps: BackendStepResult[];
  total: number;
  executed: number;
  passed: number;
  failed: number;
  cancelled: number;
  verdict: 'passed' | 'failed' | 'cancelled';
  duration_ms: number;
}

/**
 * Преобразовать FE ScenarioStepModel в DTO бэкенд-шага.
 * Возвращает null для DSL-only шагов (не браузерных) — их бэкенд не исполняет.
 */
export function scenarioStepToBackendDto(step: ScenarioStepModel): BackendStepDto | null {
  switch (step.action) {
    case 'Click':
      return { action: 'click', target: step.strategyValue, strategy: step.strategy, step_id: step.id };
    case 'Type':
      return { action: 'fill', target: step.strategyValue, value: step.payload, strategy: step.strategy, step_id: step.id };
    case 'Open':
      return { action: 'goto', target: step.payload, step_id: step.id };
    case 'Wait':
      return { action: 'wait_for', target: step.payload?.trim() ? step.payload : '1000', step_id: step.id };
    case 'Hover':
      return { action: 'hover', target: step.strategyValue, strategy: step.strategy, step_id: step.id };
    case 'Select':
      return { action: 'select_option', target: step.strategyValue, value: step.payload, strategy: step.strategy, step_id: step.id };
    case 'PressKey':
      return { action: 'press_key', target: step.payload, step_id: step.id };
    default:
      // Let, Secret, Generate*, Crawl, ActiveScan, Check, FuzzWave, Mutate,
      // Intruder, scannerReport — DSL-only, no-op в браузерном replay.
      return null;
  }
}

/** Преобразовать бэкенд-результат шага в FE StepExecutionResult (без step_id). */
function fromBackendStepResult(br: BackendStepResult): StepExecutionResult {
  const passed = br.status === 'passed';
  return {
    ok: passed,
    error: passed ? undefined : (br.error ?? `step ${br.status}`),
    screenshotB64: !passed ? (br.screenshot_b64 ?? undefined) : undefined,
    durationMs: br.duration_ms,
  };
}

/** Преобразовать бэкенд-результат шага в FE ReplayStepState (с stepId/index). */
function fromBackendStepState(stepId: string, index: number, br: BackendStepResult): ReplayStepState {
  const passed = br.status === 'passed';
  return {
    stepId,
    index,
    status: passed ? 'passed' : 'failed',
    error: passed ? undefined : (br.error ?? `step ${br.status}`),
    screenshotB64: !passed ? (br.screenshot_b64 ?? undefined) : undefined,
    durationMs: br.duration_ms,
  };
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