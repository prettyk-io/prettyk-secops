/**
 * Language-script vs wire detection (S3776).
 */
import { allMethodIdLabels } from './methodIds';
import { parseScenarioFailsafePrefix } from './scenarioFailsafe';
import { looksLikeLanguageBlock } from './textScan';

/** page.action — login.Войти (не wire). */
export function looksLikePageCallLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('|')) {
    return false;
  }
  let i = 0;
  if (!/[A-Za-z_]/.test(trimmed[0]!)) {
    return false;
  }
  i = 1;
  while (i < trimmed.length && /[A-Za-z0-9_]/.test(trimmed[i]!)) {
    i += 1;
  }
  if (trimmed[i] !== '.') {
    return false;
  }
  return i + 1 < trimmed.length && trimmed[i + 1] !== ' ' && trimmed[i + 1] !== '\t';
}

const METHOD_ID_HEADS = new Set(allMethodIdLabels());

export function looksLikeMethodIdLine(line: string): boolean {
  const head = line.trim().split(/\s+/, 1)[0] ?? '';
  if (!head || head.includes('|')) {
    return false;
  }
  return METHOD_ID_HEADS.has(head);
}

export function detectLanguageScript(text: string): boolean {
  // Scenario failsafe `<!>` на 1-й строке — не MethodId; детектим по телу.
  let src = text;
  try {
    const parsed = parseScenarioFailsafePrefix(text);
    if (parsed.allowed) {
      src = parsed.body;
    }
  } catch {
    /* junk after <!> — diagnostics */
  }
  if (looksLikeLanguageBlock(src)) {
    return true;
  }
  const lines = src
    .split(/\n/)
    .map((ln) => ln.trim())
    .filter((ln) => ln.length > 0 && !ln.startsWith('#'));
  for (const ln of lines) {
    const head = ln.split(/\s+/, 1)[0] ?? '';
    if (!head.includes('|') && looksLikePageCallLine(ln)) {
      return true;
    }
    if (looksLikeMethodIdLine(ln)) {
      return true;
    }
  }
  return false;
}
