/**
 * SANCTUARY-MAP B1 — декларативная модель карты (Single Source of Truth).
 *
 * Карта не рисуется вручную и не хардкодится в канвасе: узлы, уровни, связи,
 * статусы, маршруты и порты приходят из единого описания `sanctuary/system-map.json`
 * (рядом с ALTAR.md). Этот модуль:
 *   - типизирует контракт (SanctuarySystemMap);
 *   - загружает и валидирует JSON (битые ссылки, дубликаты, маршруты, порты);
 *   - фильтрует карту по активной линзе;
 *   - классифицирует маршруты (статический / проверочный / битый).
 *
 * Философия — «тактический радар, а не мёртвая диаграмма»: 7±2 в фокусе,
 * семантический зум L0→L1→L2, 5 линз, телепортация на реальный экран.
 */

export type SystemLevel = 'landscape' | 'system' | 'surface' | 'component';

export type NodeStatus =
  | 'native_v2'       // 🟢 100% готов, автономен, протестирован
  | 'hybrid_mock'     // 🟡 фасад есть, под капотом заглушки/неполный функционал
  | 'legacy_only'     // 🔴 только в старом монолите (docs/archive)
  | 'infrastructure'  // 🔵 служебный слой (БД, брокер, докер, стенд)
  | 'sealed_canon';   // 🏛️ запечатанный канон Святилища

export type LensVisibility =
  | 'architecture'
  | 'flow'
  | 'runtime'
  | 'parity'
  | 'ideas';

export interface MapPortMeta {
  port?: number;
  protocol?: 'http' | 'ws' | 'sse' | 'cdp' | 'tcp';
  healthEndpoint?: string;
  expectedStatus?: number;
}

export interface MapNodeMetrics {
  testCount?: number;
  loc?: number;
  completionPercent?: number;
}

export interface SanctuaryMapNode {
  id: string;
  label: string;
  subtitle?: string;
  level: SystemLevel;
  parent?: string;           // id родительского кластера (семантический зум)
  status: NodeStatus;
  route?: string;            // канонический маршрут (#/checks/<id>/studio, #/admin, …)
  sourcePaths?: string[];    // пути к коду
  docsRef?: string;          // ссылка на markdown-документ
  portMeta?: MapPortMeta;    // привязка к живому порту стенда
  lenses: LensVisibility[];  // в каких линзах отображается узел
  position?: { x: number; y: number };
  metrics?: MapNodeMetrics;
  backlogRefs?: string[];
}

export type SanctuaryMapEdgeType =
  | 'data_stream'      // активный поток данных
  | 'dependency'       // архитектурная/структурная связь
  | 'airgap_barrier'   // рубеж изоляции
  | 'user_step';       // шаг пути оператора

export interface SanctuaryMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: SanctuaryMapEdgeType;
  lenses: LensVisibility[];
  bidirectional?: boolean;
}

export interface SanctuarySystemMap {
  version: string;
  lastUpdated: string;
  nodes: SanctuaryMapNode[];
  edges: SanctuaryMapEdge[];
}

/** Линза карты (включая псевдо-линзу «все» для UI). */
export type MapLens = LensVisibility | 'all';

export type MapIssueSeverity = 'error' | 'warning';

