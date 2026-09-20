/**
 * SPIKE-B-8: Keycloak integration (keycloak-js).
 *
 * Инициализация Keycloak, логин/логаут, профиль, роли → capabilities.
 *
 *   import { keycloak, initKeycloak, keycloakCapabilities, keycloakAuthProvider } from '@/auth/keycloakAuth';
 */
import Keycloak from 'keycloak-js';
import type { UserCapability } from './profileStore';

export const keycloak = new Keycloak({
  url: 'http://localhost:8082',
  realm: 'prettyk',
  clientId: 'prettyk-editor',
});

let _initialized = false;

/**
 * Инициализировать Keycloak (onLoad: check-sso — не блокирует если нет сессии).
 */
export async function initKeycloak(): Promise<boolean> {
  if (_initialized) return keycloak.authenticated ?? false;
  try {
    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
    });
    _initialized = true;
    return authenticated;
  } catch (e) {
    console.warn('Keycloak init failed:', e);
    return false;
  }
}

/**
 * Принудительный логин (redirect to Keycloak login).
 */
export async function keycloakLogin(): Promise<void> {
  await keycloak.login({ redirectUri: window.location.origin });
}

/**
 * Logout.
 */
export async function keycloakLogout(): Promise<void> {
  await keycloak.logout({ redirectUri: window.location.origin });
}

/**
 * Realm roles → PrettyK capabilities.
 */
export function keycloakCapabilities(): UserCapability[] {
  const map: Record<string, UserCapability[]> = {
    admin_sec: ['admin:access','control:access','checks:create','checks:import','checks:delete','fuzzer:execute','policies:manage','retention:clean','tokens:manage'],
    admin_service: ['control:access','retention:clean','tokens:manage'],
    sec_expert: ['checks:create','checks:import','fuzzer:execute','tokens:manage'],
    user: ['checks:create'],
  };

  if (!keycloak.authenticated) return [];

  const caps: UserCapability[] = [];
  for (const [role, roleCaps] of Object.entries(map)) {
    if (keycloak.hasRealmRole(role)) {
      caps.push(...roleCaps);
    }
  }
  return [...new Set(caps)];
}

/**
 * Текущий профиль из Keycloak.
 */
export async function keycloakProfile() {
  try {
    const profile = await keycloak.loadUserProfile();
    return {
      id: keycloak.subject ?? profile.username ?? '',
      email: profile.email ?? '',
      fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || '',
      role: keycloak.realmAccess?.roles?.join(',') ?? '',
    };
  } catch {
    return null;
  }
}