/**
 * MethodId / facade call → wire (S3776).
 */
import {
  lookupFacadeMethod,
  resolveFacadeName,
  resolveMethodIdLabel,
} from './methodIds';
import { splitPrettyArgTokens as splitPrettyArgs } from './prettyArgsSplit';
import { splitFirstToken } from './textScan';

type LooksLikeWire = (text: string) => boolean;

function wireFromParts(component: string, action: string, argsRest: string): string {
  const args = splitPrettyArgs(argsRest);
  return [component, action, ...args].join('|');
}

function resolveFacadeCall(name: string, rest: string): string | undefined {
  const facade = resolveFacadeName(name);
  if (!facade) {
    return undefined;
  }
  const trimmed = rest.trim();
  if (!trimmed) {
    return undefined;
  }
  const methodTok = splitFirstToken(trimmed);
  if (!methodTok.head) {
    return undefined;
  }
  const method = lookupFacadeMethod(facade, methodTok.head);
  if (!method) {
    return undefined;
  }
  return wireFromParts(method.component, method.action, methodTok.rest);
}

export function resolveMethodCall(
  text: string,
  reservedLanguageWords: Set<string>,
  looksLikeWire: LooksLikeWire,
): string | undefined {
  const raw = text.trim();
  if (!raw || looksLikeWire(raw)) {
    return undefined;
  }
  const { head: name, rest } = splitFirstToken(raw);
  if (!name || reservedLanguageWords.has(name)) {
    return undefined;
  }

  const facadeWire = resolveFacadeCall(name, rest);
  if (facadeWire !== undefined) {
    return facadeWire;
  }

  const entry = resolveMethodIdLabel(name);
  if (!entry) {
    return undefined;
  }
  return wireFromParts(entry.component, entry.action, rest);
}
