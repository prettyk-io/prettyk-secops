/**
 * Studio connector: активация типа; доступ/packs — Admin → Интеграции.
 * Вызов: PrettyK ИнициализироватьКоннектор / ЗапроситьМетрикиКоннектора (CONN-11; live KDT_CONNECTOR_LIVE).
 */
import { defaultMetricPacksCsv } from '../admin/metricPacks';
import type { AirgapConnectors } from '../admin/types';
import { loadConnectors } from '../admin/deployStore';

export {
  DEFAULT_METRIC_PACKS,
  METRIC_PACKS,
  parseMetricPacks,
  serializeMetricPacks,
  type MetricPackId,
} from '../admin/metricPacks';

export const CONNECTOR_TYPES = [
  'База данных',
  'Система логгирования',
  'Prometheus',
  'SSH',
  'Очередь сообщений',
] as const;

export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  'База данных': 'База данных',
  'Система логгирования': 'Журналы / SIEM',
  Prometheus: 'Prometheus',
  SSH: 'SSH',
  'Очередь сообщений': 'Очередь сообщений',
};

export const DB_ENGINES = [
  'PostgreSQL',
  'MySQL/MariaDB',
  'Microsoft SQL Server',
  'MongoDB',
] as const;

export type DbEngine = (typeof DB_ENGINES)[number];

export const LOG_SOURCES = [
  'Splunk',
  'Elasticsearch',
  'Grafana Loki',
  'HTTP endpoint',
] as const;

export type LogSource = (typeof LOG_SOURCES)[number];

export const MQ_ENGINES = ['Kafka', 'RabbitMQ'] as const;

export type MqEngine = (typeof MQ_ENGINES)[number];

export type ConnectorFields = {
  /** null = слот не активирован (тип ещё не выбран). */
  connector_type: ConnectorType | null;
  notes: string;
  metric_packs: string;
  db_engine: DbEngine;
  dsn: string;
  schema_name: string;
  read_only: boolean;
  log_source: LogSource;
  log_query: string;
  log_window: string;
  host: string;
  port: string;
  username: string;
  key_ref: string;
  allowlist: string;
  mq_engine: MqEngine;
  broker_url: string;
  topic: string;
  prom_url: string;
  prom_lookback: string;
  constructor: string;
};

export type ConnectorFieldsPatch = Partial<ConnectorFields>;

const TYPE_SET = new Set<string>(CONNECTOR_TYPES);
const DB_SET = new Set<string>(DB_ENGINES);
const LOG_SET = new Set<string>(LOG_SOURCES);
const MQ_SET = new Set<string>(MQ_ENGINES);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function isConnectorType(value: unknown): value is ConnectorType {
  return typeof value === 'string' && TYPE_SET.has(value);
}

function asDbEngine(value: unknown, fallback: DbEngine): DbEngine {
  return typeof value === 'string' && DB_SET.has(value) ? (value as DbEngine) : fallback;
}

function asLogSource(value: unknown, fallback: LogSource): LogSource {
  if (value === 'Splunk-like') {
    return 'Splunk';
  }
  return typeof value === 'string' && LOG_SET.has(value) ? (value as LogSource) : fallback;
}

function asMqEngine(value: unknown, fallback: MqEngine): MqEngine {
  return typeof value === 'string' && MQ_SET.has(value) ? (value as MqEngine) : fallback;
}

/** Снимок Admin-интеграции для UI (без секретов). */
export type AdminConnectorSnapshot = {
  configured: boolean;
  summary: string;
  health: string;
};

function siemAdminSummary(admin: AirgapConnectors): string {
  const url = admin.siem_url.trim();
  if (!url) {
    return `${admin.siem_source} · URL не задан в Admin`;
  }
  const window = (admin.siem_window || '').trim();
  return window
    ? `${admin.siem_source} · ${url} · ${window}`
    : `${admin.siem_source} · ${url}`;
}

