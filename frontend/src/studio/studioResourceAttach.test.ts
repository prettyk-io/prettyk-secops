import { describe, expect, it } from 'vitest';
import {
  attachResourceRejectMessage,
  attachTxtRejectMessage,
  isAttachableResourceFileName,
  isHarResourceFileName,
  isTxtResourceFileName,
  uniqueResourceAsName,
} from './studioResourceAttach';

describe('studioResourceAttach', () => {
  it('unique as + txt/har filter + reject copy', () => {
    expect(isTxtResourceFileName('a.TXT')).toBe(true);
    expect(isHarResourceFileName('flow.HAR')).toBe(true);
    expect(isAttachableResourceFileName('x.har')).toBe(true);
    expect(isAttachableResourceFileName('pack.zip')).toBe(true);
    expect(isAttachableResourceFileName('svc.proto')).toBe(true);
    expect(isAttachableResourceFileName('a.json')).toBe(false);
    expect(isAttachableResourceFileName('openapi.json')).toBe(true);
    expect(isAttachableResourceFileName('schema.graphql')).toBe(true);
    const taken = new Set(['dict']);
    expect(uniqueResourceAsName('dict', taken)).toBe('dict_2');
    expect(attachTxtRejectMessage(0, 2)).toBeUndefined();
    expect(attachResourceRejectMessage(2, 2)).toContain('.har');
    expect(attachResourceRejectMessage(1, 2)).toContain('Пропущено');
  });
});
