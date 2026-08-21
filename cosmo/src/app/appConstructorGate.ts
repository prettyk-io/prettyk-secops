/**
 * Client-side constructor gate helpers for App (S3776 extract).
 */
import type { ConstructorBatchFail } from '../api/editorValidate';
import { batchFailFromClientDiag } from '../api/editorValidate';
import {
  analyzeConstructor,
  flattenConstructorText,
  type CollectedConstructor,
} from '../keywords/constructor';
import type { KeywordCatalog } from '../keywords/catalog';
import { collectVariables } from '../keywords/variables';

function securityFields(data: unknown): { allowed: string; base: string } {
  const root =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const infra =
    root?.infrastructure !== null &&
    typeof root?.infrastructure === 'object' &&
    !Array.isArray(root.infrastructure)
      ? (root.infrastructure as Record<string, unknown>)
      : undefined;
  const sec =
    root?.security_configuration !== null &&
    typeof root?.security_configuration === 'object' &&
    !Array.isArray(root.security_configuration)
      ? (root.security_configuration as Record<string, unknown>)
      : undefined;
  const allowed = String(infra?.allowed_extra_domains ?? sec?.allowed_extra_domains ?? '');
  const base = String(infra?.base_url_override ?? sec?.base_url_override ?? '');
  return { allowed, base };
}

export function collectClientConstructorFails(
  fields: readonly CollectedConstructor[],
  data: unknown,
  keywordCatalog: KeywordCatalog,
): ConstructorBatchFail[] {
  const knownVariables = collectVariables(data);
  const { allowed, base } = securityFields(data);
  const clientFails: ConstructorBatchFail[] = [];
  for (const field of fields) {
    const flat = flattenConstructorText(field.text);
    const err = analyzeConstructor(flat, keywordCatalog, {
      knownVariables,
      allowedExtraDomains: allowed,
      baseUrl: base,
    }).find((item) => item.severity === 'error');
    if (err) {
      clientFails.push(batchFailFromClientDiag({ ...field, text: flat }, err, data));
    }
  }
  return clientFails;
}

export function mergeConstructorFails(
  backendFails: ConstructorBatchFail[] | null,
  clientFails: ConstructorBatchFail[],
): ConstructorBatchFail[] {
  if (backendFails === null) {
    return clientFails;
  }
  return [
    ...backendFails,
    ...clientFails.filter((cf) => !backendFails.some((bf) => bf.id === cf.id)),
  ];
}
