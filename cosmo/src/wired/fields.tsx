/**
 * RK-FORM-2: виджеты без RJSF — прямые замены PkSelectWidget / PkNumberInput / PkTextareaWidget.
 * Обычные Ant Design контролы: Select, InputNumber, Input.TextArea.
 * Без RJSF, без JSON Schema, без uiSchema.
 */

import React from 'react';
import { Select, InputNumber, Input } from 'antd';
import type { SelectProps } from 'antd';

/* ── PkSelectWidget ── */

export interface PkSelectWidgetProps {
  value?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export function PkSelectWidget({
  value,
  onChange,
  options,
  disabled,
  readOnly,
  placeholder,
}: PkSelectWidgetProps): React.JSX.Element {
  return (
    <Select
      value={value}
      onChange={(v: string) => onChange?.(v)}
      options={options as SelectProps['options']}
      disabled={disabled || readOnly}
      placeholder={placeholder}
      style={{ width: '100%' }}
    />
  );
}

/* ── PkNumberInput ── */

export interface PkNumberInputProps {
  value?: number;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export function PkNumberInput({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  readOnly,
  placeholder,
}: PkNumberInputProps): React.JSX.Element {
  return (
    <InputNumber
      value={value}
      onChange={(v: number | null) => onChange?.(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled || readOnly}
      placeholder={placeholder}
      style={{ width: '100%' }}
    />
  );
}

/* ── PkTextareaWidget ── */

export interface PkTextareaWidgetProps {
  value?: string;
  onChange?: (value: string) => void;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export function PkTextareaWidget({
  value,
  onChange,
  rows = 3,
  maxLength,
  disabled,
  readOnly,
  placeholder,
}: PkTextareaWidgetProps): React.JSX.Element {
  return (
    <Input.TextArea
      value={value}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)}
      rows={rows}
      maxLength={maxLength}
      disabled={disabled || readOnly}
      placeholder={placeholder}
    />
  );
}
