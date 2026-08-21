/**
 * AUTH-15 Studio: MFA action — тип+значение локаторов + totp/sms (без SoT rewrite).
 */
import React, { useMemo } from 'react';
import { Input, Select, Typography } from 'antd';
import {
  AUTH_LOCATOR_TYPES,
  defaultAuthActionFields,
  parseAuthActionConstructor,
  serializeAuthActionConstructor,
  type AuthActionFields,
  type AuthLocatorType,
  type AuthMfaMode,
} from './authFormFields';

export type AuthActionModuleFormProps = {
  constructorText: string;
  onConstructorChange: (text: string) => void;
};

const TYPE_OPTIONS = AUTH_LOCATOR_TYPES.map((t) => ({ value: t, label: t }));
const MFA_OPTIONS = [
  { value: 'totp', label: 'TOTP' },
  { value: 'sms', label: 'SMS код' },
];

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

export function AuthActionModuleForm({
  constructorText,
  onConstructorChange,
}: AuthActionModuleFormProps): React.JSX.Element {
  const fields = useMemo(
    () => parseAuthActionConstructor(constructorText),
    [constructorText],
  );

  const patch = (partial: Partial<AuthActionFields>) => {
    onConstructorChange(
      serializeAuthActionConstructor(
        defaultAuthActionFields({ ...fields, ...partial }),
      ),
    );
  };

  return (
    <div className="pk-studio-resource-form" data-testid="auth-action-module">
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Password → OTP (TOTP/SMS). Локаторы: css / xpath / id / name.
      </Typography.Text>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">URL входа</span>
        <Input
          value={fields.login_url}
          placeholder="https://idp/login"
          onChange={(e) => patch({ login_url: e.target.value })}
        />
      </label>
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">Логин</span>
        <Input value={fields.login} onChange={(e) => patch({ login: e.target.value })} />
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
        testId="auth-action-user-locator"
      />
      <LocatorRow
        label="Поле пароля"
        type={fields.pass_type}
        value={fields.pass_value}
        onType={(t) => patch({ pass_type: t })}
        onValue={(v) => patch({ pass_value: v })}
        testId="auth-action-pass-locator"
      />
      <LocatorRow
        label="Submit пароля"
        type={fields.submit_type}
        value={fields.submit_value}
        onType={(t) => patch({ submit_type: t })}
        onValue={(v) => patch({ submit_value: v })}
        testId="auth-action-submit-locator"
      />
      <label className="pk-studio-connector-field">
        <span className="pk-studio-connector-field-label">MFA</span>
        <Select
          style={{ width: '100%' }}
          options={MFA_OPTIONS}
          value={fields.mfa}
          onChange={(v) => patch({ mfa: v as AuthMfaMode })}
        />
      </label>
      {fields.mfa === 'totp' ? (
        <label className="pk-studio-connector-field">
          <span className="pk-studio-connector-field-label">TOTP secret</span>
          <Input.Password
            value={fields.totp_secret}
            onChange={(e) => patch({ totp_secret: e.target.value })}
          />
        </label>
      ) : (
        <label className="pk-studio-connector-field">
          <span className="pk-studio-connector-field-label">SMS otp_code</span>
          <Input
            value={fields.otp_code}
            placeholder="424242"
            onChange={(e) => patch({ otp_code: e.target.value })}
          />
        </label>
      )}
      <LocatorRow
        label="Поле OTP"
        type={fields.otp_type}
        value={fields.otp_value}
        onType={(t) => patch({ otp_type: t })}
        onValue={(v) => patch({ otp_value: v })}
        testId="auth-action-otp-locator"
      />
      <LocatorRow
        label="Submit OTP"
        type={fields.otp_submit_type}
        value={fields.otp_submit_value}
        onType={(t) => patch({ otp_submit_type: t })}
        onValue={(v) => patch({ otp_submit_value: v })}
        testId="auth-action-otp-submit-locator"
      />
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
