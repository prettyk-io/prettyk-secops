/** Resolve OpenAPI inventory target URL/path (Sonar S3776). */

export function resolveOpenApiSpecTarget(args: {
  specMode: string;
  specAs: string;
  specPathRel: string;
  selectedPath: string;
  attackBaseUrl: string;
}): { ok: true; spec: string } | { ok: false; error: string } {
  if (args.specMode === 'resource') {
    if (!args.specAs.trim()) {
      return { ok: false, error: 'Выберите ресурс openapi_spec' };
    }
    const spec = (args.selectedPath || '').trim();
    if (!spec) {
      return { ok: false, error: 'У ресурса пустой path' };
    }
    return { ok: true, spec };
  }
  const rel = (args.specPathRel || '/openapi.json').trim();
  const base = (args.attackBaseUrl || '').trim().replace(/\/$/, '');
  if (rel.startsWith('http://') || rel.startsWith('https://')) {
    return { ok: true, spec: rel };
  }
  if (!base) {
    return {
      ok: false,
      error: 'Задайте URL атаки в инфраструктуре или относительный путь',
    };
  }
  return {
    ok: true,
    spec: `${base}${rel.startsWith('/') ? '' : '/'}${rel}`,
  };
}
