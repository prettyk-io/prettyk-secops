/**
 * FE → Live CI intake (тот же контракт, что ci_status_demo / runner).
 */

import { LIVE_CI_URL } from '../api/apiBase';

export type PostCiStatusBody = {
  phase: 'queued' | 'in_progress' | 'completed';
  job_name?: string;
  job_description?: string;
  conclusion?: string;
  exit_code?: number;
  gate?: string;
};

export async function postCiStatus(body: PostCiStatusBody): Promise<boolean> {
  try {
    const res = await fetch(LIVE_CI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postCiPipelineRunning(jobName = 'editor-launch'): Promise<boolean> {
  return postCiStatus({
    phase: 'in_progress',
    job_name: jobName,
    job_description: 'Запуск из Editor после валидации',
  });
}
