/**
 * Debounced fuzzer form inputs (S3776 / FuzzerForm size).
 */
import React from 'react';
import { Input } from 'antd';
import { useLocalTextDraft } from '../utils/localTextDraft';

/** Текст → formData с debounce; иначе Backspace лагает на студии. */
export function DeferredTextInput({
  value,
  onCommit,
  status,
  placeholder,
  size,
}: {
  value: string;
  onCommit: (next: string) => void;
  status?: 'error';
  placeholder?: string;
  size?: 'small' | 'middle' | 'large';
}): React.JSX.Element {
  const { draft, onChange, onFocus, onBlur } = useLocalTextDraft(value, onCommit);
  return (
    <Input
      size={size}
      value={draft}
      status={status}
      placeholder={placeholder}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

export function DeferredTextArea({
  value,
  onCommit,
  rows,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  rows?: number;
  placeholder?: string;
}): React.JSX.Element {
  const { draft, onChange, onFocus, onBlur } = useLocalTextDraft(value, onCommit);
  return (
    <Input.TextArea
      value={draft}
      rows={rows}
      placeholder={placeholder}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
