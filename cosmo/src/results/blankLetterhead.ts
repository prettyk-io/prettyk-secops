/**
 * Letterhead только для HTML-бланков (ТЗ / акт). В UI Editor — не подключать.
 * Lab: labBlankProfile / labLetterheadData.
 */

import { letterheadLogoDataUri } from './labLetterheadData';
import { ORG_SUBTITLE, ORG_TITLE } from './labBlankProfile';
import type { BlankOrg } from './types';

export { letterheadLogoDataUri, ORG_SUBTITLE, ORG_TITLE };

export function defaultBlankOrg(overrides?: Partial<BlankOrg>): BlankOrg {
  return {
    title: ORG_TITLE,
    subtitle: ORG_SUBTITLE,
    logo_ref: letterheadLogoDataUri,
    ...overrides,
  };
}

/** Короткий стабильный отпечаток JSON для подвала бланка (FNV-1a 32-bit). */
export function manifestContentHash(payload: unknown): string {
  const text = JSON.stringify(payload);
  let hash = 2166136261;
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
