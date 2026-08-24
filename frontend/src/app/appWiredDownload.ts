/**
 * Download authoring wired.json blob (S3776).
 */
import { clampFormDataForRoleCaps } from '../utils/applyRoleCaps';
import { exportWiredJson } from '../utils/exportWired';
import { capsForUser, readSession } from '../shell/auth';

export function downloadWiredJson(formData: unknown): void {
  const sealed = clampFormDataForRoleCaps(formData, capsForUser(readSession()));
  const json = exportWiredJson(sealed, 'authoring');
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'wired.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
