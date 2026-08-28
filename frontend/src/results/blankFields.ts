/**
 * Поля бланков ТЗ/Акта. Канцелярский русский, без жаргона стенда.
 * Отраслевые строки — только из labBlankProfile (отраслевой pack — spaceport).
 */

import {
  COMPLIANCE_FINREG,
  COMPLIANCE_FSTEC,
  COMPLIANCE_GOST,
  TESTING_CONTOUR_STATEMENT,
} from './labBlankProfile';
import { countsSourceLabel, dualAxisChrome } from './dualAxisChrome';
import type { PipelineVerdict } from './pipelineVerdict';
import type { BlankPayload, ExplorerNode, RunRecord, RunSummary } from './types';

const DASH = '—';

export { TESTING_CONTOUR_STATEMENT };

export type BlankViewModel = {
  kind: BlankPayload['kind'];
  document_number: string;
  date_created: string;
  place: string;
  confidentiality: string;
  system_name: string;
  system_version: string;
  criticality_level: string;
  criticality_value: string;
  /** Основные URL (цели проверки). */
  primary_targets: string;
  /** Дополнительно запрошенные границы. */
  extra_boundaries: string;
  testing_contour: string;
  owner_department: string;
  initiator_name: string;
  assessment_purpose: string;
  date_start: string;
  date_end: string;
  testing_tools: string;
  testing_mode: string;
  test_credentials_role: string;
  scan_policy: string;
  overall_security_rating: string;
  count_critical: string;
  count_high: string;
  count_medium: string;
  count_low: string;
  status_critical: string;
  status_high: string;
  status_medium: string;
  status_low: string;
  findings: BlankFinding[];
  compliance_finreg: string;
  compliance_gost: string;
  compliance_fstec: string;
  recheck_required_mark: string;
  recheck_not_required_mark: string;
  deadline_date: string;
  run_id: string;
  run_status: string;
  gate_label: string;
  execution_axis: string;
  admission_axis: string;
  counts_source_label: string;
  filter_audit_line: string;
  admission_recommendations: string[];
  allure_summary_line: string;
  /** Исходы сценариев этапа-1 (в т.ч. разведочные <!>). */
  scenario_outcome_lines: string[];
  evidence_links: { label: string; href: string }[];
  scope_outline: string[];
  exclusions: string;
  stop_conditions: string[];
  expected_results: string[];
  wired_hash: string;
  generated_at: string;
  template_version: string;
  logo_ref: string;
  tester_position: string;
  tester_name: string;
  manager_name: string;
};

