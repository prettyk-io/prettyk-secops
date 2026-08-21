/**
 * Контракт dirty-guard при закрытии CheckInstance.
 */

export type CheckCloseGuard = {
  isDirty: () => boolean;
  /** Сбросить pending debounce и сохранить текущий буфер. */
  save: () => void;
  /**
   * Откатить буфер к baseline открытия.
   * Если draft без runs — можно удалить instance (deleted=true).
   */
  discard: () => { deleted: boolean };
};

export function serializeCheckBuffer(
  wired: unknown,
  resourceContents: Record<string, string>,
): string {
  return JSON.stringify({ wired, resourceContents });
}
