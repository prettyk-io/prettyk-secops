/**
 * flattenConstructorsInData object walk (S3776).
 */

type Flatten = (data: unknown) => unknown;
type PrettyWire = (text: string) => string;
type FlatText = (text: string) => string;

export function flattenConstructorsInObject(
  data: Record<string, unknown>,
  flatten: Flatten,
  prettyTextToWire: PrettyWire,
  flattenConstructorText: FlatText,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'test_data_constructor') {
      out[key] = value;
      continue;
    }
    if (key === 'constructor' && typeof value === 'string') {
      out[key] = prettyTextToWire(flattenConstructorText(value));
      continue;
    }
    out[key] = flatten(value);
  }
  return out;
}
