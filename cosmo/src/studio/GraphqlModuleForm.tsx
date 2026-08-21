/**
 * Studio module_type=GraphQL — ресурс graphql_sdl или relative introspection; endpoint к URL атаки.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Input, Select, Typography } from 'antd';
import { parseGraphqlLab } from '../api/labApiImport';
import {
  normalizeGraphqlFields,
  type GraphqlFields,
  type GraphqlSchemaMode,
} from './apiModuleFields';
import { formatGraphqlOpsText } from './apiModuleInventoryText';
import { listGraphqlSdlResources, type ResourceFields } from './studioResources';

export type GraphqlModuleFormProps = {
  value: GraphqlFields;
  onChange: (patch: Partial<GraphqlFields>) => void;
  moduleId?: string;
  formData?: unknown;
  attackBaseUrl?: string;
};

export function GraphqlModuleForm({
  value,
  onChange,
  moduleId = '',
  formData,
  attackBaseUrl = '',
}: GraphqlModuleFormProps): React.JSX.Element {
  const fields = normalizeGraphqlFields(value);
  const mid = moduleId.trim() || '<id>';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sdlOptions = useMemo(() => listGraphqlSdlResources(formData), [formData]);
  const selected: ResourceFields | undefined = sdlOptions.find(
    (r) => r.as === fields.sdl_as,
  );

  const authOptions = useMemo(() => {
    const suites = (formData as { test_suites?: { test_data_constructor?: unknown[] } })
      ?.test_suites;
    const mods = suites?.test_data_constructor;
    if (!Array.isArray(mods)) {
      return [] as { value: string; label: string }[];
    }
    return mods
      .map((m) => {
        if (!m || typeof m !== 'object') {
          return null;
        }
        const rec = m as { module_type?: string; id?: string; label?: string };
        if (rec.module_type !== 'Авторизация') {
          return null;
        }
        const id = String(rec.id || rec.label || '').trim();
        if (!id) {
          return null;
        }
        return { value: id, label: id };
      })
      .filter((x): x is { value: string; label: string } => Boolean(x));
  }, [formData]);

  const joinAttack = (rel: string): string => {
    const path = (rel || '').trim() || '/graphql';
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const base = (attackBaseUrl || '').trim().replace(/\/$/, '');
    if (!base) {
      return path;
    }
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const runInventory = async () => {
    setBusy(true);
    setError(null);
    try {
      let schema = '';
      if (fields.schema_mode === 'resource') {
        if (!fields.sdl_as.trim()) {
          setError('Выберите ресурс graphql_sdl');
          return;
        }
        schema = (selected?.path || '').trim();
        if (!schema) {
          setError('У ресурса пустой path');
          return;
        }
      } else {
        schema = joinAttack(fields.schema_path_rel || fields.endpoint_rel || '/graphql');
        if (!schema.startsWith('http')) {
          setError('Задайте URL атаки в инфраструктуре или абсолютный путь в allowlist');
          return;
        }
      }
      const res = await parseGraphqlLab(schema);
      if (!res.ok) {
        setError((res.notes && res.notes[0]) || res.error || 'ошибка разбора схемы');
        return;
      }
      onChange({
        last_inventory: (res.operations || []) as Record<string, unknown>[],
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const opsText = formatGraphqlOpsText(fields.last_inventory || []);

  return (
    <div className="pk-studio-api-module-form" data-testid="graphql-module-form">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12, borderRadius: 6 }}
        message="GraphQL"
        description={`Endpoint — относительно URL атаки. В сценарии: СписокОперацийGraphQL ${mid} · ИмпортGraphQL ${mid} · ВыполнитьGraphQL ${mid}`}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
        Цель атаки (только справка)
      </Typography.Text>
      <Input
        value={attackBaseUrl.trim() || '(не задан URL атаки)'}
        readOnly
        style={{ marginBottom: 10 }}
        aria-label="graphql-attack-url-readonly"
      />
      <Input
        value={fields.endpoint_rel}
        placeholder="/graphql"
        style={{ marginBottom: 10 }}
        onChange={(e) => onChange({ endpoint_rel: e.target.value })}
        aria-label="graphql-endpoint-rel"
      />
      <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
        <span className="pk-studio-connector-field-label">Режим схемы</span>
        <Select
          value={fields.schema_mode}
          style={{ width: '100%' }}
          options={[
            { value: 'introspection_relative', label: 'Introspection (относительный путь)' },
            { value: 'resource', label: 'Ресурс graphql_sdl' },
          ]}
          onChange={(v: GraphqlSchemaMode) => onChange({ schema_mode: v })}
        />
      </label>
      {fields.schema_mode === 'resource' ? (
        <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
          <span className="pk-studio-connector-field-label">Ресурс graphql_sdl</span>
          <Select
            value={fields.sdl_as || undefined}
            style={{ width: '100%' }}
            placeholder={
              sdlOptions.length === 0
                ? 'Сначала создайте ресурс graphql_sdl'
                : 'Выберите ресурс'
            }
            options={sdlOptions.map((r) => ({
              value: r.as,
              label: `${r.as} (${r.path})`,
            }))}
            onChange={(v: string) => onChange({ sdl_as: v })}
            allowClear
          />
        </label>
      ) : (
        <Input
          value={fields.schema_path_rel}
          placeholder="/graphql"
          style={{ marginBottom: 10 }}
          onChange={(e) => onChange({ schema_path_rel: e.target.value })}
          aria-label="graphql-schema-path-rel"
        />
      )}
      <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 12 }}>
        <span className="pk-studio-connector-field-label">Авторизация (необязательно)</span>
        <Select
          value={fields.auth_module_id || undefined}
          style={{ width: '100%' }}
          placeholder="без профиля"
          options={authOptions}
          onChange={(v: string) => onChange({ auth_module_id: v || '' })}
          allowClear
        />
      </label>
      <Checkbox
        checked={fields.zap_import}
        style={{ marginBottom: 8 }}
        onChange={(e) => onChange({ zap_import: e.target.checked })}
      >
        Разрешить ИмпортGraphQL в ZAP (только по шагу сценария)
      </Checkbox>
      <Checkbox
        checked={fields.zap_scan}
        style={{ marginBottom: 12, display: 'block' }}
        onChange={(e) => onChange({ zap_scan: e.target.checked })}
      >
        Разрешить СканGraphQL в ZAP (только по шагу сценария)
      </Checkbox>
      <Button
        type="primary"
        loading={busy}
        onClick={() => void runInventory()}
        style={{ marginBottom: 12 }}
        disabled={fields.schema_mode === 'resource' && !fields.sdl_as}
      >
        Список операций
      </Button>
      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 10, borderRadius: 6 }} />
      ) : null}
      <Typography.Text strong>Операции</Typography.Text>
      <Input.TextArea
        value={opsText}
        readOnly
        rows={10}
        placeholder="После «Список операций» — query и mutation"
        style={{ marginTop: 6 }}
        data-testid="graphql-ops-readonly"
      />
    </div>
  );
}
