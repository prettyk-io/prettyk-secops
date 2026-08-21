/**
 * Studio module_type=gRPC — ссылка на ресурс proto_pack; host/TLS из URL атаки.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Typography } from 'antd';
import { packGrpcLab } from '../api/labApiImport';
import { normalizeGrpcFields, type GrpcFields } from './apiModuleFields';
import { formatGrpcInventoryText } from './apiModuleInventoryText';
import { listProtoPackResources, type ResourceFields } from './studioResources';

export type GrpcModuleFormProps = {
  value: GrpcFields;
  onChange: (patch: Partial<GrpcFields>) => void;
  moduleId?: string;
  formData?: unknown;
  /** URL атаки из infrastructure — только для справки. */
  attackBaseUrl?: string;
};

function attackHostInfo(baseUrl: string): { host: string; tls: boolean } {
  const raw = (baseUrl || '').trim();
  if (!raw) {
    return { host: '(не задан URL атаки)', tls: false };
  }
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const host = u.host || raw;
    return { host, tls: u.protocol === 'https:' };
  } catch {
    return { host: raw, tls: false };
  }
}

export function GrpcModuleForm({
  value,
  onChange,
  moduleId = '',
  formData,
  attackBaseUrl = '',
}: GrpcModuleFormProps): React.JSX.Element {
  const fields = normalizeGrpcFields(value);
  const mid = moduleId.trim() || '<id>';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const protoOptions = useMemo(() => listProtoPackResources(formData), [formData]);
  const selected: ResourceFields | undefined = protoOptions.find(
    (r) => r.as === fields.proto_as,
  );
  const attack = attackHostInfo(attackBaseUrl);

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

  const runInventory = async () => {
    setBusy(true);
    setError(null);
    try {
      const pack = (selected?.path || '').trim();
      if (!fields.proto_as.trim()) {
        setError('Выберите ресурс proto_pack');
        return;
      }
      if (!pack) {
        setError('У ресурса пустой path');
        return;
      }
      const res = await packGrpcLab({
        proto_pack: pack,
        import_paths: selected?.import_paths || [],
      });
      if (!res.ok) {
        setError(
          (res.notes && res.notes[0]) || res.error || 'ошибка разбора пакета proto',
        );
        return;
      }
      onChange({
        last_inventory: (res.services || []) as Record<string, unknown>[],
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const invText = formatGrpcInventoryText(fields.last_inventory || []);

  return (
    <div className="pk-studio-api-module-form" data-testid="grpc-module-form">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12, borderRadius: 6 }}
        message="gRPC"
        description={`Цель — URL атаки манифеста (не переопределяется). В сценарии: СписокСервисовgRPC ${mid} · ВызовgRPC ${mid} Service/Method`}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
        Цель атаки (только справка)
      </Typography.Text>
      <Input
        value={`${attack.host}${attack.tls ? ' · TLS' : ''}`}
        readOnly
        style={{ marginBottom: 10 }}
        aria-label="grpc-attack-host-readonly"
      />
      <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
        <span className="pk-studio-connector-field-label">Ресурс proto_pack</span>
        <Select
          value={fields.proto_as || undefined}
          style={{ width: '100%' }}
          placeholder={
            protoOptions.length === 0
              ? 'Сначала создайте ресурс proto_pack'
              : 'Выберите ресурс'
          }
          options={protoOptions.map((r) => ({
            value: r.as,
            label: `${r.as} (${r.path})`,
          }))}
          onChange={(v: string) => onChange({ proto_as: v })}
          allowClear
        />
      </label>
      {selected ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
          Путь: {selected.path}
          {selected.import_paths?.length
            ? ` · корни: ${selected.import_paths.join(', ')}`
            : ''}
        </Typography.Text>
      ) : null}
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
      <Button
        type="primary"
        loading={busy}
        onClick={() => void runInventory()}
        style={{ marginBottom: 12 }}
        disabled={!fields.proto_as}
      >
        Список сервисов
      </Button>
      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 10, borderRadius: 6 }} />
      ) : null}
      <Typography.Text strong>Сервисы и методы</Typography.Text>
      <Input.TextArea
        value={invText}
        readOnly
        rows={10}
        placeholder="После «Список сервисов» — дерево service / rpc"
        style={{ marginTop: 6 }}
        data-testid="grpc-ops-readonly"
      />
    </div>
  );
}
