/**
 * AUTH-14C: Studio карточка form-login — тип+значение локатора (без SoT rewrite).
 */
import React, { useMemo } from 'react';
import { Input, Select, Typography } from 'antd';
import {
  AUTH_LOCATOR_TYPES,
  defaultAuthFormFields,
  parseAuthFormConstructor,
  serializeAuthFormConstructor,
  type AuthFormFields,
  type AuthLocatorType,
} from './authFormFields';

export type AuthFormModuleFormProps = {
  constructorText: string;
  onConstructorChange: (text: string) => void;
};

const TYPE_OPTIONS = AUTH_LOCATOR_TYPES.map((t) => ({ value: t, label: t }));

function LocatorRow({
  label,
  type,
  value,
  onType,
  onValue,
  testId,
}: {
  label: string;
  type: AuthLocatorType;
  value: string;
  onType: (t: AuthLocatorType) => void;
  onValue: (v: string) => void;
  testId: string;
}): React.JSX.Element {
  return (
    <div className="pk-studio-connector-field" data-testid={testId}>
      <span className="pk-studio-connector-field-label">{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Select
          style={{ width: 110 }}
          options={TYPE_OPTIONS}
          value={type}
          onChange={(v) => onType(v as AuthLocatorType)}
          aria-label={`${label} тип`}
        />
        <Input
          style={{ flex: 1 }}
          value={value}
          placeholder="значение локатора"
          onChange={(e) => onValue(e.target.value)}
        />
      </div>
    </div>
  );
}

export function AuthFormModuleForm({
  constructorText,
  onConstructorChange,
}: AuthFormModuleFormProps): React.JSX.Element {
  const fields = useMemo(
    () => parseAuthFormConstructor(constructorText),
    [constructorText],
  );

  const patch = (partial: Partial<AuthFormFields>) => {
    onConstructorChange(
      serializeAuthFormConstructor(defaultAuthFormFields({ ...fields, ...partial })),
    );
  };

  return (
    <div className="pk-studio-resource-form" data-testid="auth-form-module">
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        css / xpath / id / name — полный WebDriver (не id-only)
      </Typography.Text>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">URL входа</span>
        <Input
          value={fields.login_url}
          placeholder="https://app/login"
          onChange={(e) => patch({ login_url: e.target.value })}
        />
      </label>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">Логин</span>
        <Input
          value={fields.login}
          onChange={(e) => patch({ login: e.target.value })}
        />
      </label>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">Пароль</span>
        <Input.Password
          value={fields.password}
          onChange={(e) => patch({ password: e.target.value })}
        />
      </label>
      <LocatorRow
        label="Поле логина"
        type={fields.user_type}
        value={fields.user_value}
        onType={(t) => patch({ user_type: t })}
        onValue={(v) => patch({ user_value: v })}
        testId="auth-form-user-locator"
      />
      <LocatorRow
        label="Поле пароля"
        type={fields.pass_type}
        value={fields.pass_value}
        onType={(t) => patch({ pass_type: t })}
        onValue={(v) => patch({ pass_value: v })}
        testId="auth-form-pass-locator"
      />
      <LocatorRow
        label="Кнопка отправки"
        type={fields.submit_type}
        value={fields.submit_value}
        onType={(t) => patch({ submit_type: t })}
        onValue={(v) => patch({ submit_value: v })}
        testId="auth-form-submit-locator"
      />
      <LocatorRow
        label="Форма (необязательно)"
        type={fields.form_type}
        value={fields.form_value}
        onType={(t) => patch({ form_type: t })}
        onValue={(v) => patch({ form_value: v })}
        testId="auth-form-form-locator"
      />
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">Success URL</span>
        <Input
          value={fields.success_url}
          placeholder="https://app/"
          onChange={(e) => patch({ success_url: e.target.value })}
        />
      </label>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">Проверочная строка</span>
        <Input
          value={fields.success_string}
          placeholder="Logout"
          onChange={(e) => patch({ success_string: e.target.value })}
        />
      </label>
    </div>
  );
}
