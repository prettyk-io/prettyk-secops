/**
 * Studio module_type=Цепь — HAR → Replace Map → фугас (PRE).
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Input, Select, Typography } from 'antd';
import {
  chainDryRunPreLab,
  chainFromHarLab,
  chainMaterializeLab,
} from '../api/labApiImport';
import {
  applyValuePackToBindings,
  dataModuleEditorText,
  listDataModuleIds,
  normalizeChainFields,
  normalizeSlotApply,
  normalizeStepRole,
  type ChainFields,
  type ChainSlot,
  type ChainStep,
} from './chainModuleFields';

export type ChainModuleFormProps = {
  value: ChainFields;
  moduleId: string;
  formData?: unknown;
  onChange: (patch: Partial<ChainFields>) => void;
  onApplyPlay: (payload: {
    harAs: string;
    harText: string;
    seed: string;
    fuzzTargets: Array<{ method?: string; url?: string; body?: string }>;
  }) => void;
};

export function ChainModuleForm({
  value,
  moduleId,
  formData,
  onChange,
  onApplyPlay,
}: ChainModuleFormProps): React.JSX.Element {
  const fields = normalizeChainFields(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valuePackPaste, setValuePackPaste] = useState('');

  const harAs = fields.har_as.trim() || moduleId;
  const seqName = fields.sequence_name.trim() || harAs;

  const dataModuleIds = useMemo(() => listDataModuleIds(formData), [formData]);

  const valuePackTextForLab = (): string => {
    const mid = fields.value_pack_module.trim();
    if (!mid) {
      return '';
    }
    return dataModuleEditorText(formData, mid);
  };

  const chainFieldsPayload = () => {
    const packText = valuePackTextForLab();
    return {
      ...fields,
      har_as: harAs,
      sequence_name: seqName,
      module_id: moduleId,
      ...(packText ? { value_pack_text: packText } : {}),
    };
  };

  const runFromHar = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await chainFromHarLab({
        har: fields.source_har,
        har_as: harAs,
        sequence_name: seqName,
      });
      if (!res.ok) {
        setError((res.notes && res.notes[0]) || res.error || 'from-har fail');
        return;
      }
      const steps = (res.steps || []).map((s, i) => {
        const row = s as ChainStep;
        return { ...row, role: normalizeStepRole(row.role ?? 'attack'), index: row.index ?? i };
      });
      onChange({
        har_as: harAs,
        sequence_name: seqName,
        steps,
        slots: normalizeChainFields({ slots: res.slots }).slots,
        template_har: res.template_har || '',
        last_notes: res.notes || [],
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const runMaterialize = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await chainMaterializeLab({
        chain_fields: chainFieldsPayload(),
        bindings: fields.bindings,
        wired: formData as Record<string, unknown> | undefined,
      });
      if (!res.ok || !res.har_text) {
        setError((res.notes && res.notes[0]) || res.error || 'ошибка сборки HAR');
        return;
      }
      onChange({ last_notes: res.notes || [] });
      const seedFallback = fields.include_sequence_scan
        ? `СканированиеЦепи ${moduleId}`
        : `ВыполнитьЦепь ${moduleId}`;
      onApplyPlay({
        harAs: res.har_as || harAs,
        harText: res.har_text,
        seed: (res.seed || '').trim() || seedFallback,
        fuzzTargets: res.fuzz_targets || [],
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const runDryPre = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await chainDryRunPreLab({
        chain_fields: chainFieldsPayload(),
        bindings: fields.bindings,
        wired: formData as Record<string, unknown> | undefined,
      });
      if (!res.ok) {
        setError((res.notes && res.notes[0]) || res.error || 'dry-run pre fail');
        onChange({ last_notes: res.notes || [] });
        return;
      }
      onChange({ last_notes: res.notes || [] });
      if (res.setup_har_text) {
        onApplyPlay({
          harAs: `${harAs}_setup`,
          harText: res.setup_har_text,
          seed: (res.seed || '').trim() || `ПодготовитьЦепь ${moduleId}`,
          fuzzTargets: [],
        });
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(false);
    }
  };

  const loadModuleIntoBindings = () => {
    setError(null);
    const text = valuePackTextForLab();
    if (!text.trim()) {
      setError('value_pack_module: пустой editor или модуль не выбран');
      return;
    }
    const out = applyValuePackToBindings(fields.bindings, text);
    if (out.error) {
      setError(out.error);
      return;
    }
    onChange({
      bindings: out.bindings,
      last_notes: [`value_pack_module=${fields.value_pack_module}`, ...out.notes],
    });
  };

  const applyPackToBindings = () => {
    setError(null);
    const out = applyValuePackToBindings(fields.bindings, valuePackPaste);
    if (out.error) {
      setError(out.error);
      return;
    }
    onChange({ bindings: out.bindings, last_notes: out.notes });
  };

  const patchSlot = (index: number, patch: Partial<ChainSlot>) => {
    const slots = fields.slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ slots });
  };

  const patchStepRole = (index: number, role: 'precondition' | 'attack') => {
    const steps = fields.steps.map((s, i) => (i === index ? { ...s, role } : s));
    onChange({ steps });
  };

  return (
    <div className="pk-studio-api-module-form" data-testid="chain-module-form">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12, borderRadius: 6 }}
        message="Цепь / фугас"
        description="Карта подмен (slots) ≠ fuzz. Values — data-модуль properties (как auth_data) или paste JSON."
      />
      <label className="pk-studio-connector-field" style={{ display: 'block', marginBottom: 10 }}>
        <span className="pk-studio-connector-field-label">Имя ресурса HAR / последовательность</span>
        <Input
          value={fields.har_as}
          placeholder={moduleId}
          style={{ marginBottom: 6 }}
          onChange={(e) => onChange({ har_as: e.target.value })}
          aria-label="chain-har-as"
        />
        <Input
          value={fields.sequence_name}
          placeholder={harAs}
          onChange={(e) => onChange({ sequence_name: e.target.value })}
          aria-label="chain-sequence-name"
        />
      </label>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
        Исходный HAR (запись)
      </Typography.Text>
      <Input.TextArea
        value={fields.source_har}
        rows={8}
        placeholder='{"log":{"entries":[...]}}'
        style={{ marginBottom: 10, fontFamily: 'var(--pk-mono-font, monospace)' }}
        onChange={(e) => onChange({ source_har: e.target.value })}
        aria-label="chain-source-har"
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Button type="primary" loading={busy} onClick={() => void runFromHar()}>
          Разобрать HAR → карта
        </Button>
        <Checkbox
          checked={fields.include_sequence_scan}
          onChange={(e) => onChange({ include_sequence_scan: e.target.checked })}
        >
          + СканированиеЦепи
        </Checkbox>
        <Checkbox
          checked={fields.seed_fuzz_targets}
          onChange={(e) => onChange({ seed_fuzz_targets: e.target.checked })}
        >
          + цели фаззинга (только attack)
        </Checkbox>
      </div>
      {fields.steps.length > 0 ? (
        <div style={{ marginBottom: 12 }} data-testid="chain-steps">
          <Typography.Text type="secondary">
            Шаги — роль precondition / attack
          </Typography.Text>
          {fields.steps.map((step, index) => (
            <div
              key={`step-${String(step.index ?? index)}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: 6,
                marginTop: 6,
                alignItems: 'center',
              }}
            >
              <Select
                size="small"
                value={normalizeStepRole(step.role)}
                options={[
                  { value: 'precondition', label: 'pre' },
                  { value: 'attack', label: 'attack' },
                ]}
                onChange={(v) => patchStepRole(index, v)}
                aria-label={`chain-step-role-${String(index)}`}
              />
              <Typography.Text
                ellipsis
                style={{ fontFamily: 'var(--pk-mono-font, monospace)', fontSize: 12 }}
              >
                {String(step.method ?? '?')} {String(step.url ?? '')}
              </Typography.Text>
            </div>
          ))}
        </div>
      ) : null}
      {fields.slots.length > 0 ? (
        <div style={{ marginBottom: 12 }} data-testid="chain-replace-map">
          <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
            Карта подмен
          </Typography.Text>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            id → location/key · apply step|all · match URL · bind / play value
          </Typography.Text>
          {fields.slots.map((slot, index) => (
            <div
              key={slot.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 90px 1fr 1fr 1fr',
                gap: 6,
                marginTop: 6,
                alignItems: 'center',
              }}
              data-testid={`chain-map-row-${slot.id}`}
            >
              <Checkbox
                checked={slot.enabled}
                onChange={(e) => patchSlot(index, { enabled: e.target.checked })}
              >
                {slot.id}
              </Checkbox>
              <Select
                size="small"
                value={normalizeSlotApply(slot.apply)}
                options={[
                  { value: 'step', label: 'step' },
                  { value: 'all', label: 'all' },
                ]}
                onChange={(v) => patchSlot(index, { apply: v })}
                aria-label={`chain-slot-apply-${slot.id}`}
              />
              <Input
                size="small"
                value={slot.match}
                placeholder="match / regex:…"
                onChange={(e) => patchSlot(index, { match: e.target.value })}
                aria-label={`chain-slot-match-${slot.id}`}
              />
              <Input
                size="small"
                value={slot.bind}
                placeholder="literal:… | extract:…"
                onChange={(e) => patchSlot(index, { bind: e.target.value })}
                aria-label={`chain-slot-bind-${slot.id}`}
              />
              <Input
                size="small"
                value={fields.bindings[slot.id] ?? ''}
                placeholder="play / override"
                onChange={(e) =>
                  onChange({
                    bindings: { ...fields.bindings, [slot.id]: e.target.value },
                  })
                }
                aria-label={`chain-slot-play-${slot.id}`}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ marginBottom: 12 }} data-testid="chain-value-pack">
        <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
          Value pack
        </Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
          Data-модуль properties (ключи = id слотов), как auth_data
        </Typography.Text>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <Select
            allowClear
            showSearch
            placeholder="модуль…"
            style={{ minWidth: 200 }}
            value={fields.value_pack_module || undefined}
            options={dataModuleIds.map((id) => ({ value: id, label: id }))}
            onChange={(v) => onChange({ value_pack_module: v || '' })}
            aria-label="chain-value-pack-module"
          />
          <Button
            size="small"
            disabled={!fields.value_pack_module.trim()}
            onClick={loadModuleIntoBindings}
          >
            Модуль → bindings
          </Button>
        </div>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
          Или paste JSON / properties
        </Typography.Text>
        <Input.TextArea
          value={valuePackPaste}
          rows={3}
          placeholder={'authorization=Bearer …\n#csrf=…\nили {"authorization":"Bearer …"}'}
          style={{ marginBottom: 8, fontFamily: 'var(--pk-mono-font, monospace)' }}
          onChange={(e) => setValuePackPaste(e.target.value)}
          aria-label="chain-value-pack-paste"
        />
        <Button size="small" disabled={!valuePackPaste.trim()} onClick={applyPackToBindings}>
          Paste → bindings
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          type="default"
          loading={busy}
          disabled={!fields.template_har && !fields.source_har}
          onClick={() => void runMaterialize()}
        >
          Собрать в «Ресурсы» и вставить в сценарий
        </Button>
        <Button
          loading={busy}
          disabled={!fields.template_har && !fields.source_har}
          onClick={() => void runDryPre()}
        >
          Dry-run pre → ПодготовитьЦепь
        </Button>
      </div>
      {error ? (
        <Alert type="error" showIcon style={{ marginTop: 12 }} message={error} />
      ) : null}
      {fields.last_notes.length > 0 ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {fields.last_notes.join(' · ')}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
}
