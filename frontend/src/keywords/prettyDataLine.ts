/**
 * resolvePrettyDataLine core/call branches (S3776).
 */
import { splitPrettyArgTokens as splitPrettyArgs } from './prettyArgsSplit';
import { splitFirstToken } from './textScan';

type CoreRhs = { action: string; min: number; max: number };

export function wireFromCoreRhs(
  value: string,
  path: string,
  coreRhs: Record<string, CoreRhs>,
  withSaveAs: (wire: string, path: string) => string,
): string | undefined | 'miss' {
  const head = splitFirstToken(value);
  if (!head.head) {
    return 'miss';
  }
  const core = coreRhs[head.head.toLowerCase()];
  if (!core) {
    return 'miss';
  }
  const args = splitPrettyArgs(head.rest);
  if (args.length >= core.min && args.length <= core.max) {
    return withSaveAs(['core', core.action, ...args].join('|'), path);
  }
  return undefined;
}

export function wireFromCallRhs(
  value: string,
  path: string,
  resolveCall: (text: string) => string | undefined,
  withSaveAs: (wire: string, path: string) => string,
): string | undefined {
  if (value.startsWith('"') || value.startsWith("'") || value.startsWith('$')) {
    return undefined;
  }
  const call = resolveCall(value);
  if (!call) {
    return undefined;
  }
  return withSaveAs(call, path);
}
