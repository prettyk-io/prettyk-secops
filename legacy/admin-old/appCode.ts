/**
 * Единый язык Admin: код приложения = BankDeploy.project_id = meta.project_id.
 */

export const APP_CODE_LABEL = 'Код приложения';

/** Короткий technical hint рядом с UI (не заголовок колонки). */
export const APP_CODE_FIELD = 'project_id';

export function formatAppCodeOption(
  projectId: string,
  applicationName?: string,
): { value: string; label: string } {
  const id = projectId.trim();
  const name = (applicationName || '').trim();
  return {
    value: id,
    label: name ? `${name} (${id})` : id,
  };
}
