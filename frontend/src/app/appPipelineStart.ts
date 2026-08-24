/**
 * Pipeline launch after constructor/form gates → playground /api/run/start (RES-L).
 */
import type { wiredIssue } from '../utils/wiredIssue';
import type { ValidationFeedback } from '../components/ConstructorNoPenguin';
import { clearResultsHooks } from '../results/postResultsHooks';
import type { StartRunResult } from '../results/postRunStart';

export type PipelineStartDeps = {
  pipelineStarting: boolean;
  setPipelineStarting: (v: boolean) => void;
  gateConstructorsOrPenguin: () => Promise<boolean>;
  runValidation: () => wiredIssue[];
  isCheckEmpty: () => boolean;
  onCheckEmpty: () => void;
  isStudioView: () => boolean;
  switchToForm: () => void;
  markValidationFailed: (drawer: ValidationFeedback) => void;
  markValidationPassed: () => void;
  /** Current formData for runtime wired export. */
  getFormData: () => unknown;
  startRun: (formData: unknown) => Promise<StartRunResult>;
  switchToResults: () => void;
  onBeginAwaitStart?: () => void;
  onSchemaBlocked: () => void;
  onRunStarted: (runId: string, monitorToken?: string) => void;
  onRunBlocked: (result: Extract<StartRunResult, { ok: false }>) => void;
  schemaFeedback: (issues: wiredIssue[]) => ValidationFeedback;
};

export async function runPipelineStart(deps: PipelineStartDeps): Promise<void> {
  if (deps.pipelineStarting) {
    return;
  }
  deps.setPipelineStarting(true);
  try {
    if (deps.isCheckEmpty()) {
      deps.onCheckEmpty();
      return;
    }
    if (!(await deps.gateConstructorsOrPenguin())) {
      return;
    }
    const issues = deps.runValidation();
    if (issues.length > 0) {
      if (deps.isStudioView()) {
        deps.switchToForm();
      }
      deps.markValidationFailed(deps.schemaFeedback(issues));
      deps.onSchemaBlocked();
      return;
    }
    deps.markValidationPassed();
    // Новый прогон: дроп Allure/Dojo hooks до spawn (серые тайлы, lock акта).
    await clearResultsHooks();
    deps.onBeginAwaitStart?.();
    deps.switchToResults();
    const started = await deps.startRun(deps.getFormData());
    if (started.ok) {
      deps.onRunStarted(started.run_id, started.monitor_token);
    } else {
      deps.onRunBlocked(started);
    }
  } finally {
    deps.setPipelineStarting(false);
  }
}
