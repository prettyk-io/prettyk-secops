/**
 * Merge local + backend constructor diagnostics (S3776).
 */
import type { ConstructorDiagnostic } from '../keywords/constructor';

export function mergeConstructorDiagnostics(
  localDiagnostics: readonly ConstructorDiagnostic[],
  backendDiagnostics: readonly ConstructorDiagnostic[] | null,
): ConstructorDiagnostic[] {
  if (backendDiagnostics === null) {
    return [...localDiagnostics];
  }
  const localErrors = localDiagnostics.filter((item) => item.severity === 'error');
  if (backendDiagnostics.length === 0) {
    // BE ok — всё равно показываем локальные error (union), без ложного «всё чисто».
    return localErrors;
  }
  // BE есть ошибки — предпочитаем их; локальные error по другим оффсетам добавляем.
  if (localErrors.length === 0) {
    return [...backendDiagnostics];
  }
  const seen = new Set(
    backendDiagnostics.map((d) => `${d.start}|${d.end}|${d.message}`),
  );
  const extra = localErrors.filter(
    (d) => !seen.has(`${d.start}|${d.end}|${d.message}`),
  );
  return [...backendDiagnostics, ...extra];
}