export interface MapIssue {
  severity: MapIssueSeverity;
  message: string;
  refId?: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Маршруты                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

/** Канонические статические маршруты (без instance id). */
export const STATIC_ROUTES: ReadonlySet<string> = new Set([
  '#/home',
  '#/history',
  '#/admin',
  '#/lab',
  '#/control',
  '#/dashboard',
  '#/setup',
  '#/design-playground',
  '#/design-admin',
  '#/sanctuary/map',
]);

export type RouteClass = 'none' | 'static' | 'check' | 'broken';

const CHECK_ROUTE_RE = /^#\/checks\/([^/]+)\/(form|studio|editor|studio-old|editor-old|results)$/;

/**
 * Классифицирует маршрут узла. `<id>` — плейсхолдер «текущая проверка»
 * (подставляется при телепортации); конкретный id — тоже валидный check-маршрут.
 */
export function classifyRoute(route: string | undefined): RouteClass {
  if (!route) return 'none';
  if (STATIC_ROUTES.has(route)) return 'static';
  if (CHECK_ROUTE_RE.test(route)) return 'check';
  return 'broken';
}

/** Разрешить check-маршрут с плейсхолдером `<id>` в конкретный id. */
export function resolveCheckRoute(route: string, checkId: string): string {
  return route.replace(/<id>/g, checkId);
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Валидация                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

const VALID_LENSES: ReadonlySet<LensVisibility> = new Set([
  'architecture',
  'flow',
  'runtime',
  'parity',
  'ideas',
]);

const VALID_STATUSES: ReadonlySet<NodeStatus> = new Set([
  'native_v2',
  'hybrid_mock',
  'legacy_only',
  'infrastructure',
  'sealed_canon',
]);

const VALID_LEVELS: ReadonlySet<SystemLevel> = new Set([
  'landscape',
  'system',
  'surface',
  'component',
]);

/**
 * Структурная валидация карты. Возвращает список проблем (не кидает):
 *   - дубликаты id узлов/связей;
 *   - связь/родитель ссылается на несуществующий узел (битая ссылка);
 *   - маршрут не соответствует канонической грамматике (битый маршрут);
 *   - healthEndpoint порта не http/https;
 *   - неизвестная линза/статус/уровень.
 */
export function validateSystemMap(map: SanctuarySystemMap): MapIssue[] {
  const issues: MapIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of map.nodes) {
    if (!node?.id) {
      issues.push({ severity: 'error', message: 'Узел без id' });
      continue;
    }
    if (nodeIds.has(node.id)) {
      issues.push({ severity: 'error', message: `Дубликат id узла`, refId: node.id });
    }
    nodeIds.add(node.id);

    if (!VALID_LEVELS.has(node.level)) {
      issues.push({ severity: 'error', message: `Неизвестный level`, refId: node.id });
    }
    if (!VALID_STATUSES.has(node.status)) {
      issues.push({ severity: 'error', message: `Неизвестный status`, refId: node.id });
    }
    for (const lens of node.lenses ?? []) {
      if (!VALID_LENSES.has(lens)) {
        issues.push({ severity: 'warning', message: `Неизвестная линза`, refId: node.id });
      }
    }
    const routeClass = classifyRoute(node.route);
    if (routeClass === 'broken') {
      issues.push({
        severity: 'warning', // B1: битая ссылка ПОМЕЧАЕТ узел, не ломает карту.
        message: `Битый маршрут «${node.route}»`,
        refId: node.id,
      });
    }
    const hp = node.portMeta?.healthEndpoint;
    if (hp && !/^https?:\/\//.test(hp)) {
      issues.push({
        severity: 'warning',
        message: `healthEndpoint порта должен быть http(s)`,
        refId: node.id,
      });
    }
  }

  // Родители + связи должны ссылаться на существующие узлы.
  for (const node of map.nodes) {
    if (node?.parent && !nodeIds.has(node.parent)) {
      issues.push({
        severity: 'error',
        message: `Родитель не найден: «${node.parent}»`,
        refId: node.id,
      });
    }
  }

  for (const edge of map.edges) {
    if (!edge?.id) {
      issues.push({ severity: 'error', message: 'Связь без id' });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({ severity: 'error', message: `Дубликат id связи`, refId: edge.id });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      issues.push({
        severity: 'error',
        message: `Связь на несуществующий source «${edge.source}»`,
        refId: edge.id,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        severity: 'error',
        message: `Связь на несуществующий target «${edge.target}»`,
        refId: edge.id,
      });
    }
    for (const lens of edge.lenses ?? []) {
      if (!VALID_LENSES.has(lens)) {
        issues.push({ severity: 'warning', message: `Неизвестная линза связи`, refId: edge.id });
      }
    }
  }

  return issues;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Загрузка                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export interface LoadResult {
  ok: boolean;
  map?: SanctuarySystemMap;
  issues: MapIssue[];
}

/** Разобрать сырой JSON в карту + провалидировать (не кидает). */
export function loadSystemMap(raw: unknown): LoadResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, issues: [{ severity: 'error', message: 'Карта не объект' }] };
  }
  const obj = raw as Partial<SanctuarySystemMap>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    return { ok: false, issues: [{ severity: 'error', message: 'nodes/edges обязаны быть массивами' }] };
  }
  const map: SanctuarySystemMap = {
    version: typeof obj.version === 'string' ? obj.version : 'unknown',
    lastUpdated: typeof obj.lastUpdated === 'string' ? obj.lastUpdated : '',
    nodes: obj.nodes as SanctuaryMapNode[],
    edges: obj.edges as SanctuaryMapEdge[],
  };
  const issues = validateSystemMap(map);
  const hasErrors = issues.some((i) => i.severity === 'error');
  return { ok: !hasErrors, map, issues };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Фильтр по линзе                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

export interface LensProjection {
  nodes: SanctuaryMapNode[];
  edges: SanctuaryMapEdge[];
}

function nodeInLens(node: SanctuaryMapNode, lens: LensVisibility): boolean {
  return (node.lenses ?? []).includes(lens);
}

function edgeInLens(edge: SanctuaryMapEdge, lens: LensVisibility): boolean {
  return (edge.lenses ?? []).includes(lens);
}

/**
 * Проекция карты через линзу. Узел/связь видны, если объявлены в этой линзе.
 * Связи дополнительно фильтруются: обе вершины должны быть видны.
 */
export function projectLens(
  map: SanctuarySystemMap,
  lens: MapLens,
): LensProjection {
  if (lens === 'all') {
    return { nodes: map.nodes, edges: map.edges };
  }
  const visibleNodes = map.nodes.filter((n) => nodeInLens(n, lens));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const edges = map.edges.filter(
    (e) => edgeInLens(e, lens) && visibleIds.has(e.source) && visibleIds.has(e.target),
  );
  return { nodes: visibleNodes, edges };
}

/** Все линзы, реально присутствующие в карте (для UI переключателя). */
export function collectLenses(map: SanctuarySystemMap): LensVisibility[] {
  const set = new Set<LensVisibility>();
  for (const n of map.nodes) for (const l of n.lenses ?? []) set.add(l);
  return (['architecture', 'flow', 'runtime', 'parity', 'ideas'] as LensVisibility[]).filter(
    (l) => set.has(l),
  );
}

/** Индекс узлов по id. */
export function indexNodes(map: SanctuarySystemMap): Map<string, SanctuaryMapNode> {
  const idx = new Map<string, SanctuaryMapNode>();
  for (const n of map.nodes) idx.set(n.id, n);
  return idx;
}

/** Дети узла (по полю parent). */
export function childrenOf(
  map: SanctuarySystemMap,
  parentId: string | undefined,
): SanctuaryMapNode[] {
  return map.nodes.filter((n) => n.parent === parentId);
}
