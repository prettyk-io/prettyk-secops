/** Ключи-заглушки RJSF (`newKey`) и наш пустой ключ при добавлении. */
export function isPlaceholderAdditionalKey(key: string): boolean {
  return key === '' || /^newKey\d*$/.test(key) || /^-\d+$/.test(key);
}
