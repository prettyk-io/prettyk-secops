/**
 * wiredIO — утилита скачивания манифеста из App.tsx (dev-роутер).
 */

import type { WiredData } from './types';
import { redactWiredSecrets } from '../form/redactSecrets';

export function downloadWired(data: WiredData, filename = 'wired.json'): void {
  const safe = redactWiredSecrets(data);
  const json = JSON.stringify(safe, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