export type BlankFinding = {
  vuln_id: string;
  vuln_name: string;
  cwe_id: string;
  cvss_score: string;
  cvss_vector: string;
  business_impact: string;
  vuln_description: string;
  poc: string;
  remediation: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, fallback = DASH): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function formatRuDate(iso: string | undefined): string {
  if (!iso) {
    return DASH;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 10);
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

function assessmentPurposeLabel(raw: string): string {
  switch (raw) {
    case 'scheduled':
      return 'Плановая проверка';
    case 'pre_release':
      return 'Контроль релиза приложения';
    case 'emergency':
      return 'Внештатная проверка';
    case 'manual':
      return 'Проверка с участием специалиста с применением средств динамического анализа';
    default:
      return raw || DASH;
  }
}

function scannerModeLabel(raw: string): string {
  if (raw === 'webswing') {
    return 'Комплекс средств динамического анализа (PrettyK) с применением OWASP scanner (интерактивный режим)';
  }
  if (raw === 'demon') {
    return 'Комплекс средств динамического анализа (PrettyK) с применением OWASP scanner (режим сканирования)';
  }
  return 'Комплекс средств динамического анализа (PrettyK) с применением OWASP scanner';
}

function scanPolicyLabel(raw: string): string {
  switch (raw) {
    case 'custom_policy':
      return 'Пользовательская политика сканирования';
    case 'scanner_fuzzing':
      return 'Сканирование и фаззинг';
    case 'openapi_schema':
      return 'Сканирование по описанию OpenAPI';
    case 'api_scanner':
      return 'Сканирование программных интерфейсов (API)';
    case 'scanner_crawler':
      return 'Сканирование с обходом структуры приложения';
    default:
      return raw || DASH;
  }
}

function runStatusLabel(raw: string): string {
  switch (raw) {
    case 'idle':
      return 'работы не начаты';
    case 'running':
      return 'работы выполняются';
    case 'success':
      return 'работы завершены';
    case 'failed':
      return 'работы завершены с ошибкой';
    case 'unknown':
      return 'состояние не определено';
    default:
      return raw || DASH;
  }
}

/** Метод: «чёрный» / «серый» ящик. */
export function testingModeFromAuth(authType: string): string {
  const t = authType.trim().toLowerCase();
  if (!t || t === 'без авторизации') {
    return 'методом «чёрного ящика» (исполнитель не располагает учётными данными объекта)';
  }
  return 'методом «серого ящика» (исполнителю предоставлен ограниченный доступ)';
}

function flattenScope(nodes: ExplorerNode[]): string[] {
  const out: string[] = [];
  const walk = (list: ExplorerNode[], prefix: string) => {
    for (const node of list) {
      const leaf =
        node.kind === 'page' ||
        node.kind === 'scenario' ||
        node.kind === 'module' ||
        node.kind === 'fuzzer' ||
        node.kind === 'resource';
      if (leaf) {
        out.push(`${prefix}${node.title}`);
      }
      if (node.children?.length) {
        const nextPrefix =
          node.kind === 'pages' ||
          node.kind === 'scenarios' ||
          node.kind === 'modules' ||
          node.kind === 'fuzzers' ||
          node.kind === 'resources'
            ? `${node.title}: `
            : prefix;
        walk(node.children, nextPrefix);
      }
    }
  };
  walk(nodes, '');
  return out;
}

function riskCount(
  risks: RunSummary['risks'] | undefined,
  key: 'critical' | 'high' | 'medium' | 'low' | 'info',
): string {
  if (!risks || typeof risks[key] !== 'number') {
    return DASH;
  }
  return String(risks[key]);
}

function filterAuditLine(raw: unknown): string {
  const audit = asRecord(raw);
  if (!audit) {
    return DASH;
  }
  const keys = [
    'raw',
    'kept',
    'dropped_fp',
    'dropped_dup',
    'dropped_mitigated',
    'dropped_waiver',
    'pages',
  ] as const;
  const parts: string[] = [];
  for (const key of keys) {
    const n = audit[key];
    if (typeof n === 'number' && Number.isFinite(n)) {
      parts.push(`${key}=${n}`);
    }
  }
  return parts.length ? parts.join(', ') : DASH;
}

function axesFromRun(run: RunRecord | undefined): {
  execution: string;
  admission: string;
  countsSource: string;
} {
  const gateSum = asRecord(run?.gate?.summary);
  const verdictRaw = typeof gateSum?.ci_verdict === 'string' ? gateSum.ci_verdict : '';
  const verdict = (verdictRaw || 'idle') as PipelineVerdict;
  const exit =
    typeof gateSum?.ci_exit_code === 'number' ? gateSum.ci_exit_code : null;
  const gate = typeof gateSum?.ci_gate === 'string' ? gateSum.ci_gate : null;
  const chrome = dualAxisChrome({
    verdict,
    exitCode: exit,
    gate,
    countsSource: gateSum?.counts_source,
    admissionVoid: gateSum?.admission_void === true,
    executionFaultKind:
      typeof gateSum?.execution_fault_kind === 'string'
        ? gateSum.execution_fault_kind
        : null,
    debugMode: gateSum?.debug_mode === true,
  });
  return {
    execution: chrome.execution,
    admission: chrome.admission,
    countsSource: chrome.countsSource || countsSourceLabel(gateSum?.counts_source) || DASH,
  };
}

export function scenarioOutcomeRu(status: string): string {
  switch (status) {
    case 'ok':
      return 'выполнен';
    case 'failed':
      return 'отказ';
    case 'fail_allowed':
      return 'разведочная проверка (допустимый отказ)';
    case 'skip':
      return 'не запускался';
    default:
      return status || DASH;
  }
}

function scenarioOutcomeLines(summary: RunSummary | undefined): string[] {
  const items = summary?.scenarios;
  if (!items?.length) {
    return [];
  }
  return items.map((s) => `${s.name}: ${scenarioOutcomeRu(s.status)}`);
}

function findingsFromSummary(summary: RunSummary | undefined): BlankFinding[] {
  const top = summary?.top_findings;
  if (!top?.length) {
    return [];
  }
  return top.map((item, index) => ({
    vuln_id: `У-${String(index + 1).padStart(3, '0')}`,
    vuln_name: item.name || DASH,
    cwe_id: DASH,
    cvss_score: DASH,
    cvss_vector: DASH,
    business_impact: DASH,
    vuln_description: `Уровень по сводке сканирования: ${item.risk}; число упоминаний: ${String(item.count)}.`,
    poc: 'Подробности и материалы подтверждения — в приложениях к акту. Значения секретов не включаются.',
    remediation: DASH,
  }));
}

function executiveLabel(
  summary: RunSummary | undefined,
  gateSum: Record<string, unknown> | undefined,
): string {
  const verdict =
    typeof gateSum?.ci_verdict === 'string' ? gateSum.ci_verdict.trim().toLowerCase() : '';
  const exit = typeof gateSum?.ci_exit_code === 'number' ? gateSum.ci_exit_code : null;
  const gate = typeof gateSum?.ci_gate === 'string' ? gateSum.ci_gate.trim().toLowerCase() : '';
  const admissionVoid =
    gateSum?.admission_void === true ||
    gateSum?.execution_fault === true ||
    verdict === 'fail_run' ||
    exit === 1 ||
    gate === 'void' ||
    gate === 'error';
  if (gateSum?.debug_mode === true) {
    return 'не сформирована (режим отладки; допуск недействителен)';
  }
  // Сбой исполнения → допуск VOID: не продаём ACTIVE-класс как итог допуска прогона.
  if (admissionVoid) {
    return 'не сформирована (сбой исполнения; допуск недействителен)';
  }
  switch (summary?.executive_class) {
    case 'Critical':
      return 'неудовлетворительная (критический уровень риска)';
    case 'High':
      return 'неудовлетворительная (высокий уровень риска)';
    case 'Watch':
      return 'условно удовлетворительная (требует внимания)';
    case 'Pass':
      return 'удовлетворительная';
    default:
      return 'подлежит формированию по итогам верификации результатов сканирования';
  }
}

function gateLabelFromRun(run: RunRecord | undefined): string {
  if (!run?.gate) {
    return DASH;
  }
  if (run.gate.failed) {
    return 'критерии допуска не выполнены';
  }
  return 'критерии допуска выполнены либо не применялись';
}

function evidenceLinksFromRun(run: RunRecord | undefined): { label: string; href: string }[] {
  const evidence: { label: string; href: string }[] = [];
  if (!run?.links) {
    return evidence;
  }
  const map: [string, string | undefined][] = [
    ['Журнал хода проверки', run.links.live ?? run.links.monitor],
    ['Протокол испытаний (Allure)', run.links.allure],
    ['Учёт уязвимостей (DefectDojo)', run.links.dojo],
  ];
  for (const [label, href] of map) {
    if (href) {
      evidence.push({ label, href });
    }
  }
  return evidence;
}

function needsRecheck(run: RunRecord | undefined): boolean {
  const cls = run?.summary?.executive_class;
  return Boolean(run?.gate?.failed || cls === 'Critical' || cls === 'High');
}

function riskStatusLabel(hasRisks: boolean): string {
  return hasRisks ? 'по сводке ACTIVE' : DASH;
}

function credentialsRole(authType: string, hasAuth: boolean): string {
  if (hasAuth) {
    return `Тип доступа: ${authType}. Значения учётных данных в документ не включаются.`;
  }
  return 'Учётная запись не применялась (проверка без авторизации).';
}

export function buildBlankViewModel(payload: BlankPayload): BlankViewModel {
  const root = asRecord(payload.form_snapshot) ?? {};
  const meta = asRecord(root.meta) ?? {};
  const infra = asRecord(root.infrastructure) ?? {};
  const sec = asRecord(root.security_configuration) ?? {};

  const authType = str(sec.auth_type, 'Без авторизации');
  const hasAuth = !authType.toLowerCase().includes('без авторизации');
  const run: RunRecord | undefined = payload.run;
  const summary = run?.summary;
  const hasRisks = Boolean(summary?.risks);
  const axes = axesFromRun(run);
  const gateSum = asRecord(run?.gate?.summary);
  const recheck = needsRecheck(run);
  const riskStatus = riskStatusLabel(hasRisks);

  return {
    kind: payload.kind,
    document_number: `DAST-${(payload.wired_hash ?? 'draft').toUpperCase()}`,
    date_created: formatRuDate(payload.generated_at),
    place: 'г. Москва',
    confidentiality: 'ДСП (для служебного пользования)',
    system_name: str(meta.project_id, str(meta.name, DASH)),
    system_version: DASH,
    criticality_level: 'подлежит указанию по ГОСТ Р 57580.1',
    criticality_value: DASH,
    primary_targets: str(sec.base_url_override),
    extra_boundaries: str(sec.allowed_extra_domains, 'не заявлены'),
    testing_contour: TESTING_CONTOUR_STATEMENT,
    owner_department: str(meta.app_leader),
    initiator_name: str(meta.initiator_name),
    assessment_purpose: assessmentPurposeLabel(str(meta.assessment_purpose, 'scheduled')),
    date_start: run?.started_at ? formatRuDate(run.started_at) : DASH,
    date_end: DASH,
    testing_tools: scannerModeLabel(str(infra.scanner_mode, 'demon')),
    testing_mode: testingModeFromAuth(authType),
    test_credentials_role: credentialsRole(authType, hasAuth),
    scan_policy: scanPolicyLabel(str(sec.scan_policy)),
    overall_security_rating: executiveLabel(summary, gateSum),
    count_critical: riskCount(summary?.risks, 'critical'),
    count_high: riskCount(summary?.risks, 'high'),
    count_medium: riskCount(summary?.risks, 'medium'),
    count_low: riskCount(summary?.risks, 'low'),
    status_critical: riskStatus,
    status_high: riskStatus,
    status_medium: riskStatus,
    status_low: riskStatus,
    findings: findingsFromSummary(summary),
    compliance_finreg: COMPLIANCE_FINREG,
    compliance_gost: COMPLIANCE_GOST,
    compliance_fstec: COMPLIANCE_FSTEC,
    recheck_required_mark: recheck ? '☑' : '☐',
    recheck_not_required_mark: recheck ? '☐' : '☑',
    deadline_date: DASH,
    run_id: str(run?.run_id),
    run_status: runStatusLabel(str(run?.status, '')),
    gate_label: gateLabelFromRun(run),
    execution_axis: axes.execution,
    admission_axis: axes.admission,
    counts_source_label: axes.countsSource,
    filter_audit_line: filterAuditLine(gateSum?.filter_audit),
    admission_recommendations: Array.isArray(summary?.recommendations)
      ? summary!.recommendations!.filter((x) => typeof x === 'string' && x.trim())
      : [],
    allure_summary_line: str(summary?.allure_summary_line, DASH),
    scenario_outcome_lines: scenarioOutcomeLines(summary),
    evidence_links: evidenceLinksFromRun(run),
    scope_outline: flattenScope(payload.explorer_tree),
    exclusions:
      'Объекты, входящие в общие границы, но исключённые из настоящей проверки, в задании не заявлены. При появлении исключений указать перечень и причины (ограничение окна работ, пропускная способность, распоряжение владельца объекта).',
    stop_conditions: [
      'деградация или недоступность объекта проверки либо смежных сервисов, создающая риск нарушения штатной деятельности;',
      'признаки инцидента информационной безопасности, требующие немедленного реагирования;',
      'письменное или зафиксированное иным установленным порядком распоряжение заказчика (владельца объекта) о приостановке работ.',
    ],
    expected_results: [
      'завершение динамического сканирования в установленных границах и верификация выявленных уязвимостей;',
      'оформление акта по результатам выполненных работ с рекомендациями по устранению недостатков;',
      'решение о необходимости перепроверки после устранения критических и высоких уязвимостей — по итогам акта.',
    ],
    wired_hash: str(payload.wired_hash),
    generated_at: payload.generated_at,
    template_version: payload.template_version,
    logo_ref: str(payload.org.logo_ref, ''),
    tester_position: 'Специалист по анализу уязвимостей',
    tester_name: DASH,
    manager_name: DASH,
  };
}
