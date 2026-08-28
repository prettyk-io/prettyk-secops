/**
 * CRAWL-7: Fuzzer handoff.
 *
 * Фильтрует подтверждённые RequestTemplate по provenance
 * и передаёт в CorpusFuzzer.generate_mutations().
 *
 * Три категории provenance:
 *   1. observed — endpoint зафиксирован после реального действия → передаётся
 *   2. synthetic_candidate — создан через fallback → НЕ передаётся, ждёт approve
 *   3. operator_approved — synthetic с явным одобрением оператора → передаётся
 */

export type TemplateProvenance = 'observed' | 'synthetic_candidate' | 'operator_approved';

export interface RequestTemplate {
  templateId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Поля для фаззинга (key: value-class). */
  params: Record<string, string>;
  provenance: TemplateProvenance;
  /** Описание endpoint'а (из network capture или пробуждения). */
  endpointDescription: string;
  /** Когда шаблон создан. */
  createdAt: number;
  /** Кем одобрен (если operator_approved). */
  approvedBy?: string;
  /** Когда одобрен. */
  approvedAt?: number;
}

export type FuzzerMode = 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb';

export interface FuzzerHandoffConfig {
  /** Режим фаззинга для всех шаблонов. */
  mode: FuzzerMode;
  /** Количество мутаций на шаблон. */
  mutationsPerTemplate: number;
  /** Автоматически запускать фаззинг после handoff? (false — только отдать список) */
  autoStart: boolean;
}

export interface FuzzerHandoffResult {
  /** Шаблоны, переданные в фаззер. */
  accepted: RequestTemplate[];
  /** Шаблоны, отфильтрованные (synthetic без approve). */
  filtered: RequestTemplate[];
  /** Сводка. */
  summary: { total: number; accepted: number; filtered: number; rejectedReason: string[] };
}

// ── Фильтр ──

/**
 * Отфильтровать шаблоны для handoff.
 *
 * observed → передаётся всегда.
 * operator_approved → передаётся.
 * synthetic_candidate → НЕ передаётся.
 */
export function filterTemplatesForHandoff(
  templates: RequestTemplate[],
): { accepted: RequestTemplate[]; filtered: RequestTemplate[] } {
  const accepted: RequestTemplate[] = [];
  const filtered: RequestTemplate[] = [];

  for (const t of templates) {
    if (t.provenance === 'observed' || t.provenance === 'operator_approved') {
      accepted.push(t);
    } else {
      filtered.push(t);
    }
  }

  return { accepted, filtered };
}

/**
 * Одобрить synthetic_candidate → operator_approved.
 */
export function approveTemplate(
  template: RequestTemplate,
  approvedBy: string = 'operator',
): RequestTemplate {
  if (template.provenance !== 'synthetic_candidate') return template;
  return {
    ...template,
    provenance: 'operator_approved',
    approvedBy,
    approvedAt: Date.now(),
  };
}

/**
 * Handoff: фильтр + build summary.
 *
 * CorpusFuzzer.generate_mutations(template, count, mode) вызывается
 * Боссом (Python) для каждого принятого шаблона.
 * Здесь — только типизированная сборка.
 */
export function buildHandoff(
  templates: RequestTemplate[],
  config: FuzzerHandoffConfig,
): FuzzerHandoffResult {
  const { accepted, filtered } = filterTemplatesForHandoff(templates);

  const rejectedReasons = filtered.map((t) =>
    `synthetic_candidate: ${t.templateId} (${t.endpointDescription})`,
  );

  return {
    accepted,
    filtered,
    summary: {
      total: templates.length,
      accepted: accepted.length,
      filtered: filtered.length,
      rejectedReason: rejectedReasons,
    },
  };
}

/**
 * Проверить: готов ли шаблон к handoff.
 */
export function isHandoffReady(template: RequestTemplate): boolean {
  return template.provenance === 'observed' || template.provenance === 'operator_approved';
}