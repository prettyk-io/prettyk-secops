/**
 * Markdown-тела бланков (ТЗ и Акт). HTML собирается: MD → HTML + каркас.
 */

import { ACT_RETENTION_NOTE, COMPLIANCE_FINREG_LABEL } from './labBlankProfile';
import type { BlankFinding, BlankViewModel } from './blankFields';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bullet(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n');
}

function scopeBlock(vm: BlankViewModel): string {
  if (vm.scope_outline.length === 0) {
    return '_Состав работ в задании не указан._';
  }
  const lines = vm.scope_outline.slice(0, 80).map((s) => `- ${s}`);
  if (vm.scope_outline.length > 80) {
    lines.push(
      `- _… и ещё ${String(vm.scope_outline.length - 80)} позиций (полный состав — в комплекте задания)._`,
    );
  }
  return lines.join('\n');
}

function findingsMd(findings: BlankFinding[]): string {
  if (findings.length === 0) {
    return [
      '_Детализированный перечень формируется после разбора результатов сканирования._',
      '',
      'До завершения верификации сведения о выявленных недостатках фиксируются в приложениях к акту (протокол испытаний, учёт уязвимостей).',
    ].join('\n');
  }
  return findings
    .map((f) =>
      [
        `##### ${f.vuln_id} — ${f.vuln_name}`,
        '',
        `- **Классификация (CWE):** CWE-${f.cwe_id}`,
        `- **Оценка CVSS v3.1:** ${f.cvss_score} (вектор: \`${f.cvss_vector}\`)`,
        `- **Влияние на процессы:** ${f.business_impact}`,
        `- **Описание:** ${f.vuln_description}`,
        `- **Подтверждение:** ${f.poc}`,
        `- **Рекомендации по устранению:** ${f.remediation}`,
        '',
        '---',
        '',
      ].join('\n'),
    )
    .join('\n');
}

function objectSection(vm: BlankViewModel): string {
  return [
    `- **Наименование ИС (ПО):** ${vm.system_name}`,
    `- **Версия / релиз:** ${vm.system_version}`,
    `- **Критичность объекта (ГОСТ Р 57580.1):** ${vm.criticality_level} (уровень: ${vm.criticality_value})`,
    `- **Цели для проверки безопасности:** ${vm.primary_targets}`,
    `- **Дополнительно запрошенные границы для проверки:** ${vm.extra_boundaries}`,
    `- **Сведения о контуре для тестирования:** ${vm.testing_contour}`,
    `- **Ответственный за приложение:** ${vm.owner_department}`,
    `- **Инициатор проверки:** ${vm.initiator_name}`,
    `- **Назначение проверки:** ${vm.assessment_purpose}`,
  ].join('\n');
}

function metaLines(vm: BlankViewModel): string {
  return [
    `**Дата составления:** ${vm.date_created}`,
    `**Место составления:** ${vm.place}`,
    `**Степень конфиденциальности:** ${vm.confidentiality}`,
    `**Идентификатор задания:** \`${vm.manifest_hash}\``,
  ].join('  \n');
}

/**
 * Подпись по типовой схеме ОРД (ГОСТ Р 7.0.97):
 * слева — должность, по центру — линия личной подписи, справа — расшифровка;
 * под каждым элементом — пояснение мелким кеглем.
 * Между блоками подписантов — интервал ≈ одной строки; от текста сверху — запас.
 */
function signRow(role: string, name: string): string {
  return [
    '<div class="sign-row">',
    `  <div class="sign-col sign-role"><div class="sign-value">${escapeHtml(role)}</div><div class="sign-cap">(должность)</div></div>`,
    '  <div class="sign-col sign-mark"><div class="sign-value">&nbsp;</div><div class="sign-cap">(подпись)</div></div>',
    `  <div class="sign-col sign-name"><div class="sign-value">${escapeHtml(name)}</div><div class="sign-cap">(инициалы, фамилия)</div></div>`,
    '</div>',
  ].join('\n');
}

function signatures(vm: BlankViewModel): string {
  return [
    '<div class="sign-block">',
    '<p class="sign-lead">Проверку провёл</p>',
    signRow(vm.tester_position, vm.tester_name),
    '<p class="sign-lead sign-lead-next">Согласовано</p>',
    signRow(
      'Начальник Управления анализа уязвимостей и тестирования на проникновение',
      vm.manager_name,
    ),
    '</div>',
  ].join('\n');
}

function normsList(vm: BlankViewModel): string {
  return bullet([
    vm.compliance_finreg,
    vm.compliance_gost,
    vm.compliance_fstec,
  ]);
}

