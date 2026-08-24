/**
 * Текст inventory для OpenAPI / GraphQL / gRPC форм (Sonar S3776).
 */

export function formatOpenApiOpsText(
  ops: Array<{ method?: unknown; path?: unknown; operation_id?: unknown }>,
): string {
  return ops
    .map((op) => {
      const method = String(op.method ?? '?');
      const path = String(op.path ?? '');
      const oid = op.operation_id ? `  ${String(op.operation_id)}` : '';
      return `${method} ${path}${oid}`.trim();
    })
    .join('\n');
}

export function formatGraphqlOpsText(
  ops: Array<{ kind?: unknown; name?: unknown }>,
): string {
  return ops
    .map((op) => {
      const kind = String(op.kind ?? 'op');
      const name = String(op.name ?? '');
      return `${kind} ${name}`.trim();
    })
    .join('\n');
}

export function formatGrpcInventoryText(
  services: Array<{ name?: unknown; methods?: unknown }>,
): string {
  return services
    .map((svc) => {
      const name = String(svc.name ?? '?');
      const methods = Array.isArray(svc.methods) ? svc.methods : [];
      const lines = [`service ${name}`];
      for (const m of methods) {
        const mm = m as Record<string, unknown>;
        lines.push(`  rpc ${String(mm.name ?? '?')}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}