export function adminSnapshotForType(
  connectorType: ConnectorType | null,
  admin: AirgapConnectors = loadConnectors(),
): AdminConnectorSnapshot {
  if (!connectorType) {
    return {
      configured: false,
      summary: 'Выберите тип — слот активируется из Admin',
      health: 'unknown',
    };
  }
  switch (connectorType) {
    case 'База данных':
      return {
        configured: Boolean(admin.db_dsn.trim()),
        summary: admin.db_dsn.trim()
          ? `${admin.db_engine} · ${admin.db_schema || '—'} · RO=${String(admin.db_read_only)}`
          : `${admin.db_engine} · DSN не задан в Admin`,
        health: admin.db_health,
      };
    case 'Система логгирования':
      return {
        configured: Boolean(admin.siem_url.trim()),
        summary: siemAdminSummary(admin),
        health: admin.siem_health,
      };
    case 'Prometheus': {
      const packs =
        (admin.prom_metric_packs || '').trim() || defaultMetricPacksCsv();
      return {
        configured: Boolean(admin.prom_url.trim()),
        summary: admin.prom_url.trim()
          ? `${admin.prom_url} · auth=${admin.prom_auth} · lookback=${admin.prom_lookback} · packs=${packs}`
          : 'URL не задан в Admin',
        health: admin.prom_health,
      };
    }
    case 'SSH':
      return {
        configured: Boolean(admin.ssh_host.trim()),
        summary: admin.ssh_host.trim()
          ? `${admin.ssh_username || 'user'}@${admin.ssh_host}:${admin.ssh_port || '22'}`
          : 'Хост не задан в Admin',
        health: admin.ssh_health,
      };
    case 'Очередь сообщений':
      return {
        configured: Boolean(admin.mq_broker_url.trim()),
        summary: admin.mq_broker_url.trim()
          ? `${admin.mq_engine} · ${admin.mq_broker_url} · ${admin.mq_topic || '—'}`
          : `${admin.mq_engine} · broker не задан в Admin`,
        health: admin.mq_health,
      };
    default:
      return { configured: false, summary: '—', health: 'unknown' };
  }
}

/** Активация: доступ + packs/query копируются из Admin в слот модуля. */
export function initConnectorFieldsFromAdmin(
  connectorType: ConnectorType = 'База данных',
  admin: AirgapConnectors = loadConnectors(),
  keep?: { notes?: string },
): ConnectorFields {
  const promPacks =
    (admin.prom_metric_packs || '').trim() || defaultMetricPacksCsv();
  const base: ConnectorFields = {
    connector_type: connectorType,
    notes: keep?.notes ?? '',
    metric_packs: connectorType === 'Prometheus' ? promPacks : '',
    db_engine: asDbEngine(admin.db_engine, 'PostgreSQL'),
    dsn: admin.db_dsn,
    schema_name: admin.db_schema,
    read_only: admin.db_read_only,
    log_source: asLogSource(admin.siem_source, 'Splunk'),
    log_query: admin.siem_query ?? '',
    log_window: admin.siem_window ?? '',
    host: admin.ssh_host,
    port: admin.ssh_port || '22',
    username: admin.ssh_username,
    key_ref: admin.ssh_key_set ? 'admin:ssh_key' : '',
    allowlist: admin.ssh_allowlist,
    mq_engine: asMqEngine(admin.mq_engine, 'Kafka'),
    broker_url: admin.mq_broker_url,
    topic: admin.mq_topic,
    prom_url: admin.prom_url,
    prom_lookback: admin.prom_lookback || '15m',
    constructor: '',
  };
  return base;
}

/** Слот до активации: без типа, без brand-иконки в Explorer. */
export function emptyConnectorFields(): ConnectorFields {
  return {
    connector_type: null,
    notes: '',
    metric_packs: '',
    db_engine: 'PostgreSQL',
    dsn: '',
    schema_name: '',
    read_only: true,
    log_source: 'Splunk',
    log_query: '',
    log_window: '',
    host: '',
    port: '',
    username: '',
    key_ref: '',
    allowlist: '',
    mq_engine: 'Kafka',
    broker_url: '',
    topic: '',
    prom_url: '',
    prom_lookback: '',
    constructor: '',
  };
}

