/**
 * Header validate button chrome (S3776).
 */
export type ValidationStatus = 'idle' | 'pass' | 'fail' | string;

export function validationButtonHint(status: ValidationStatus): string {
  if (status === 'pass') {
    return 'Проверка пройдена';
  }
  if (status === 'fail') {
    return 'Проверка нашла ошибки';
  }
  return 'Валидировать проверку';
}

/** form → «Конфигурации и регламент проверки»; results → «Результаты проверки»; studio → без заголовка. */
export function editorViewHeaderTitle(
  editorView: 'form' | 'studio' | 'results' | string,
): string | null {
  if (editorView === 'form') return 'Конфигурации и регламент проверки';
  if (editorView === 'results') return 'Результаты проверки';
  return null;
}
