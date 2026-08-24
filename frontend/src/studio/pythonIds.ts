/**
 * Имена листьев дерева Редактора = python-id = ID вызова.
 * Отдельных @-хедеров в PrettyK нет.
 */

const PYTHON_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isPythonTechId(name: string): boolean {
  return PYTHON_ID.test(name);
}

/** Имя листа дерева: python-id. */
export function displayNameError(
  name: string,
  kind: 'page' | 'scenario' | 'module',
): string | undefined {
  const id = name.trim();
  if (!id) {
    if (kind === 'page') {
      return 'Укажите имя модели данных';
    }
    if (kind === 'scenario') {
      return 'Укажите имя сценария';
    }
    return 'Укажите имя модуля';
  }
  if (!isPythonTechId(id)) {
    return 'Имя: латиница/цифры/_; с буквы или _ (login_page)';
  }
  return undefined;
}
