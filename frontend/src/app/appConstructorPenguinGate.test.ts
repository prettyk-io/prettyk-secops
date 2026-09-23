/**
 * BOX-VAL-1: backend-валидатор недоступен → не молчаливый успех.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { keywordCatalog } from '../keywords/catalog';
import { runConstructorPenguinGate } from './appConstructorPenguinGate';

vi.mock('../api/editorValidate', () => ({
  validateConstructorsBatch: vi.fn(),
}));

import { validateConstructorsBatch } from '../api/editorValidate';

const mockedBatch = vi.mocked(validateConstructorsBatch);

describe('runConstructorPenguinGate — backend unavailable', () => {
  beforeEach(() => {
    mockedBatch.mockReset();
  });

  it('вызывает onBackendUnavailable когда API отдал null', async () => {
    mockedBatch.mockResolvedValue(null);
    const onBackendUnavailable = vi.fn();
    const onFail = vi.fn();

    const ok = await runConstructorPenguinGate(
      {},
      keywordCatalog,
      onFail,
      onBackendUnavailable,
    );

    // Пустой документ без конструкторов → клиентских ошибок нет, gate проходит,
    // НО backend-недоступность обязана быть озвучена вызывающему (не зелёный).
    expect(ok).toBe(true);
    expect(onBackendUnavailable).toHaveBeenCalledOnce();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('не сигналит о недоступности когда backend ответил массивом', async () => {
    mockedBatch.mockResolvedValue([]);
    const onBackendUnavailable = vi.fn();
    const onFail = vi.fn();

    const ok = await runConstructorPenguinGate(
      {},
      keywordCatalog,
      onFail,
      onBackendUnavailable,
    );

    expect(ok).toBe(true);
    expect(onBackendUnavailable).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });
});