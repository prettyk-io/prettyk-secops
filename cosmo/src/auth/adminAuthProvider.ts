/**
 * SPIKE-B-6: React Admin authProvider → Better Auth (production bridge).
 *
 * Заменяет localStorage-заглушку на серверную Better Auth.
 *
 *   import { adminAuthProvider } from '@/auth/adminAuthProvider';
 *   <Admin authProvider={adminAuthProvider}>...
 */
import type { AuthProvider } from 'react-admin';
import { authClient } from './clientAuth';
import type { UserCapability } from './profileStore';

export interface AdminIdentity {
  id: string;
  fullName: string;
  avatar?: string;
  email: string;
  role: string;
  department?: string;
}

export const adminAuthProvider: AuthProvider = {
  async login(params: { username: string; password: string }): Promise<{ role: string }> {
    const { data, error } = await authClient.signIn.email({
      email: params.username,
      password: params.password,
    });

    if (error) {
      throw new Error(error.message ?? 'Invalid credentials');
    }

    // Get full session for role info
    const session = await authClient.getSession();
    const role = (session.data?.session as any)?.role ?? 'user';
    return { role };
  },

  async logout(): Promise<void> {
    await authClient.signOut();
  },

  async checkAuth(): Promise<void> {
    const { data, error } = await authClient.getSession();
    if (error || !data?.user) {
      throw new Error('Not authenticated');
    }
  },

  async checkError(error: { status: number }): Promise<void> {
    if (error.status === 401 || error.status === 403) {
      await authClient.signOut();
      throw new Error('Session expired');
    }
  },

  async getIdentity(): Promise<AdminIdentity> {
    const { data } = await authClient.getSession();
    const user = data?.user;
    const sess = data?.session as any;

    if (!user) throw new Error('Not authenticated');

    return {
      id: user.id,
      fullName: sess?.displayName ?? user.name ?? user.email,
      avatar: user.image ?? undefined,
      email: user.email,
      role: sess?.role ?? 'user',
      department: (user as any)?.department,
    };
  },

  /**
   * Forward-совместимость с ra-rbac (React Admin EE).
   */
  async getPermissions(): Promise<UserCapability[]> {
    const { data } = await authClient.getSession();
    const sess = data?.session as any;
    return sess?.capabilities ?? [];
  },
};

export default adminAuthProvider;