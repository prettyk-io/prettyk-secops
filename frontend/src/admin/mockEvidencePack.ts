/**
 * Rich evidence stubs for bank showcase / TZ.
 * Replace with Live hooks + Dojo/Allure extract later (RES-4 / RES-H).
 */

import type {
  CheckEvidenceRefs,
  DeployEvidencePack,
  EvidenceHistoryPoint,
} from './evidenceTypes';

const DAYS = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
};

function historyForIbWeb(): EvidenceHistoryPoint[] {
  return [
    {
      at: DAYS(14),
      check_id: 'chk_demo_ib_web_r1',
      gate: 'fail',
      allure_project_id: 'chk_demo_ib_web_r1',
      allure_report_url:
        'http://127.0.0.1:5050/projects/chk_demo_ib_web_r1/reports/latest/',
      dojo_engagement_url: 'http://127.0.0.1:8081/engagement/10',
      dojo_stats: { critical: 2, high: 5, medium: 8, low: 4, info: 12 },
      allure_summary: {
        total: 42,
        passed: 30,
        failed: 8,
        broken: 2,
        skipped: 2,
        duration_ms: 1_820_000,
      },
      note: 'pre_release · scanner XML → Dojo',
    },
    {
      at: DAYS(7),
      check_id: 'chk_demo_ib_web_r2',
      gate: 'watch',
      allure_project_id: 'chk_demo_ib_web_r2',
      allure_report_url:
        'http://127.0.0.1:5050/projects/chk_demo_ib_web_r2/reports/latest/',
      dojo_engagement_url: 'http://127.0.0.1:8081/engagement/11',
      dojo_stats: { critical: 1, high: 3, medium: 6, low: 5, info: 10 },
      allure_summary: {
        total: 48,
        passed: 40,
        failed: 5,
        broken: 1,
        skipped: 2,
        duration_ms: 1_650_000,
      },
      note: 'retest after patch',
    },
    {
      at: DAYS(1),
      check_id: 'chk_demo_ib_web',
      gate: 'watch',
      allure_project_id: 'chk_demo_ib_web',
      allure_report_url:
        'http://127.0.0.1:5050/projects/chk_demo_ib_web/reports/latest/',
      dojo_engagement_url: 'http://127.0.0.1:8081/engagement/12',
      dojo_stats: { critical: 0, high: 2, medium: 5, low: 3, info: 10 },
      allure_summary: {
        total: 52,
        passed: 47,
        failed: 3,
        broken: 1,
        skipped: 1,
        duration_ms: 1_540_000,
      },
      note: 'latest · stub for bank TZ',
    },
  ];
}

export function buildDemoEvidenceRefs(): CheckEvidenceRefs {
  const history = historyForIbWeb();
  const last = history[history.length - 1];
  if (!last) {
    throw new Error('demo evidence history пуст');
  }
  return {
    check_id: 'chk_demo_ib_web',
    deploy_id: 'dep_ib_web_2401',
    source: 'manual',
    updated_at: last.at,
    allure: {
      report_url: last.allure_report_url,
      allure_project_id: last.allure_project_id ?? 'chk_demo_ib_web',
      generated_at: last.at,
      status: 'ok',
      elapsed_ms: last.allure_summary?.duration_ms,
      summary: last.allure_summary,
    },
    dojo: {
      product_id: 1,
      engagement_id: 12,
      test_id: 44,
      product_name: 'ib-web',
      engagement_name: 'chk_demo_ib_web',
      engagement_url: last.dojo_engagement_url,
      test_url: 'http://127.0.0.1:8081/test/44',
      stats: last.dojo_stats,
      active_findings: 20,
      mitigated_findings: 14,
    },
    history,
  };
}

export function packFromRefs(
  deployId: string,
  applicationName: string,
  metaProjectId: string,
  refs: CheckEvidenceRefs[],
): DeployEvidencePack {
  const sorted = [...refs].sort((a, b) =>
    String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
  );
  const latest = sorted[0];
  const history = sorted
    .flatMap((r) => r.history ?? [])
    .sort((a, b) => a.at.localeCompare(b.at));

  const severity_trend = history.map((h, i) => ({
    at: h.at,
    label: `R${i + 1}`,
    critical: h.dojo_stats?.critical ?? 0,
    high: h.dojo_stats?.high ?? 0,
    medium: h.dojo_stats?.medium ?? 0,
    low: h.dojo_stats?.low ?? 0,
  }));

  const pass_rate_trend = history.map((h, i) => {
    const s = h.allure_summary;
    const rate =
      s && s.total > 0 ? (s.passed + (s.skipped ?? 0) * 0.5) / s.total : 0;
    return { at: h.at, label: `R${i + 1}`, rate };
  });

  return {
    deploy_id: deployId,
    application_name: applicationName,
    meta_project_id: metaProjectId,
    allure: latest?.allure ?? null,
    dojo: latest?.dojo ?? null,
    history,
    severity_trend,
    pass_rate_trend,
  };
}

export function demoPackForDeploy(deployId: string): DeployEvidencePack | null {
  if (deployId !== 'dep_ib_web_2401') {
    return null;
  }
  const refs = buildDemoEvidenceRefs();
  return packFromRefs(deployId, 'Интернет-банк Web', 'ib-web', [refs]);
}
