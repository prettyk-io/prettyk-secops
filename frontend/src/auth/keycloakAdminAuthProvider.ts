/**
 * SPIKE-B-9: React Admin authProvider → Keycloak.
 *
 * Альтернатива Better Auth bridge. Демонстрирует полную интеграцию.
 *
 *   import { keycloakAdminAuthProvider } from '@/auth/keycloakAdminAuthProvider';
 */
import type { AuthProvider } from 'react-admin';
import { keycloak, initKeycloak, keycloakLogin, keycloakLogout, keycloakCapabilities, keycloakProfile } from './keycloakAuth';
import type { UserCapability } from './profileStore';

export const keycloakAdminAuthProvider: AuthProvider = {
  async login(): Promise<{ role: string }> {
    // Keycloak login redirect
    await keycloakLogin();
    // This never returns until redirect back
    return { role: keycloak.realmAccess?.roles?.join(',') ?? '' };
  },

  async logout(): Promise<void> {
    await keycloakLogout();
  },

  async checkAuth(): Promise<void> {
    const authenticated = await initKeycloak();
    if (!authenticated) {
      throw new Error('Not authenticated');
    }
  },

  async checkError(error: { status: number }): Promise<void> {
    if (error.status === 401 || error.status === 403) {
      await keycloakLogout();
      throw new Error('Session expired');
    }
  },

  async getIdentity() {
    const profile = await keycloakProfile();
    if (!profile) throw new Error('Not authenticated');
    return profile;
  },

  async getPermissions(): Promise<UserCapability[]> {
    await initKeycloak();
    return keycloakCapabilities();
  },
};

export default keycloakAdminAuthProvider;