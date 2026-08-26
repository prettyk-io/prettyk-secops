import { describe, expect, it } from 'vitest';
import {
  DRAFT_SECRET_PLACEHOLDER,
  REDACT_PLACEHOLDER,
  isSecretFieldKey,
  redactWiredForPreview,
  redactWiredSecrets,
  redactSecretAssignmentLines,
  redactSecretsForDraft,
  tryRedactSecretAssignmentAt,
  SECRET_FIELD_KEYS,
} from './redactSecrets';

describe('redactSecrets', () => {
  it('распознаёт ключи password / token / api_key / secret / passwd', () => {
    expect(isSecretFieldKey('password')).toBe(true);
    expect(isSecretFieldKey('token')).toBe(true);
    expect(isSecretFieldKey('api_key')).toBe(true);
    expect(isSecretFieldKey('secret')).toBe(true);
    expect(isSecretFieldKey('passwd')).toBe(true);
    expect(isSecretFieldKey('PASSWORD')).toBe(true);
    expect(isSecretFieldKey('TOKEN')).toBe(true);
    expect(isSecretFieldKey('API_KEY')).toBe(true);
  });

  it('не распознаёт обычные ключи', () => {
    expect(isSecretFieldKey('username')).toBe(false);
    expect(isSecretFieldKey('login')).toBe(false);
    expect(isSecretFieldKey('url')).toBe(false);
    expect(isSecretFieldKey('name')).toBe(false);
    expect(isSecretFieldKey('')).toBe(false);
  });

  it('SECRET_FIELD_KEYS содержит требуемые ключи', () => {
    expect(SECRET_FIELD_KEYS).toContain('password');
    expect(SECRET_FIELD_KEYS).toContain('token');
    expect(SECRET_FIELD_KEYS).toContain('api_key');
    expect(SECRET_FIELD_KEYS).toContain('secret');
    expect(SECRET_FIELD_KEYS).toContain('passwd');
  });

  it('redactWiredSecrets маскирует вложенные пароли → ***', () => {
    const data = {
      security_configuration: {
        auth_details: { token: 'abc123', login: 'admin' },
      },
      nested: [{ password: 'x' }, { other: 'y' }],
    };
    expect(redactWiredSecrets(data)).toEqual({
      security_configuration: {
        auth_details: { token: REDACT_PLACEHOLDER, login: 'admin' },
      },
      nested: [{ password: REDACT_PLACEHOLDER }, { other: 'y' }],
    });
  });

  it('redactSecretsForDraft очищает пароли → пустая строка', () => {
    const data = { api_key: 'keep-out', name: 'test' };
    expect(redactSecretsForDraft(data)).toEqual({ api_key: DRAFT_SECRET_PLACEHOLDER, name: 'test' });
  });

  it('redactSecretAssignmentLines маскирует RHS Секрет', () => {
    const text = 'Секрет $password_value = "pk_password"\nПусть $x = 1';
    expect(redactSecretAssignmentLines(text)).toBe(
      `Секрет $password_value = ${REDACT_PLACEHOLDER}\nПусть $x = 1`,
    );
  });

  it('redactSecretAssignmentLines не трогает не-Секрет строки', () => {
    const text = 'Пусть $url = "https://example.com"\nЛог "ok"';
    expect(redactSecretAssignmentLines(text)).toBe(text);
  });

  it('redactSecretAssignmentLines с кастомным placeholder', () => {
    const text = 'Секрет $t = "plain"';
    expect(redactSecretAssignmentLines(text, '[MASKED]')).toBe('Секрет $t = [MASKED]');
  });

  it('redactWiredForPreview: ключи + Секрет в constructor', () => {
    const data = {
      security_configuration: { password: 's3cret' },
      test_data_constructor: 'Секрет $password_value = "plain"\nЛог "ok"',
    };
    const preview = redactWiredForPreview(data) as typeof data;
    expect(preview.security_configuration.password).toBe(REDACT_PLACEHOLDER);
    expect(preview.test_data_constructor).toContain(`= ${REDACT_PLACEHOLDER}`);
    expect(preview.test_data_constructor).not.toContain('plain');
  });

  it('redactWiredSecrets не меняет числа и булевы значения', () => {
    const data = {
      port: 443,
      ssl: true,
      password: 'secret',
    };
    const result = redactWiredSecrets(data) as typeof data;
    expect(result.port).toBe(443);
    expect(result.ssl).toBe(true);
    expect(result.password).toBe(REDACT_PLACEHOLDER);
  });

  it('tryRedactSecretAssignmentAt распознаёт строки с Секрет', () => {
    const lines = ['Секрет $t = "value"', 'Лог "ok"', 'Секрет $x = 1'];
    expect(tryRedactSecretAssignmentAt(lines, 0)).toBe(true);
    expect(tryRedactSecretAssignmentAt(lines, 1)).toBe(false);
    expect(tryRedactSecretAssignmentAt(lines, 2)).toBe(true);
  });

  it('tryRedactSecretAssignmentAt граничные случаи', () => {
    expect(tryRedactSecretAssignmentAt([], 0)).toBe(false);
    expect(tryRedactSecretAssignmentAt(['nope'], -1)).toBe(false);
    expect(tryRedactSecretAssignmentAt(['nope'], 99)).toBe(false);
  });
});
