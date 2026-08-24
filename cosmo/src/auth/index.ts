/**
 * AUTH-PROF barrel — Better Auth production integration.
 *
 *   import { BetterAuthProvider, useBetterAuth } from '@/auth';
 *   import { adminAuthProvider } from '@/auth';
 *   import { createApiKey, listApiKeys, revokeApiKey } from '@/auth';
 *   import type { UserCapability, UserPreferences } from '@/auth';
 */

// Client auth (Better Auth server)
export { BetterAuthProvider, useBetterAuth } from './BetterAuthProvider';
export { authClient, getSession, signIn, signOut, signUp } from './clientAuth';
export { createApiKey, listApiKeys, revokeApiKey } from './apiKeyClient';
export type { ApiKeyInfo } from './apiKeyClient';

// React Admin bridge
export { adminAuthProvider } from './adminAuthProvider';
export type { AdminIdentity } from './adminAuthProvider';

// Pure functions (work without server)
export {
  computeCapabilities,
  hasCapability,
  defaultPreferences,
} from './profileStore';

// Types (shared between client and server)
export type {
  UserProfile,
  UserCapability,
  UserPreferences,
  PersonalAccessToken,
} from './profileStore';

// Legacy localStorage profile store (for gradual migration)
export { useUserProfile } from './profileStore';

// Keycloak alternative (SPIKE-B-8/9)
export {
  keycloak,
  initKeycloak,
  keycloakLogin,
  keycloakLogout,
  keycloakCapabilities,
  keycloakProfile,
} from './keycloakAuth';
export { keycloakAdminAuthProvider } from './keycloakAdminAuthProvider';