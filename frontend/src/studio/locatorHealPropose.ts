/**
 * HEAL-D: предложить замену локатора в PrettyK canvas (оператор утверждает).
 * SoT / wired не трогаем — только текст конструктора.
 */

export type LocatorHealProposal = {
  status: string;
  old_type?: string;
  old_value?: string;
  new_type?: string;
  new_value?: string;
  score?: number;
  reason?: string;
};

export function parseLocatorHealLast(raw: unknown): LocatorHealProposal | null {
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
    old_type: typeof row.old_type === 'string' ? row.old_type : undefined,
    old_value: typeof row.old_value === 'string' ? row.old_value : undefined,
    new_type: typeof row.new_type === 'string' ? row.new_type : undefined,
    new_value: typeof row.new_value === 'string' ? row.new_value : undefined,
    score: typeof row.score === 'number' ? row.score : undefined,
    reason: typeof row.reason === 'string' ? row.reason : undefined,
  };
}

/** Подставить new locator в строки canvas, где встречается old. */
export function applyLocatorHealToConstructor(
  constructorText: string,
  proposal: LocatorHealProposal,
): { text: string; replaced: number } {
  const oldVal = (proposal.old_value || '').trim();
  const newVal = (proposal.new_value || '').trim();
  const oldType = (proposal.old_type || '').trim();
  const newType = (proposal.new_type || '').trim();
  if (!oldVal || !newVal || proposal.status !== 'ok') {
    return { text: constructorText, replaced: 0 };
  }
  const lines = constructorText.split('\n');
  let replaced = 0;
  const next = lines.map((line) => {
    if (!line.includes(oldVal)) {
      return line;
    }
    let out = line;
    if (oldType && newType && out.includes(oldType)) {
      // «id old» → «id new» / «css old» → «css new» в пределах строки
      const typed = `${oldType} ${oldVal}`;
      const typedNew = `${newType} ${newVal}`;
      if (out.includes(typed)) {
        out = out.split(typed).join(typedNew);
        replaced += 1;
        return out;
      }
    }
    out = out.split(oldVal).join(newVal);
    replaced += 1;
    return out;
  });
  return { text: next.join('\n'), replaced };
}

export function healProposalSummary(p: LocatorHealProposal): string {
  if (p.status === 'ok' && p.old_value && p.new_value) {
    const sc = typeof p.score === 'number' ? ` (${p.score.toFixed(2)})` : '';
    return `${p.old_type || '?'} ${p.old_value} → ${p.new_type || '?'} ${p.new_value}${sc}`;
  }
  if (p.status === 'miss') {
    return `MISS ${p.old_type || '?'} ${p.old_value || '?'} · ${p.reason || 'нет кандидата'}`;
  }
  return p.status;
}
