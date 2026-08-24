/** SPIKE-F-6: Auth provider for React Admin (Marmelab) — bridges to Better Auth.
 *
 * When Boss ships SPIKE-B-1, the authClient calls will hit the real backend.
 * Until then, the legacy auth.ts session provides identity.
 */
import type { AuthProvider } from 'react-admin';
import { authClient } from '../shell/betterAuthClient';
import { readSession, displayNameOf, roleOf, capsForUser } from '../shell/auth';
import type { UserCapability } from '../shell/useProfileStore';

const ROLE_TO_CAPABILITIES: Record<string, UserCapability[]> = {
  admin_sec: ['admin:access', 'control:access', 'checks:create', 'checks:import', 'checks:delete', 'fuzzer:execute', 'policies:manage', 'retention:clean', 'tokens:manage', 'dojo:sync', 'studio:edit'],
  admin_abnormal: ['admin:access', 'checks:create', 'checks:import', 'fuzzer:execute'],
  admin_service: ['control:access', 'retention:clean', 'tokens:manage'],
  sec_expert: ['checks:create', 'fuzzer:execute'],
  user: ['checks:create'],
};

export const adminAuthProvider: AuthProvider = {
  async login({ username, password }: { username: string; password: string }): Promise<void> {
    // Delegates to the existing auth.ts login flow
    const { login, logout } = await import('../shell/auth');
    const result = login(username, password);
    if (!result.ok) {
      throw new Error(result.error ?? 'Login failed');
    }
  },

  async logout(): Promise<void> {
    const { logout } = await import('../shell/auth');
    authClient.clearSession();
    logout();
  },

  async checkAuth(): Promise<void> {
    // Try Better Auth server session first
    const session = await authClient.getSession();
    if (session?.user) return;
    // Fallback: legacy session
    const legacySession = readSession();
    if (!legacySession) throw new Error('Not authenticated');
  },

  async checkError(error: unknown): Promise<void> {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      authClient.clearSession();
      throw new Error('Session expired');
    }
  },

  async getIdentity(): Promise<{ id: string; fullName: string; avatar?: string; email?: string; role?: string; department?: string }> {
    // Server session preferred
    const session = await authClient.getSession();
    if (session?.user) {
      return {
        id: session.user.id,
        fullName: session.user.name,
        email: session.user.email,
        avatar: session.user.avatarUrl ?? undefined,
        role: session.user.role,
        department: session.user.department,
      };
    }
    // Fallback: legacy auth.ts
    const legacy = readSession();
    return {
      id: legacy ?? 'unknown',
      fullName: displayNameOf(legacy) ?? (typeof legacy === 'string' ? legacy : 'Unknown'),
      role: roleOf(legacy) ?? undefined,
    };
  },

  async getPermissions(): Promise<UserCapability[]> {
    // Server session preferred
    const session = await authClient.getSession();
    if (session?.user?.capabilities?.length) {
      return session.user.capabilities;
    }
    // Fallback: legacy role → capability mapping
    const legacy = readSession();
    const role = roleOf(legacy);
    return role ? (ROLE_TO_CAPABILITIES[role] ?? []) : [];
  },
};