export function defaultConnectorFields(connectorType?: ConnectorType): ConnectorFields {
  if (!connectorType) {
    return emptyConnectorFields();
  }
  return initConnectorFieldsFromAdmin(connectorType);
}

export function normalizeConnectorFields(raw: unknown): ConnectorFields {
  const rec = asRecord(raw) ?? {};
  if (!isConnectorType(rec.connector_type)) {
    const empty = emptyConnectorFields();
    return {
      ...empty,
      notes: str(rec.notes, empty.notes),
      constructor: str(rec.constructor, empty.constructor),
    };
  }
  const type = rec.connector_type;
  const base = initConnectorFieldsFromAdmin(type);
  return {
    ...base,
    notes: str(rec.notes, base.notes),
    metric_packs: str(rec.metric_packs, base.metric_packs),
    db_engine: asDbEngine(rec.db_engine, base.db_engine),
    dsn: str(rec.dsn, base.dsn),
    schema_name: str(rec.schema_name, base.schema_name),
    read_only: bool(rec.read_only, base.read_only),
    log_source: asLogSource(rec.log_source, base.log_source),
    log_query: str(rec.log_query, base.log_query),
    log_window: str(rec.log_window, base.log_window),
    host: str(rec.host, base.host),
    port: str(rec.port, base.port),
    username: str(rec.username, base.username),
    key_ref: str(rec.key_ref, base.key_ref),
    allowlist: str(rec.allowlist, base.allowlist),
    mq_engine: asMqEngine(rec.mq_engine, base.mq_engine),
    broker_url: str(rec.broker_url, base.broker_url),
    topic: str(rec.topic, base.topic),
    prom_url: str(rec.prom_url, base.prom_url),
    prom_lookback: str(rec.prom_lookback, base.prom_lookback),
    constructor: str(rec.constructor, base.constructor),
  };
}

export function applyConnectorFieldsPatch(
  current: ConnectorFields,
  patch: ConnectorFieldsPatch,
  admin: AirgapConnectors = loadConnectors(),
): ConnectorFields {
  const nextType = isConnectorType(patch.connector_type)
    ? patch.connector_type
    : current.connector_type;
  if (nextType === null) {
    return {
      ...emptyConnectorFields(),
      notes: typeof patch.notes === 'string' ? patch.notes : current.notes,
    };
  }
  const typeChanged = nextType !== current.connector_type;
  if (typeChanged) {
    // Активация / смена типа: полный init из Admin (packs/lookback — defaults, не UI).
    return normalizeConnectorFields({
      ...initConnectorFieldsFromAdmin(nextType, admin),
      notes: current.notes,
      connector_type: nextType,
    });
  }
  return normalizeConnectorFields({ ...current, ...patch, connector_type: nextType });
}

export function updateConnectorModule(
  formData: unknown,
  moduleIndex: number,
  patch: ConnectorFieldsPatch,
): unknown {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const modules = Array.isArray(suites.test_data_constructor)
    ? (suites.test_data_constructor as unknown[]).slice()
    : [];
  if (moduleIndex < 0 || moduleIndex >= modules.length) {
    return undefined;
  }
  const mod = { ...(asRecord(modules[moduleIndex]) ?? {}) };
  const current = normalizeConnectorFields(mod.connector_fields);
  mod.connector_fields = applyConnectorFieldsPatch(current, patch);
  modules[moduleIndex] = mod;
  return {
    ...root,
    test_suites: {
      ...suites,
      test_data_constructor: modules,
    },
  };
}

/** Перечитать доступ из Admin в слот (кнопка в форме). */
export function rebindConnectorFromAdmin(current: ConnectorFields): ConnectorFields {
  if (!current.connector_type) {
    return current;
  }
  return initConnectorFieldsFromAdmin(current.connector_type, loadConnectors(), {
    notes: current.notes,
  });
}