/** Markdown технического задания (вкладка «Регламент»). */
export function renderRegulationMarkdown(vm: BlankViewModel): string {
  return [
    `# ТЕХНИЧЕСКОЕ ЗАДАНИЕ № ${vm.document_number}`,
    '',
    '## на проведение динамического тестирования безопасности',
    '',
    metaLines(vm),
    '',
    '---',
    '',
    '### 1. Основание и нормативные ссылки',
    '',
    'Настоящее техническое задание определяет границы, состав и порядок проведения работ по динамическому тестированию безопасности объекта информационной инфраструктуры **до начала выполнения работ**.',
    '',
    normsList(vm),
    '',
    '### 2. Объект и границы тестирования',
    '',
    objectSection(vm),
    '',
    '#### 2.1. Программа работ (состав)',
    '',
    scopeBlock(vm),
    '',
    '#### 2.2. Исключения из границ',
    '',
    vm.exclusions,
    '',
    '### 3. Параметры проведения работ',
    '',
    `- **Плановый период:** с ${vm.date_start} по ${vm.date_end} _(уточняется при начале работ)_`,
    '- **Вид работ:** динамическое тестирование безопасности с инструментальным сканированием',
    `- **Средства проведения работ:** ${vm.testing_tools}`,
    `- **Метод:** ${vm.testing_mode}`,
    `- **Учётная запись:** ${vm.test_credentials_role}`,
    `- **Политика сканирования:** ${vm.scan_policy}`,
    '',
    '> Сведения, составляющие секрет (пароли, Cookie, Bearer, токены), в документ **не включаются**. Указываются тип доступа либо отметка о наличии учётных данных.',
    '',
    '### 4. Ограничения, условия остановки, ожидаемые результаты',
    '',
    '#### 4.1. События немедленной остановки работ',
    '',
    bullet(vm.stop_conditions),
    '',
    '#### 4.2. Ожидаемые результаты и перепроверка',
    '',
    bullet(vm.expected_results),
    '',
    '### 5. Отчётность',
    '',
    `${ACT_RETENTION_NOTE} Форма акта — шаблон \`${vm.template_version}\`.`,
    '',
    '### 6. Согласование',
    '',
    signatures(vm),
    '',
  ].join('\n');
}

/** Markdown акта (вкладка «Результаты»). */
export function renderActMarkdown(vm: BlankViewModel): string {
  const evidence =
    vm.evidence_links.length > 0
      ? vm.evidence_links.map((l) => `- **${l.label}:** <${l.href}>`).join('\n')
      : '_Ссылки на приложения будут внесены по завершении работ._';

  return [
    `# АКТ № ${vm.document_number}`,
    '',
    '## о проведении динамического тестирования безопасности',
    '',
    metaLines(vm),
    '',
    '---',
    '',
    '### 1. Общие сведения об объекте тестирования',
    '',
    objectSection(vm),
    '',
    `Ссылка на техническое задание (идентификатор): \`${vm.manifest_hash}\``,
    '',
    '### 2. Параметры проведения тестирования',
    '',
    `- **Период проведения:** с ${vm.date_start} по ${vm.date_end}`,
    `- **Идентификатор сеанса проверки:** \`${vm.run_id}\``,
    `- **Состояние выполнения работ:** ${vm.run_status}; ${vm.gate_label}`,
    '- **Вид работ:** динамическое тестирование безопасности с инструментальным сканированием',
    `- **Средства проведения работ:** ${vm.testing_tools}`,
    `- **Метод:** ${vm.testing_mode}`,
    `- **Учётная запись:** ${vm.test_credentials_role}`,
    '',
    '> Сведения, составляющие секрет, в акт **не включаются**.',
    '',
    '### 3. Результаты сканирования и анализа безопасности',
    '',
    `По результатам автоматизированного динамического тестирования и последующей верификации уязвимостей общая оценка защищённости веб-интерфейса объекта признана: **${vm.overall_security_rating}**.`,
    '',
    '#### Заключение и допуск',
    '',
    ...[
      `- **${vm.execution_axis}**`,
      `- **${vm.admission_axis}**`,
      `- **Источник счётчиков (counts_source):** ${vm.counts_source_label}`,
      `- **Фильтр inventory (audit):** ${vm.filter_audit_line}`,
      vm.allure_summary_line && vm.allure_summary_line !== '—'
        ? `- **${vm.allure_summary_line}**`
        : '',
      '',
      vm.scenario_outcome_lines.length > 0
        ? ['**Сценарии (этап-1):**', '', bullet(vm.scenario_outcome_lines)].join('\n')
        : '',
      '',
      vm.admission_recommendations.length > 0
        ? ['**Рекомендации по допуску:**', '', bullet(vm.admission_recommendations)].join('\n')
        : '_Рекомендации по допуску не сформированы._',
    ].filter((line) => line !== undefined),
    '',
    '#### Сводная таблица обнаруженных уязвимостей (ACTIVE / сводка DefectDojo)',
    '',
    '| Уровень риска | Количество | Статус |',
    '| :--- | :---: | :--- |',
    `| Критический | ${vm.count_critical} | ${vm.status_critical} |`,
    `| Высокий | ${vm.count_high} | ${vm.status_high} |`,
    `| Средний | ${vm.count_medium} | ${vm.status_medium} |`,
    `| Низкий | ${vm.count_low} | ${vm.status_low} |`,
    '',
    '### 4. Детализированный перечень выявленных уязвимостей',
    '',
    findingsMd(vm.findings),
    '',
    '### 5. Соответствие требованиям нормативных актов',
    '',
    `- **${COMPLIANCE_FINREG_LABEL}:** ${vm.compliance_finreg}`,
    `- **Национальные стандарты и профиль защиты:** ${vm.compliance_gost}`,
    `- **Требования ФСТЭК России и иные НПА (по применимости):** ${vm.compliance_fstec}`,
    `- **Необходимость перепроверки:** ${vm.recheck_required_mark} требуется / ${vm.recheck_not_required_mark} не требуется`,
    `- **Плановый срок устранения критических уязвимостей:** ${vm.deadline_date}`,
    '',
    '### 6. Подписи и ответственные лица',
    '',
    signatures(vm),
    '',
    '### 7. Приложение. Доказательства и состав',
    '',
    '#### 7.1. Ссылки на приложения',
    '',
    evidence,
    '',
    '#### 7.2. Состав (кратко)',
    '',
    scopeBlock(vm),
    '',
  ].join('\n');
}

export function renderBlankMarkdown(vm: BlankViewModel): string {
  return vm.kind === 'act' ? renderActMarkdown(vm) : renderRegulationMarkdown(vm);
}
