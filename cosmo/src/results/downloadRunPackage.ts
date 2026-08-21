/**
 * RES-7: скачать zip-пакет прогона с Live оболочки.
 * GET http://127.0.0.1:8767/api/package/latest
 */

import { LIVE_PACKAGE_URL } from '../api/apiBase';

export type DownloadRunPackageResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

function filenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1].trim();
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

export async function downloadRunPackage(runId?: string): Promise<DownloadRunPackageResult> {
  const url = runId?.trim()
    ? `${LIVE_PACKAGE_URL}?run_id=${encodeURIComponent(runId.trim())}`
    : LIVE_PACKAGE_URL;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) {
          detail = j.error;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: `Пакет недоступен: ${detail}` };
    }
    const blob = await res.blob();
    if (!blob.size) {
      return { ok: false, error: 'Пакет пустой' };
    }
    const filename =
      filenameFromDisposition(res.headers.get('Content-Disposition')) ||
      'pk-run-package.zip';
    const objectUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    return { ok: true, filename };
  } catch {
    return {
      ok: false,
      error: 'Live оболочка недоступна (ожидается http://127.0.0.1:8767/)',
    };
  }
}
