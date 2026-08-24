/**
 * collectConstructorFields walk (S3776).
 */

export type CollectedConstructorRow = {
  id: string;
  path: string;
  text: string;
};

type ValidateText = (text: string) => string;

function collectFromObjectEntry(
  key: string,
  value: unknown,
  childPath: string,
  validationText: ValidateText,
): CollectedConstructorRow[] {
  if (key === 'test_data_constructor') {
    return [];
  }
  if (key === 'constructor' && typeof value === 'string') {
    const text = validationText(value);
    if (text.length > 0) {
      return [{ id: childPath, path: childPath, text }];
    }
    return [];
  }
  return collectConstructorsFromValue(value, childPath, validationText);
}

export function collectConstructorsFromValue(
  data: unknown,
  path: string,
  validationText: ValidateText,
): CollectedConstructorRow[] {
  if (Array.isArray(data)) {
    return data.flatMap((item, index) =>
      collectConstructorsFromValue(item, `${path}/${String(index)}`, validationText),
    );
  }
  if (data === null || typeof data !== 'object') {
    return [];
  }
  const out: CollectedConstructorRow[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const childPath = path === '' ? `/${key}` : `${path}/${key}`;
    out.push(...collectFromObjectEntry(key, value, childPath, validationText));
  }
  return out;
}
