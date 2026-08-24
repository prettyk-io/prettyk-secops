/**
 * OpenAPI inventory fetch for OpenApiModuleForm (S3776).
 */
import { parseOpenApiLab } from '../api/labApiImport';
import { resolveOpenApiSpecTarget } from './openapiSpecTarget';
import type { OpenApiFields } from './apiModuleFields';

export async function fetchOpenApiInventory(args: {
  fields: OpenApiFields;
  selectedPath: string;
  attackBaseUrl: string;
}): Promise<
  | { ok: true; operations: Record<string, unknown>[] }
  | { ok: false; error: string }
> {
  const target = resolveOpenApiSpecTarget({
    specMode: args.fields.spec_mode,
    specAs: args.fields.spec_as,
    specPathRel: args.fields.spec_path_rel || '/openapi.json',
    selectedPath: args.selectedPath,
    attackBaseUrl: args.attackBaseUrl,
  });
  if (!target.ok) {
    return { ok: false, error: target.error };
  }
  const res = await parseOpenApiLab(target.spec);
  if (!res.ok) {
    return {
      ok: false,
      error: (res.notes && res.notes[0]) || res.error || 'ошибка разбора схемы',
    };
  }
  return {
    ok: true,
    operations: (res.operations || []) as Record<string, unknown>[],
  };
}
