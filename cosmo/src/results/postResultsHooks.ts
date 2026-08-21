/**
 * FE → Live Results hooks intake (тот же контракт, что results_hooks_demo / finalize).
 */

import { LIVE_HOOKS_URL } from '../api/apiBase';

export type PostResultsHooksBody = {
  allure_report_url?: string;
  dojo_report_url?: string;
  service?: 'allure' | 'dojo';
  report_url?: string;
  clear?: boolean;
};

export async function postResultsHooks(body: PostResultsHooksBody): Promise<boolean> {
  try {
    const res = await fetch(LIVE_HOOKS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Lab defaults — allure3-secops root + Dojo engagement. */
export const LAB_HOOK_URLS = {
  allure: 'http://127.0.0.1:5050/',
  dojo: 'http://127.0.0.1:8081/engagement/1',
} as const;

/** Drop Allure/Dojo hooks (new run / restart → grey tiles, lock downloads). */
export async function clearResultsHooks(): Promise<boolean> {
  return postResultsHooks({ clear: true });
}

/** Publish both report URLs so Results tiles glow (lab / smoke without full finalize). */
export async function postLabReportHooksReady(): Promise<boolean> {
  return postResultsHooks({
    allure_report_url: LAB_HOOK_URLS.allure,
    dojo_report_url: LAB_HOOK_URLS.dojo,
  });
}
