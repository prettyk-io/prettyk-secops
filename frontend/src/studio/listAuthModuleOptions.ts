/**
 * Shared auth module select options for Studio forms (S3776).
 */
export function listAuthModuleOptions(
  formData: unknown,
): { value: string; label: string }[] {
  const suites = (formData as { test_suites?: { test_data_constructor?: unknown[] } })
    ?.test_suites;
  const mods = suites?.test_data_constructor;
  if (!Array.isArray(mods)) {
    return [];
  }
  return mods
    .map((m) => {
      if (!m || typeof m !== 'object') {
        return null;
      }
      const rec = m as { module_type?: string; id?: string; label?: string };
      if (rec.module_type !== 'Авторизация') {
        return null;
      }
      const id = String(rec.id || rec.label || '').trim();
      if (!id) {
        return null;
      }
      return { value: id, label: id };
    })
    .filter((x): x is { value: string; label: string } => Boolean(x));
}
