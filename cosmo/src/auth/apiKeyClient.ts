/**
 * SPIKE-B-5: API Key (PAT) client-side management.
 *
 * Использует Better Auth api-key plugin для создания/отзыва токенов.
 *
 *   import { createApiKey, listApiKeys, revokeApiKey } from '@/auth/apiKeyClient';
 */
import { authClient } from './clientAuth';

export interface ApiKeyInfo {
  id: string;
  name: string;
  start: string | null;
  prefix: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  metadata?: string | null;
}

/**
 * Создать новый API ключ.
 * Возвращает полный ключ (показать один раз!) и запись.
 */
export async function createApiKey(name: string, expiresInDays?: number) {
  const { data, error } = await authClient.apiKey.create({
    body: {
      name,
      expiresIn: expiresInDays ?? null,
      metadata: JSON.stringify({ created: 'manual' }),
    },
  } as any);

  if (error) throw new Error(error.message ?? 'Failed to create API key');
  return data as any as { key: string; apiKey: ApiKeyInfo };
}

/**
 * Получить список всех API ключей текущего пользователя.
 */
export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const { data, error } = await authClient.apiKey.list();
  if (error) throw new Error(error.message ?? 'Failed to list API keys');
  return (data as any)?.apiKeys ?? [];
}

/**
 * Отозвать API ключ по ID.
 */
export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await authClient.apiKey.delete({
    body: { keyId: id },
  } as any);
  if (error) throw new Error(error.message ?? 'Failed to revoke API key');
}