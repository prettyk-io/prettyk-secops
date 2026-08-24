/**
 * SPIKE-B-2/3/4: Better Auth React Context Provider.
 *
 * Оборачивает приложение в единый auth-контекст.
 * Заменяет прямой доступ к localStorage/sessionStorage.
 *
 *   <BetterAuthProvider>
 *     <App />
 *   </BetterAuthProvider>
 *
 *   const { user, session, isLoading, signIn, signOut, preferences, updatePreferences } = useBetterAuth();
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authClient, getSession, signIn as baSignIn, signOut as baSignOut } from './clientAuth';
import type { UserCapability, UserPreferences } from './profileStore';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string;
  capabilities?: UserCapability[];
  preferences?: UserPreferences;
}

interface BetterAuthContextValue {
  user: BetterAuthUser | null;
  session: any | null;
  isLoading: boolean;
  capabilities: UserCapability[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  hasCapability: (cap: UserCapability) => boolean;
}

const BetterAuthContext = createContext<BetterAuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  capabilities: [],
  signIn: async () => {},
  signOut: async () => {},
  updatePreferences: async () => {},
  hasCapability: () => false,
});

// ═══════════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════════

export function BetterAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap: check session on mount
  useEffect(() => {
    getSession().then((data) => {
      if (data?.user) {
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: (data.user as any).displayName ?? data.user.name ?? data.user.email,
          image: data.user.image,
          role: (data.session as any)?.role,
          capabilities: (data.session as any)?.capabilities,
          preferences: (data.session as any)?.preferences,
        });
        setSession(data.session);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await baSignIn(email, password);
    const data = await getSession();
    if (data?.user) {
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: (data.user as any).displayName ?? data.user.name ?? data.user.email,
        image: data.user.image,
        role: (data.session as any)?.role,
        capabilities: (data.session as any)?.capabilities,
        preferences: (data.session as any)?.preferences,
      });
      setSession(data.session);
    }
  }, []);

  const signOut = useCallback(async () => {
    await baSignOut();
    setUser(null);
    setSession(null);
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<UserPreferences>) => {
    // Save preferences via Better Auth user update
    const currentUser = user;
    if (!currentUser) return;

    const merged: UserPreferences = {
      theme: 'dark',
      font: 'golos',
      locale: 'ru',
      density: 'standard',
      ...(currentUser.preferences ?? {}),
      ...prefs,
    };
    try {
      // Update user metadata через сервер
      await authClient.updateUser({
        preferences: JSON.stringify(merged),
      } as any);
      setUser(prev => prev ? { ...prev, preferences: merged } : null);
    } catch (e) {
      console.warn('Failed to save preferences:', e);
    }
  }, [user]);

  const hasCapability = useCallback((cap: UserCapability): boolean => {
    return user?.capabilities?.includes(cap) ?? false;
  }, [user]);

  return React.createElement(BetterAuthContext.Provider, {
    value: {
      user,
      session,
      isLoading,
      capabilities: user?.capabilities ?? [],
      signIn,
      signOut,
      updatePreferences,
      hasCapability,
    },
  }, children);
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════

export function useBetterAuth() {
  return useContext(BetterAuthContext);
}

export default BetterAuthProvider;