/**
 * RK-FORM-1: data-driven WiredForm.
 * Читает SECTIONS из fields.ts, рендерит Regulation без JSX-простыней.
 * Секции: Регламент + Редактор.
 */

import { useCallback, useMemo } from 'react';
import { Card, Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import type { SelectProps } from 'antd';
import type { Wired, Regulation } from './types';
import { SECTIONS, type FieldDef } from './fields';
import { getPath } from './path';
import type { FieldError } from './validateWiredFields';

export interface WiredFormProps {
  wired: Wired;
  onChange: (wired: Wired) => void;
  fieldErrors?: FieldError[];
}

const { Text } = Typography;

/* ── helpers ── */

function cloneRegulationWired(
  m: Wired,
  patch: (draft: Regulation) => void,
): Wired {
  const regulation = JSON.parse(JSON.stringify(m.regulation)) as Regulation;
  patch(regulation);
  return { ...m, regulation };
}

/** Мутабельная запись в Regulation (draft уже глубокий клон). */
function setRegulationField(draft: Regulation, path: string, value: unknown): void {
  const dot = path.indexOf('.');
  if (dot === -1) return;
  const section = path.slice(0, dot);
  const key = path.slice(dot + 1);
  if (section === 'meta') {
    (draft.meta as unknown as Record<string, unknown>)[key] = value;
  } else if (section === 'infrastructure') {
    (draft.infrastructure as unknown as Record<string, unknown>)[key] = value;
  } else if (section === 'security_configuration') {
    (draft.security_configuration as unknown as Record<string, unknown>)[key] = value;
  }
}

/** Разбивает поля на строки: fullWidth → своя строка, иначе парами. */
function chunkFields(items: FieldDef[]): FieldDef[][] {
  const rows: FieldDef[][] = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    if (!cur) break;
    if (cur.fullWidth) {
      rows.push([cur]);
      i += 1;
      continue;
    }
    const next = items[i + 1];
    if (next && !next.fullWidth) {
      rows.push([cur, next]);
      i += 2;
    } else {
      rows.push([cur]);
      i += 1;
    }
  }
  return rows;
}

/* ── style presets ── */

const SECTION_STYLE: React.CSSProperties = { marginBottom: 0 };

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--pk-section-title-color, inherit)',
  marginBottom: 12,
};

const DIVIDER_STYLE: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--pk-border-color-base, #30363d)',
  margin: '16px 0',
};

const ROW_STYLE: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };

const FIELD_STYLE: React.CSSProperties = { flex: '1 1 240px', minWidth: 200 };

function SectionDivider() {
  return <hr style={DIVIDER_STYLE} className="pk-section-divider" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={TITLE_STYLE} className="pk-section-title">{children}</div>;
}

/* ── компонент ── */

export function WiredForm({ wired, onChange, fieldErrors }: WiredFormProps) {
  if (SECTIONS.length === 0) return null;
  const { regulation, editor } = wired;
  const regState = regulation as unknown as Record<string, unknown>;

  const errorMap = useMemo(
    () => {
      if (!fieldErrors || fieldErrors.length === 0) return null;
      const map = new Map<string, string>();
      for (const e of fieldErrors) {
        const cur = map.get(e.path);
        map.set(e.path, cur ? `${cur}; ${e.message}` : e.message);
      }
      return map;
    },
    [fieldErrors],
  );

  const handleFieldChange = useCallback(
    (def: FieldDef, value: unknown) => {
      onChange(
        cloneRegulationWired(wired, (draft) => {
          setRegulationField(draft, def.path, value);
        }),
      );
    },
    [wired, onChange],
  );

  const renderField = (def: FieldDef) => {
    const raw = getPath(regState, def.path);
    const value =
      def.kind === 'number' && raw == null ? (def.defaultValue ?? undefined) : raw;
    const locked = def.lockedIf?.(regState) ?? false;
    const disabled = locked || def.readOnly;
    const errMsg = errorMap?.get(def.path);
    const validateStatus: 'error' | undefined = errMsg ? 'error' : undefined;

    const onChangeValue = (v: unknown) => handleFieldChange(def, v);

    let input: React.ReactNode;
    switch (def.kind) {
      case 'text':
        input = (
          <Input
            value={String(value ?? '')}
            readOnly={disabled}
            disabled={disabled}
            placeholder={def.placeholder}
            onChange={(e) => onChangeValue(e.target.value)}
          />
        );
        break;
      case 'number':
        input = (
          <InputNumber
            value={value != null ? Number(value) : undefined}
            min={def.min}
            max={def.max}
            disabled={disabled}
            placeholder={def.placeholder}
            style={{ width: '100%' }}
            onChange={(v) => onChangeValue(v ?? undefined)}
          />
        );
        break;
      case 'select':
        input = (
          <Select
            value={value as string}
            options={def.options as SelectProps['options']}
            disabled={disabled}
            placeholder={def.placeholder}
            style={{ width: '100%' }}
            onChange={(v) => onChangeValue(v)}
          />
        );
        break;
      case 'boolean':
        input = (
          <Switch
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(v) => onChangeValue(v)}
          />
        );
        break;
    }

    return (
      <div style={FIELD_STYLE} key={def.path}>
        <Form.Item
          label={def.label}
          colon={false}
          required={def.required}
          validateStatus={validateStatus}
          help={errMsg || (def.help && (!def.helpIf || def.helpIf(regState)) ? def.help : undefined)}
        >
          {input}
        </Form.Item>
      </div>
    );
  };

  return (
    <div className="pk-sections">
      {/* ─── Регламент ─── */}
      <Card className="pk-form-section" style={SECTION_STYLE}>
        <SectionTitle>Регламент</SectionTitle>

        {SECTIONS.map((sec, si) => {
          const visibleFields = sec.fields.filter(
            (f) => !f.visibleIf || f.visibleIf(regState),
          );
          if (visibleFields.length === 0) return null;

          const rows = chunkFields(visibleFields);

          return (
            <div key={sec.key}>
              {si > 0 && <SectionDivider />}
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {sec.label}
                </Text>
              </div>
              {rows.map((row, ri) => (
                <div style={ROW_STYLE} key={ri}>
                  {row.map((f) => renderField(f))}
                </div>
              ))}
            </div>
          );
        })}
      </Card>

      {/* ─── Редактор ─── */}
      <Card className="pk-form-section" style={SECTION_STYLE}>
        <SectionTitle>Редактор</SectionTitle>

        <div style={{ padding: '16px 0' }}>
          <Text type="secondary">
            Модули: {editor.modules.auth.length} auth,{' '}
            {editor.modules.openapi.length} OpenAPI,{' '}
            {editor.modules.graphql.length} GraphQL,{' '}
            {editor.modules.grpc.length} gRPC,{' '}
            {editor.modules.chain.length} цепей,{' '}
            {editor.modules.data.length} data,{' '}
            {editor.modules.connectors.length} коннекторов,{' '}
            {editor.modules.fuzzers.length} фаззеров
          </Text>
        </div>

        <div style={{ padding: '8px 0' }}>
          <Text type="secondary">
            Сценариев: {editor.scenarios.length}
            {', '}
            Страниц: {editor.pages.length}
            {', '}
            Импортов: {editor.imports.length}
            {', '}
            Целей фаззинга: {editor.fuzzer_targets.length}
          </Text>
        </div>

        <div style={{ padding: '8px 0' }}>
          <Text type="secondary">
            Папки:{' '}
            {editor.folders
              ? Object.entries(editor.folders).reduce(
                  (sum, [, items]) => sum + items.length,
                  0,
                )
              : 0}
          </Text>
        </div>
      </Card>
    </div>
  );
}
