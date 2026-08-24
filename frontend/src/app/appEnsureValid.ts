/**
 * Form+constructor gate before download / sensitive actions (S3776 / App).
 */
import type { wiredIssue } from '../utils/wiredIssue';
import type { ValidationFeedback } from '../components/ConstructorNoPenguin';

export type EnsureValidDeps = {
  gateConstructorsOrPenguin: () => Promise<boolean>;
  runValidation: () => wiredIssue[];
  isStudioView: () => boolean;
  switchToForm: () => void;
  setShowValidation: (v: boolean) => void;
  scrollFormErrors: () => void;
  markValidationFailed: (drawer: ValidationFeedback) => void;
  schemaFeedback: (issues: wiredIssue[]) => ValidationFeedback;
  onSchemaError: (issues: wiredIssue[]) => void;
};

export async function ensureValidOrFocusErrors(
  deps: EnsureValidDeps,
): Promise<boolean> {
  if (!(await deps.gateConstructorsOrPenguin())) {
    return false;
  }
  const issues = deps.runValidation();
  if (issues.length === 0) {
    return true;
  }
  if (deps.isStudioView()) {
    deps.switchToForm();
  }
  deps.setShowValidation(true);
  deps.scrollFormErrors();
  deps.markValidationFailed(deps.schemaFeedback(issues));
  deps.onSchemaError(issues);
  return false;
}
