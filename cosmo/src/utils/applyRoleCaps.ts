/**
 * Role caps clamping: только formData-логика (без JSON Schema).
 * JSON Schema-логика (applyRoleCapsToSchema) удалена вместе с RJSF.
 */

import type { RoleCaps } from '../shell/auth';
import type { BankDeploy } from '../admin/types';
import { listDeploys } from '../admin/deployStore';
import { MOCK_DEPLOYS } from '../admin/mockDeploys';

/* ---- helpers ---- */

function isKnownAppCode(projectId: string): boolean {
  const id = projectId.trim();
  if (!id) return false;
  if (MOCK_DEPLOYS.some((d) => d.project_id === id)) return true;
  return listDeploys().some((d) => d.project_id === id);
}

function isAllowedScanUrl(projectId: string, url: string): boolean {
  const id = projectId.trim();
  const u = url.trim();
  if (!id || !u) return false;
  if (MOCK_DEPLOYS.some((d) => d.project_id === id && d.deploy_url === u)) return true;
  return listDeploys().some((d) => d.project_id === id && d.deploy_url.trim() === u);
}

const MUTED_PURPOSES = new Set(['emergency', 'pre_release']);

/* ---- audit ---- */

export type RoleCapsViolation =
  | { code: 'purpose_muted'; from: string }
  | { code: 'generate_act_muted' }
  | { code: 'scan_url_override'; from: string }
  | { code: 'project_outside_catalog'; from: string }
  | { code: 'debug_mode_muted' }
  | { code: 'zap_mode_muted'; from: string };

export type RoleCapsClampResult = {
  formData: unknown;
  violations: RoleCapsViolation[];
};

export function auditAndClampFormDataForRoleCaps(
  formData: unknown,
  caps: RoleCaps,
): RoleCapsClampResult {
  if (formData === null || typeof formData !== 'object' || Array.isArray(formData)) {
    return { formData, violations: [] };
  }
  const root = formData as Record<string, unknown>;
  const violations: RoleCapsViolation[] = [];
  let changed = false;

  const metaRaw = root.meta;
  const meta =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
      ? { ...(metaRaw as Record<string, unknown>) }
      : null;

  if (meta) {
    const purpose = typeof meta.assessment_purpose === 'string' ? meta.assessment_purpose : '';
    if (MUTED_PURPOSES.has(purpose)) {
      if (purpose === 'emergency' && !caps.canSelectEmergency) {
        violations.push({ code: 'purpose_muted', from: purpose });
        meta.assessment_purpose = 'scheduled';
        changed = true;
      } else if (purpose === 'pre_release' && !caps.canSelectPreRelease) {
        violations.push({ code: 'purpose_muted', from: purpose });
        meta.assessment_purpose = 'scheduled';
        changed = true;
      }
    }
    if (!caps.canGenerateAct && meta.generate_act === true) {
      violations.push({ code: 'generate_act_muted' });
      meta.generate_act = false;
      changed = true;
    }
  }

  const infraRaw = root.infrastructure;
  let infra =
    infraRaw && typeof infraRaw === 'object' && !Array.isArray(infraRaw)
      ? { ...(infraRaw as Record<string, unknown>) }
      : null;

  if (!caps.canOverrideScanUrl) {
    const projectId =
      meta && typeof meta.project_id === 'string' ? meta.project_id.trim() : '';
    const url =
      infra && typeof infra.base_url_override === 'string'
        ? infra.base_url_override.trim()
        : '';

    if (projectId && !isKnownAppCode(projectId)) {
      violations.push({ code: 'project_outside_catalog', from: projectId });
      if (meta) {
        meta.project_id = '';
        changed = true;
      }
      if (infra && url) {
        violations.push({ code: 'scan_url_override', from: url });
        infra.base_url_override = '';
        changed = true;
      } else if (infra && typeof infra.base_url_override === 'string' && infra.base_url_override) {
        infra.base_url_override = '';
        changed = true;
      }
    } else if (url && !isAllowedScanUrl(projectId, url)) {
      violations.push({ code: 'scan_url_override', from: url });
      if (infra) {
        infra.base_url_override = '';
        changed = true;
      }
    }
  }

  if (infra) {
    if (!caps.canUseDebugMode && infra.debug_mode === true) {
      violations.push({ code: 'debug_mode_muted' });
      infra.debug_mode = false;
      changed = true;
    }
    if (!caps.canSelectWebswing) {
      const zap = typeof infra.zap_mode === 'string' ? infra.zap_mode : '';
      if (zap && zap !== 'demon') {
        violations.push({ code: 'zap_mode_muted', from: zap });
        infra.zap_mode = 'demon';
        changed = true;
      }
    }
  }

  if (!changed) {
    return { formData, violations };
  }

  const next: Record<string, unknown> = { ...root };
  if (meta) next.meta = meta;
  if (infra) next.infrastructure = infra;
  return { formData: next, violations };
}

export function clampFormDataForRoleCaps(
  formData: unknown,
  caps: RoleCaps,
): unknown {
  return auditAndClampFormDataForRoleCaps(formData, caps).formData;
}

/* ---- threat text ---- */

const PURPOSE_LABEL: Record<string, string> = {
  emergency: 'внештатная проверка',
  pre_release: 'проверка релиза',
};

export function formatRoleCapsThreat(
  violations: RoleCapsViolation[],
  caps: RoleCaps,
): string {
  if (violations.length === 0) return '';
  const bits: string[] = [];
  let urlRelated = false;
  for (const v of violations) {
    if (v.code === 'purpose_muted') {
      bits.push(PURPOSE_LABEL[v.from] ?? v.from);
    } else if (v.code === 'generate_act_muted') {
      bits.push('формирование акта');
    } else if (v.code === 'scan_url_override') {
      bits.push('подмена URL сканирования');
      urlRelated = true;
    } else if (v.code === 'project_outside_catalog') {
      bits.push('приложение вне каталога Космопорт');
      urlRelated = true;
    } else if (v.code === 'debug_mode_muted') {
      bits.push('режим отладки');
    } else if (v.code === 'zap_mode_muted') {
      bits.push('режим ZAP Webswing');
    }
  }
  const role = caps.displayName || 'роль';
  let text = `${role}: из данных убраны недопустимые значения (${bits.join(', ')}).`;
  if (urlRelated) {
    text += ' Подмена URL сканирования запрещена — только из карточки Космопорт.';
  }
  return text;
}

const ROLE_CAPS_THREAT_KEY = 'pk.role_caps.import_threat';

export function writeRoleCapsThreat(message: string): void {
  try {
    if (message) {
      window.sessionStorage.setItem(ROLE_CAPS_THREAT_KEY, message);
    } else {
      window.sessionStorage.removeItem(ROLE_CAPS_THREAT_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function consumeRoleCapsThreat(): string | null {
  try {
    const raw = window.sessionStorage.getItem(ROLE_CAPS_THREAT_KEY);
    if (raw) {
      window.sessionStorage.removeItem(ROLE_CAPS_THREAT_KEY);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}
