/**
 * DISC-2E: предложить затвердить label → locator в PrettyK (оператор жмёт).
 */

export type LocatorLabelProposal = {
  status: string;
  label?: string;
  new_type?: string;
  new_value?: string;
  score?: number;
  n?: number;
  reason?: string;
  retry?: boolean;
};

export function parseLocatorLabelLast(raw: unknown): LocatorLabelProposal | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const status = typeof row.status === 'string' ? row.status.trim() : '';
  if (!status) {
    return null;
  }
  return {
    status,
    label: typeof row.label === 'string' ? row.label : undefined,
    new_type: typeof row.new_type === 'string' ? row.new_type : undefined,
    new_value: typeof row.new_value === 'string' ? row.new_value : undefined,
    score: typeof row.score === 'number' ? row.score : undefined,
    n: typeof row.n === 'number' ? row.n : undefined,
    reason: typeof row.reason === 'string' ? row.reason : undefined,
    retry: typeof row.retry === 'boolean' ? row.retry : undefined,
  };
}

/** `Нажать > Войти` → `Нажать id login-btn` (label mode → typed locator). */
export function applyLocatorLabelToConstructor(
  constructorText: string,
  proposal: LocatorLabelProposal,
): { text: string; replaced: number } {
  const label = (proposal.label || '').trim();
  const newType = (proposal.new_type || '').trim();
  const newVal = (proposal.new_value || '').trim();
  if (!label || !newType || !newVal || proposal.status !== 'ok') {
    return { text: constructorText, replaced: 0 };
  }
  const needle = `> ${label}`;
  const lines = constructorText.split('\n');
  let replaced = 0;
  const next = lines.map((line) => {
    const idx = line.indexOf(needle);
    if (idx < 0) {
      return line;
    }
    // `ВставитьТекст > Email value` → keep trailing value after label
    const after = line.slice(idx + needle.length);
    const head = line.slice(0, idx).trimEnd();
    const typed = `${newType} ${newVal}`;
    replaced += 1;
    return `${head} ${typed}${after}`.replace(/\s+/g, ' ').trim();
  });
  return { text: next.join('\n'), replaced };
}

export function labelProposalSummary(p: LocatorLabelProposal): string {
  if (p.status === 'ok' && p.label && p.new_value) {
    const sc = typeof p.score === 'number' ? ` (${p.score.toFixed(2)})` : '';
    const amb = p.n && p.n > 1 ? ` · n=${p.n}` : '';
    return `«${p.label}» → ${p.new_type || '?'} ${p.new_value}${sc}${amb}`;
  }
  if (p.status === 'miss') {
    return `MISS «${p.label || '?'}» · ${p.reason || 'нет совпадений'}`;
  }
  if (p.status === 'ambiguous') {
    return `AMBIGUOUS «${p.label || '?'}» · n=${p.n ?? '?'}`;
  }
  if (p.status === 'disabled') {
    return `DISABLED «${p.label || '?'}»`;
  }
  return p.status;
}
