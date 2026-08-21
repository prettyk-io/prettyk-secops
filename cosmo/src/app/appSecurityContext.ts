/**
 * URL allowlist / base для keywords (infrastructure; legacy — security_configuration).
 */
export type AppSecurityStrings = {
  allowedExtraDomains: string;
  baseUrl: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringField(row: Record<string, unknown> | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === 'string' ? value : '';
}

export function readSecurityStrings(formData: unknown): AppSecurityStrings {
  const root = asRecord(formData);
  const infra = asRecord(root?.infrastructure);
  const sec = asRecord(root?.security_configuration);
  return {
    allowedExtraDomains:
      stringField(infra, 'allowed_extra_domains') || stringField(sec, 'allowed_extra_domains'),
    baseUrl: stringField(infra, 'base_url_override') || stringField(sec, 'base_url_override'),
  };
}
