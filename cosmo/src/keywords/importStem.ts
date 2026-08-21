/**
 * Import path / object → variable stem (S3776).
 */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function stemFromImportPath(item: string): string | undefined {
  const slash = Math.max(item.lastIndexOf('/'), item.lastIndexOf('\\'));
  const leaf = slash >= 0 ? item.slice(slash + 1) : item;
  const dot = leaf.lastIndexOf('.');
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  if (stem && IDENT_RE.test(stem)) {
    return stem;
  }
  return undefined;
}

export function isIdentName(value: string): boolean {
  return IDENT_RE.test(value);
}
