// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AIRGAP_CONNECTORS } from '../admin/defaults';
import { resetAdminStoresForTests, saveConnectors } from '../admin/deployStore';
import {
  adminSnapshotForType,
  applyConnectorFieldsPatch,
  DEFAULT_METRIC_PACKS,
  emptyConnectorFields,
  initConnectorFieldsFromAdmin,
  parseMetricPacks,
  rebindConnectorFromAdmin,
  serializeMetricPacks,
  type ConnectorFields,
} from './connectorFields';
import { addConnectorModule } from './studioModules';
import { collectStudioNodes } from './collectStudioNodes';

describe('connectorFields admin-init', () => {
  beforeEach(() => {
    resetAdminStoresForTests();
  });

  it('Prometheus init копирует packs/lookback из Admin', () => {
    saveConnectors({
      ...DEFAULT_AIRGAP_CONNECTORS,
      prom_url: 'http://prom.lab:9090',
      prom_lookback: '30m',
      prom_metric_packs: 'http_red,runtime',
    });
    const fields = initConnectorFieldsFromAdmin('Prometheus');
    expect(fields.connector_type).toBe('Prometheus');
    expect(fields.prom_url).toBe('http://prom.lab:9090');
    expect(fields.prom_lookback).toBe('30m');
    expect(parseMetricPacks(fields.metric_packs)).toEqual(['http_red', 'runtime']);
    expect(serializeMetricPacks(DEFAULT_METRIC_PACKS)).toContain('http_red');
  });

  it('admin snapshot reflects DB DSN', () => {
    saveConnectors({
      ...DEFAULT_AIRGAP_CONNECTORS,
      db_engine: 'PostgreSQL',
      db_dsn: 'postgresql://ro@db/app',
      db_schema: 'public',
    });
    const snap = adminSnapshotForType('База данных');
    expect(snap.configured).toBe(true);
    expect(snap.summary).toContain('PostgreSQL');
  });

  it('активация типа ребиндит из Admin', () => {
    saveConnectors({
      ...DEFAULT_AIRGAP_CONNECTORS,
      ssh_host: 'jump.lab',
      ssh_port: '22',
      ssh_username: 'pk',
    });
    const next = applyConnectorFieldsPatch(emptyConnectorFields(), {
      connector_type: 'SSH',
    } as Partial<ConnectorFields>);
    expect(next.connector_type).toBe('SSH');
    expect(next.host).toBe('jump.lab');
  });

  it('create без типа; активация → Admin-init; Explorer icon после типа', () => {
    saveConnectors({
      ...DEFAULT_AIRGAP_CONNECTORS,
      db_dsn: 'postgresql://x',
      db_engine: 'PostgreSQL',
    });
    const base = addConnectorModule({}, 'pg_ro')!;
    const mod = (
      base as {
        test_suites: {
          test_data_constructor: {
            connector_fields: { dsn: string; connector_type: string | null };
          }[];
        };
      }
    ).test_suites.test_data_constructor[0];
    expect(mod?.connector_fields.connector_type).toBeNull();
    expect(collectStudioNodes(base).modules[0]?.connectorType).toBeUndefined();

    const applied = applyConnectorFieldsPatch(emptyConnectorFields(), {
      connector_type: 'База данных',
    } as Partial<ConnectorFields>);
    expect(applied.connector_type).toBe('База данных');
    expect(applied.dsn).toBe('postgresql://x');

    saveConnectors({
      ...DEFAULT_AIRGAP_CONNECTORS,
      db_dsn: 'postgresql://y',
    });
    const rebound = rebindConnectorFromAdmin({
      ...initConnectorFieldsFromAdmin('База данных'),
      dsn: 'postgresql://x',
      notes: 'n',
    });
    expect(rebound.dsn).toBe('postgresql://y');
    expect(rebound.notes).toBe('n');
  });

  it('Splunk-like legacy → Splunk', () => {
    const fields = initConnectorFieldsFromAdmin('Система логгирования', {
      ...DEFAULT_AIRGAP_CONNECTORS,
      siem_source: 'Splunk-like',
      siem_url: 'https://splunk',
    });
    expect(fields.log_source).toBe('Splunk');
  });
});
