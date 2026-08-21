import type * as monacoNs from 'monaco-editor';

const OWNER = 'security-diagnostics';

export type SecuritySeverity = 'error' | 'warning' | 'info' | 'hint';

export interface SecurityRuleResult {
  lineNumber: number;
  severity: SecuritySeverity;
  message: string;
  category: string;
}

interface SecurityRule {
  id: string;
  category: string;
  severity: SecuritySeverity;
  check: (lines: string[], formData: unknown) => SecurityRuleResult[];
}

interface ManifestLike {
  meta?: { assessment_purpose?: string };
  infrastructure?: {
    base_url_override?: string;
    allowed_extra_domains?: string;
    zap_mode?: string;
    browser_type?: string;
  };
  auth_slots?: unknown[] | Record<string, unknown>;
  settings?: {
    passive_scan?: boolean;
    active_scan?: boolean;
    fuzz_enabled?: boolean;
    zap_mode?: string;
  };
  test_suites?: {
    scenarios?: unknown[];
    pages?: unknown[];
  };
  fuzzer?: unknown;
  data?: { resources?: unknown[] };
}

function toManifest(formData: unknown): ManifestLike | null {
  if (!formData || typeof formData !== 'object') return null;
  return formData as ManifestLike;
}

function hasAuth(m: ManifestLike): boolean {
  if (m.auth_slots) {
    if (Array.isArray(m.auth_slots) && m.auth_slots.length > 0) return true;
    if (typeof m.auth_slots === 'object' && Object.keys(m.auth_slots).length > 0) return true;
  }
  return false;
}

function hasPassiveScan(m: ManifestLike): boolean {
  if (m.settings?.passive_scan !== undefined) return m.settings.passive_scan;
  return true;
}

function hasActiveScan(m: ManifestLike): boolean {
  if (m.settings?.active_scan !== undefined) return m.settings.active_scan;
  return m.infrastructure?.zap_mode !== undefined;
}

function hasZapMode(m: ManifestLike): boolean {
  return !!m.infrastructure?.zap_mode;
}

function hasPages(m: ManifestLike): boolean {
  return !!(m.test_suites?.pages && (m.test_suites.pages as unknown[]).length > 0);
}

function hasScenarios(m: ManifestLike): boolean {
  return !!(m.test_suites?.scenarios && (m.test_suites.scenarios as unknown[]).length > 0);
}

function hasFileInput(lines: string[]): boolean {
  return lines.some((l) => !!l && /input\[type=file\]|type=file|file.?input/i.test(l));
}

function hasFileFuzzing(lines: string[]): boolean {
  return lines.some((l) => !!l && /file.?fuzz|fuzz.?file|файл|upload.*fuzz/i.test(l));
}

