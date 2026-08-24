/**
 * Studio module_type=OpenAPI — ресурс openapi_spec или relative path; цель = URL атаки.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Input, Select, Typography } from 'antd';
import {
  normalizeOpenApiFields,
  type OpenApiFields,
  type OpenApiSpecMode,
} from './apiModuleFields';
import { formatOpenApiOpsText } from './apiModuleInventoryText';
import { fetchOpenApiInventory } from './openapiInventoryRun';
import { listAuthModuleOptions } from './listAuthModuleOptions';
import { listOpenApiSpecResources, type ResourceFields } from './studioResources';

export type OpenApiModuleFormProps = {
  value: OpenApiFields;
  onChange: (patch: Partial<OpenApiFields>) => void;
  moduleId?: string;
  formData?: unknown;
  attackBaseUrl?: string;
};

export function OpenApiModuleForm({
  value,
  onChange,
  moduleId = '',
  formData,
  attackBaseUrl = '',
}: OpenApiModuleFormProps): React.JSX.Element {
  const fields = normalizeOpenApiFields(value);
  const mid = moduleId.trim() || '<id>';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const specOptions = useMemo(() => listOpenApiSpecResources(formData), [formData]);
  const selected: ResourceFields | undefined = specOptions.find(
    (r) => r.as === fields.spec_as,
  );

  const authOptions = useMemo(() => listAuthModuleOptions(formData), [formData]);

  const runInventory = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchOpenApiInventory({
        fields,
        selectedPath: selected?.path || '',
        attackBaseUrl,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChange({ last_inventory: res.operations });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const opsText = formatOpenApiOpsText(fields.last_inventory || []);

  return (
    <div className="pk-studio-api-module-form" data-testid="openapi-module-form">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12, borderRadius: 6 }}
        message="OpenAPI"
        description={`Цель — URL атаки манифеста. В сценарии: СписокОперацийOpenAPI ${mid} · ИмпортOpenAPI ${mid} · ВыполнитьОперацииOpenAPI ${mid}`}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
        Цель атаки (только справка)
      </Typography.Text>
      <Input
        value={attackBaseUrl.trim() || '(не задан URL атаки)'}
        readOnly
        style={{ marginBottom: 10 }}
        aria-label="openapi-attack-url-readonly"
      />
      <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
        <span className="pk-studio-connector-field-label">Режим схемы</span>
        <Select
          value={fields.spec_mode}
          style={{ width: '100%' }}
          options={[
            { value: 'url_relative', label: 'Относительный путь (к URL атаки)' },
            { value: 'resource', label: 'Ресурс openapi_spec' },
          ]}
          onChange={(v: OpenApiSpecMode) => onChange({ spec_mode: v })}
        />
      </label>
      {fields.spec_mode === 'resource' ? (
        <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
          <span className="pk-studio-connector-field-label">Ресурс openapi_spec</span>
          <Select
            value={fields.spec_as || undefined}
            style={{ width: '100%' }}
            placeholder={
              specOptions.length === 0
                ? 'Сначала создайте ресурс openapi_spec'
                : 'Выберите ресурс'
            }
            options={specOptions.map((r) => ({
              value: r.as,
              label: `${r.as} (${r.path})`,
            }))}
            onChange={(v: string) => onChange({ spec_as: v })}
            allowClear
          />
        </label>
      ) : (
        <Input
          value={fields.spec_path_rel}
          placeholder="/openapi.json"
          style={{ marginBottom: 10 }}
          onChange={(e) => onChange({ spec_path_rel: e.target.value })}
          aria-label="openapi-spec-path-rel"
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
        style={{ marginBottom: 12 }}
        onChange={(e) => onChange({ zap_import: e.target.checked })}
      >
        Разрешить ИмпортOpenAPI в ZAP (только по шагу сценария)
      </Checkbox>
      <Button
        type="primary"
        loading={busy}
        onClick={() => void runInventory()}
        style={{ marginBottom: 12 }}
        disabled={fields.spec_mode === 'resource' && !fields.spec_as}
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
        placeholder="После «Список операций» — перечень method и path"
        style={{ marginTop: 6 }}
        data-testid="openapi-ops-readonly"
      />
    </div>
  );
}
