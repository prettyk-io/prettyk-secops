/**
 * Single-line PrettyK → wire core (S3776).
 */
type ResolveData = (text: string) => string | undefined;
type ResolveCall = (text: string) => string | undefined;

export function ensureWirePrimary(
  line: string,
  resolvePrettyDataLine: ResolveData,
  resolveCall: ResolveCall,
): string {
  let indentEnd = 0;
  while (indentEnd < line.length && (line[indentEnd] === ' ' || line[indentEnd] === '\t')) {
    indentEnd += 1;
  }
  const indent = line.slice(0, indentEnd);
  const raw = line.trim();
  if (!raw) {
    return line;
  }
  let failsafe = false;
  let primary = raw;
  if (primary.endsWith('>?')) {
    failsafe = true;
    primary = primary.slice(0, -2).trimEnd();
  }
  if (primary.includes('>@')) {
    return line;
  }

  const dataWire = resolvePrettyDataLine(primary);
  if (dataWire !== undefined) {
    return `${indent}${dataWire}`;
  }

  const wire = resolveCall(primary);
  if (wire === undefined) {
    return line;
  }
  const wired = failsafe ? `${wire} >?` : wire;
  return `${indent}${wired}`;
}