const RULES: SecurityRule[] = [
  {
    id: 'SEC-AUTH-001',
    category: 'Аутентификация',
severity: 'hint',
        check: (_lines, formData) => {
          const m = toManifest(formData);
          if (!m) return [];
          if (!hasAuth(m)) {
            return [{
              lineNumber: 1,
              severity: 'hint',
              message: 'Не настроена аутентификация. Добавьте auth_slot для целевого приложения.',
              category: 'Аутентификация',
        }];
      }
      return [];
    },
  },
  {
    id: 'SEC-SCAN-001',
    category: 'Сканирование',
    severity: 'info',
    check: (_lines, formData) => {
      const m = toManifest(formData);
      if (!m) return [];
      if (!hasPassiveScan(m) && hasActiveScan(m)) {
        return [{
          lineNumber: 1,
          severity: 'info',
          message: 'Active scan без passive baseline. Рекомендуется сначала запустить passive scan.',
          category: 'Сканирование',
        }];
      }
      return [];
    },
  },
  {
    id: 'SEC-PAGES-001',
    category: 'Покрытие',
    severity: 'hint',
    check: (_lines, formData) => {
      const m = toManifest(formData);
      if (!m) return [];
      if (!hasPages(m) && hasScenarios(m)) {
        return [{
          lineNumber: 1,
          severity: 'hint',
          message: 'Нет моделей страниц. Добавьте pages для лучшего покрытия (spider/discovery).',
          category: 'Покрытие',
        }];
      }
      return [];
    },
  },
  {
    id: 'SEC-REDIRECT-001',
    category: 'Безопасность',
    severity: 'error',
    check: (lines, formData) => {
      const m = toManifest(formData);
      const results: SecurityRuleResult[] = [];
      const allowedDomains = (m?.infrastructure?.allowed_extra_domains || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      const baseUrl = m?.infrastructure?.base_url_override || '';
      const baseHost = baseUrl ? new URL(baseUrl).hostname : '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const urlMatch = line.match(/https?:\/\/[^\s"'|]+/gi);
        if (!urlMatch) continue;
        for (const url of urlMatch) {
          try {
            const host = new URL(url).hostname;
            if (host === baseHost) continue;
            if (allowedDomains.some((d) => {
              if (d.startsWith('*.')) return host.endsWith(d.slice(1)) || host === d.slice(2);
              return host === d;
            })) continue;
            results.push({
              lineNumber: i + 1,
              severity: 'error',
              message: `URL ${url} ведёт на внешний домен (${host}), не указанный в allowed_extra_domains`,
              category: 'Безопасность',
            });
          } catch { /* invalid URL */ }
        }
      }
      return results;
    },
  },
  {
    id: 'SEC-CSRF-001',
    category: 'Формы',
    severity: 'hint',
    check: (lines) => {
      const hasFormAction = lines.some((l) => /\b(form|Форма|submit|отправить)\b/i.test(l));
      const hasCsrf = lines.some((l) => /\b(csrf|csrf.token|_token|authenticity)\b/i.test(l));
      if (hasFormAction && !hasCsrf) {
        return [{
          lineNumber: lines.findIndex((l) => /\b(form|Форма|submit|отправить)\b/i.test(l)) + 1 || 1,
          severity: 'hint',
          message: 'Обнаружена отправка формы без проверки CSRF-токена.',
          category: 'Формы',
        }];
      }
      return [];
    },
  },
  {
    id: 'SEC-FILE-001',
    category: 'Фаззинг',
    severity: 'hint',
    check: (lines) => {
      if (!hasFileInput(lines)) return [];
      if (!hasFileFuzzing(lines)) {
        return [{
          lineNumber: lines.findIndex((l) => /input\[type=file\]|type=file|file.?input/i.test(l)) + 1 || 1,
          severity: 'hint',
          message: 'На странице есть file input, но не настроен file upload фаззинг.',
          category: 'Фаззинг',
        }];
      }
      return [];
    },
  },
  {
    id: 'SEC-ZAP-001',
    category: 'ZAP',
    severity: 'info',
    check: (_lines, formData) => {
      const m = toManifest(formData);
      if (!m?.infrastructure?.zap_mode) {
        return [{
          lineNumber: 1,
          severity: 'info',
          message: 'Не указан режим ZAP (demon/webswing). Active/passive сканирование не будет запущено.',
          category: 'ZAP',
        }];
      }
      return [];
    },
  },
  {
id: 'SEC-EMPTY-001',
      category: 'Конфигурация',
      severity: 'hint',
      check: (_lines, formData) => {
        const m = toManifest(formData);
        if (!m?.infrastructure?.base_url_override) {
          return [{
            lineNumber: 1,
            severity: 'hint',
            message: 'Не указан целевой URL (base_url_override). Сканирование не имеет цели.',
            category: 'Конфигурация',
        }];
      }
      return [];
    },
  },
];

const SEVERITY_ICONS: Record<SecuritySeverity, string> = {
  error: '🔴',
  warning: '🟠',
  info: '🟡',
  hint: '🔵',
};

const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

export function runSecurityDiagnostics(lines: string[], formData: unknown): SecurityRuleResult[] {
  const allResults: SecurityRuleResult[] = [];
  for (const rule of RULES) {
    try {
      const results = rule.check(lines, formData);
      allResults.push(...results);
    } catch { /* rule failed silently */ }
  }
  return allResults.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.lineNumber - b.lineNumber;
  });
}

export function applySecurityDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  formData: unknown,
): void {
  const lines: string[] = [];
  for (let i = 1; i <= model.getLineCount(); i++) {
    lines.push(model.getLineContent(i));
  }
  const results = runSecurityDiagnostics(lines, formData);
  if (results.length === 0) {
    monaco.editor.setModelMarkers(model, OWNER, []);
    return;
  }

  const severityMap: Record<SecuritySeverity, monacoNs.MarkerSeverity> = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
    hint: monaco.MarkerSeverity.Hint,
  };

  const markers = results.map((r) => ({
    severity: severityMap[r.severity],
    message: `${SEVERITY_ICONS[r.severity]} [${r.category}] ${r.message}`,
    startLineNumber: Math.max(1, r.lineNumber),
    startColumn: 1,
    endLineNumber: Math.max(1, r.lineNumber),
    endColumn: 1,
  }));
  monaco.editor.setModelMarkers(model, OWNER, markers);
}

export function clearSecurityDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): void {
  monaco.editor.setModelMarkers(model, OWNER, []);
}