/**
 * Form-validation UX helpers for App (S3776).
 */
import type { wiredIssue } from '../utils/wiredIssue';
import type { ValidationFeedback } from '../components/ConstructorNoPenguin';

export function wiredIssuesFeedback(
  issues: readonly wiredIssue[],
  description: string,
): ValidationFeedback {
  return {
    title: 'Допущены ошибки при заполнении проверки',
    description,
    errorCount: issues.length,
    samples: issues.map((issue) => `${issue.breadcrumb} — ${issue.message}`),
    samplesHint: 'Поле — ошибка',
  };
}

export function formSchemaErrorToast(issues: readonly wiredIssue[]): string {
  const onlyRequired = issues.every(
    (issue) => issue.keyword === 'required' || issue.message === 'Заполните поле',
  );
  if (onlyRequired) {
    return `Заполните обязательные поля формы (${String(issues.length)}). Они подсвечены красным.`;
  }
  return `Проверка не проходит схему (${String(issues.length)}). См. детали ниже.`;
}

export function pipelineSchemaBlockedToast(): string {
  return 'Запуск заблокирован: ошибки схемы.';

}

export function pipelineRunStartedToast(runId: string): string {
  const id = runId.trim() ? ` (${runId})` : '';
  return `Запуск стартовал${id}. Live подхватит CI/diary; Allure/Dojo — после finalize.`;

}

export function pipelineRunPlaygroundDownToast(): string {
  return 'Валидация OK, но playground :8765 недоступен. Поднимите editor API (data_playground).';

}

export function pipelineRunAlreadyToast(): string {
  return 'Запуск уже идёт — дождись завершения или смотри Live.';

}

export function pipelineRunFailedToast(error: string): string {
  const msg = error.trim() || 'неизвестная ошибка';
  return `Не удалось стартовать: ${msg}`;

}

/** @deprecated RES-L: spawn идёт через playground; оставлен для старых импортов. */
export function pipelineLiveOkToast(): string {
  return pipelineRunStartedToast('');
}

/** @deprecated */
export function pipelineLiveDownToast(): string {
  return pipelineRunPlaygroundDownToast();
}
