/**
 * BOX-VAL-1: чистое определение «документ пуст» — нечего проверять/запускать.
 * Разделяется Validate и Run, чтобы обе команды говорили правду про текущий документ.
 */
export function isWireDocumentEmpty(formData: unknown): boolean {
  const root = (formData ?? null) as Record<string, unknown> | null;
  const suites = root?.test_suites as Record<string, unknown> | undefined;
  const scenarios = Array.isArray(suites?.scenarios) ? suites!.scenarios : [];
  const hasNonEmptyScenario = scenarios.some((sc) => {
    const scObj = sc as Record<string, unknown>;
    const steps = Array.isArray(scObj.steps) ? scObj.steps : [];
    return steps.some((st) => {
      const ctor = (st as Record<string, unknown>)['constructor'];
      return typeof ctor === 'string' && ctor.trim().length > 0;
    });
  });
  const pages = suites?.pages as Record<string, unknown> | undefined;
  const hasNonEmptyPage = pages
    ? Object.values(pages).some((p) => {
        const ctor = (p as Record<string, unknown>)['constructor'];
        return typeof ctor === 'string' && ctor.trim().length > 0;
      })
    : false;
  const fuzzers = Array.isArray(suites?.fuzzers) ? suites!.fuzzers : [];
  return !hasNonEmptyScenario && !hasNonEmptyPage && fuzzers.length === 0;
}