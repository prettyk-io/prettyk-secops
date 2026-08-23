import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import App from '../App';
import { CloseCheckModal } from '../checks/CloseCheckModal';
import type { CheckCloseGuard } from '../checks/closeGuard';
import { enableChecksRemoteSync } from '../checks/checksRemote';
import {
  createCheck,
  getCheck,
  setActiveCheckId,
  touchOpened,
} from '../checks/checksStore';
import {
  formatHash,
  navigateHash,
  parseHash,
  readHashRoute,
  type HashRoute,
} from '../checks/hashRoute';
import type { CheckView } from '../checks/types';
import { freshCheckWiredData } from './freshCheck';
import {
  canAccessAdmin,
  canimportWired,
  canSelectPreRelease,
  displayNameOf,
  logout,
  readSession,
  roleOf,
  type AuthUser,
} from './auth';
import { HistoryPage } from './HistoryPage';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';
import { CommandPalette } from './CommandPalette';
import { AdminPage } from './AdminPage';
import { LabWorkspace } from '../lab/LabWorkspace';
import { DesignPlayground } from '../design-playground/DesignPlayground';
import { StudioV2 } from '../studio/StudioV2';
import { ShellAmbientVideo } from './ShellAmbientVideo';
import { buildWiredFromDeploy, titleFromDeploy } from '../admin/buildWiredFromDeploy';
import { getDeploy, linkCheckToDeploy } from '../admin/deployStore';
import { StudioSetupPage } from './StudioSetupPage';

function routeWantsAmbient(route: HashRoute, authed: boolean): boolean {
  if (!authed) {
    return true;
  }
  return route.kind === 'home' || route.kind === 'history' || route.kind === 'setup';
}

function defaultAuthedRoute(): HashRoute {
  const route = readHashRoute();
  if (route.kind === 'login') {
    return { kind: 'home' };
  }
  if (route.kind === 'admin' && !canAccessAdmin(readSession())) {
    return { kind: 'home' };
  }
  return route;
}

function guardAdminRoute(route: HashRoute, user: AuthUser | null): HashRoute {
  if (route.kind === 'admin' && !canAccessAdmin(user)) {
    return { kind: 'home' };
  }
  return route;
}

export function AppShell(): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());
  const [route, setRoute] = useState<HashRoute>(() =>
    readSession() ? defaultAuthedRoute() : parseHash(window.location.hash || '#/home'),
  );
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [closeOpen, setCloseOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<HashRoute | null>(null);
  const guardRef = useRef<CheckCloseGuard | null>(null);
  const pendingCreateRef = useRef<'fresh' | 'import' | null>(null);
  const pendingImportRef = useRef<unknown | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const pendingDeployIdRef = useRef<string | null>(null);
  /** Brand / close из Editor — всегда home (не «назад в историю»). */
  const returnToRef = useRef<HashRoute>({ kind: 'home' });
  /** Сброс UI Истории при уходе (query/scroll не залипают). */
  const [historyEpoch, setHistoryEpoch] = useState(0);
  /** One-shot fade+rise Home только после login→home. */
  const [homeEnter, setHomeEnter] = useState(false);

  useEffect(() => {
    enableChecksRemoteSync();
  }, []);

  useEffect(() => {
    const onHash = () => {
      const session = readSession();
      const next = parseHash(window.location.hash || '#/home');
      if (!session) {
        setUser(null);
        setRoute(next.kind === 'login' ? { kind: 'home' } : next);
        return;
      }
      setUser(session);
      if (next.kind === 'login') {
        navigateHash({ kind: 'home' });
        setRoute({ kind: 'home' });
        return;
      }
      const guarded = guardAdminRoute(next, session);
      if (guarded.kind !== next.kind) {
        navigateHash(guarded);
      }
      setRoute(guarded);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pk.auth.user' || e.key === 'kdt.auth.user') {
        const session = readSession();
        setUser(session);
        if (session) {
          const cur = parseHash(window.location.hash || '#/home');
          const target = cur.kind !== 'login' ? guardAdminRoute(cur, session) : { kind: 'home' as const };
          setRoute(target);
        } else {
          setRoute({ kind: 'login' });
        }
      }
    };

    window.addEventListener('hashchange', onHash);
    window.addEventListener('storage', onStorage);

    // Initial check on mount
    const session = readSession();
    if (session) {
      setUser(session);
      if (!window.location.hash) {
        navigateHash({ kind: 'home' });
        setRoute({ kind: 'home' });
      } else {
        const cur = parseHash(window.location.hash);
        const guarded = cur.kind === 'login' ? { kind: 'home' as const } : guardAdminRoute(cur, session);
        if (formatHash(guarded) !== window.location.hash) {
          navigateHash(guarded);
        }
        setRoute(guarded);
      }
    }

    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const go = useCallback((next: HashRoute) => {
    const guarded = guardAdminRoute(next, readSession());
    navigateHash(guarded);
    setRoute(guarded);
  }, []);

  const finishPendingCreate = useCallback(() => {
    const kind = pendingCreateRef.current;
    const title = pendingTitleRef.current?.trim() || undefined;
    const deployId = pendingDeployIdRef.current;
    pendingCreateRef.current = null;
    pendingTitleRef.current = null;
    pendingDeployIdRef.current = null;
    if (kind === 'import' && pendingImportRef.current !== null) {
      const data = pendingImportRef.current;
      pendingImportRef.current = null;
      const item = createCheck({
        title,
        wired: data,
        resource_contents: {},
        status: 'draft',
        view: 'form',
      });
      if (deployId) {
        linkCheckToDeploy(deployId, item.check_id);
      }
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'form' });
      return;
    }
    if (kind === 'fresh') {
      const item = createCheck({
        title,
        wired: freshCheckWiredData(),
        resource_contents: {},
        status: 'draft',
        view: 'studio',
      });
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'studio' });
    }
  }, [go]);

  const tryLeaveCheck = useCallback(
    (next: HashRoute) => {
      if (route.kind !== 'check') {
        go(next);
        return;
      }
      const guard = guardRef.current;
      if (guard?.isDirty()) {
        setPendingRoute(next);
        setCloseOpen(true);
        return;
      }
      guard?.save();
      setActiveCheckId(null);
      go(next);
    },
    [go, route.kind],
  );

  const openCheck = useCallback(
    (checkId: string, view?: CheckView, returnTo?: HashRoute) => {
      const item = getCheck(checkId);
      if (!item) {
        go({ kind: 'home' });
        return;
      }
      returnToRef.current = returnTo ?? { kind: 'home' };
      touchOpened(checkId);
      setActiveCheckId(checkId);
      const nextView =
        view ??
        (item.status === 'completed' || item.status === 'failed'
          ? 'results'
          : item.view ?? 'studio');
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId, view: nextView });
    },
    [go],
  );

  const startFresh = useCallback(
    (title: string, url?: string, browserType?: string) => {
      const trimmed = title.trim();
      if (route.kind === 'check' && guardRef.current?.isDirty()) {
        pendingCreateRef.current = 'fresh';
        pendingTitleRef.current = trimmed;
        setPendingRoute({ kind: 'home' });
        setCloseOpen(true);
        return;
      }
      returnToRef.current = { kind: 'home' };
      const wired = freshCheckWiredData() as Record<string, unknown>;
      if (url?.trim()) {
        const infra = (wired.infrastructure as Record<string, unknown>) ?? {};
        infra.base_url_override = url.trim();
        wired.infrastructure = infra;
      }
      if (browserType?.trim()) {
        const infra = (wired.infrastructure as Record<string, unknown>) ?? {};
        infra.browser_type = browserType.trim();
        wired.infrastructure = infra;
      }
      const item = createCheck({
        title: trimmed,
        wired,
        resource_contents: {},
        status: 'draft',
        view: 'studio',
      });
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'studio' });
    },
    [go, route.kind],
  );

  const startSetup = useCallback(() => {
    go({ kind: 'setup' });
  }, [go]);

  const startWithManifest = useCallback(
    (wired: unknown, title: string) => {
      const trimmed = title.trim();
      returnToRef.current = { kind: 'home' };
      const item = createCheck({
        title: trimmed,
        wired,
        resource_contents: {},
        status: 'draft',
        view: 'studio',
      });
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'studio' });
    },
    [go],
  );

  const startImported = useCallback(
    (formData: unknown, title: string) => {
      const trimmed = title.trim();
      if (route.kind === 'check' && guardRef.current?.isDirty()) {
        pendingCreateRef.current = 'import';
        pendingImportRef.current = formData;
        pendingTitleRef.current = trimmed;
        setPendingRoute({ kind: 'home' });
        setCloseOpen(true);
        return;
      }
      returnToRef.current = { kind: 'home' };
      const item = createCheck({
        title: trimmed,
        wired: formData,
        resource_contents: {},
        status: 'draft',
        view: 'studio',
      });
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'studio' });
    },
    [go, route.kind],
  );

  const startFromDeploy = useCallback(
    (
      deployId: string,
      opts?: { title?: string; returnTo?: HashRoute },
    ) => {
      const deploy = getDeploy(deployId);
      if (!deploy) {
        return;
      }
      const purpose = canSelectPreRelease(readSession()) ? 'pre_release' : 'scheduled';
      const wired = buildWiredFromDeploy(deploy, {
        assessmentPurpose: purpose,
      });
      const title = (opts?.title || titleFromDeploy(deploy)).trim();
      const returnTo = opts?.returnTo ?? { kind: 'admin' as const };
      if (route.kind === 'check' && guardRef.current?.isDirty()) {
        pendingCreateRef.current = 'import';
        pendingImportRef.current = wired;
        pendingTitleRef.current = title;
        pendingDeployIdRef.current = deployId;
        setPendingRoute(returnTo);
        setCloseOpen(true);
        return;
      }
      returnToRef.current = returnTo;
      const item = createCheck({
        title,
        wired,
        resource_contents: {},
        status: 'draft',
        view: 'form',
      });
      linkCheckToDeploy(deployId, item.check_id);
      setWorkspaceKey((k) => k + 1);
      go({ kind: 'check', checkId: item.check_id, view: 'form' });
    },
    [go, route.kind],
  );

  const handleSaveAndLeave = useCallback(() => {
    guardRef.current?.save();
    setCloseOpen(false);
    const next = pendingRoute ?? { kind: 'home' as const };
    setPendingRoute(null);
    setActiveCheckId(null);
    if (pendingCreateRef.current) {
      finishPendingCreate();
      return;
    }
    go(next);
  }, [finishPendingCreate, go, pendingRoute]);

  const handleDiscardAndLeave = useCallback(() => {
    guardRef.current?.discard();
    setCloseOpen(false);
    setPendingRoute(null);
    setActiveCheckId(null);
    if (pendingCreateRef.current) {
      finishPendingCreate();
      return;
    }
    go(pendingRoute ?? { kind: 'home' });
  }, [finishPendingCreate, go, pendingRoute]);

  const handleStay = useCallback(() => {
    setCloseOpen(false);
    setPendingRoute(null);
    pendingCreateRef.current = null;
    pendingImportRef.current = null;
    pendingDeployIdRef.current = null;
    if (route.kind === 'check') {
      navigateHash(route);
    }
  }, [route]);

  const handleLogout = useCallback(() => {
    logout();
    guardRef.current = null;
    setCloseOpen(false);
    setPendingRoute(null);
    setActiveCheckId(null);
    setHomeEnter(false);
    setUser(null);
    navigateHash({ kind: 'login' });
    setRoute({ kind: 'login' });
  }, []);

  const roleLabel = useMemo(() => {
    return roleOf(user) === 'admin_ib' ? displayNameOf(user) : null;
  }, [user]);

  let main: React.JSX.Element;
  if (!user) {
    main = (
      <LoginPage
        onSuccess={() => {
          const session = readSession();
          setUser(session);
          const currentHash = parseHash(window.location.hash || '');
          const target = currentHash.kind !== 'login'
            ? guardAdminRoute(currentHash, session)
            : { kind: 'home' as const };
          if (target.kind === 'home') {
            setHomeEnter(true);
          }
          go(target);
        }}
      />
    );
  } else if (route.kind === 'history') {
    main = (
      <HistoryPage
        key={historyEpoch}
        onBackHome={() => go({ kind: 'home' })}
        onOpenCheck={(checkId) => {
          setHistoryEpoch((n) => n + 1);
          openCheck(checkId);
        }}
        onReplayCheck={(checkId) => {
          setHistoryEpoch((n) => n + 1);
          openCheck(checkId);
        }}
        onLogout={handleLogout}
      />
    );
  } else if (route.kind === 'setup') {
    main = (
      <StudioSetupPage
        onBackHome={() => go({ kind: 'home' })}
        onProceedToStudio={(wired, title) => {
          startWithManifest(wired, title);
        }}
        onLogout={handleLogout}
        roleLabel={roleLabel}
      />
    );
  } else if (route.kind === 'admin' && canAccessAdmin(user)) {
    main = (
      <AdminPage
        onBackHome={() => go({ kind: 'home' })}
        onLogout={handleLogout}
        onInitFromDeploy={startFromDeploy}
        onOpenCheck={(checkId, view) => {
          openCheck(checkId, view, { kind: 'admin' });
        }}
      />
    );
  } else if (route.kind === 'studio-v2') {
    main = (
      <div className="dark h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#09090b" }}>
        <div className="flex items-center justify-between px-3 h-11 shrink-0" style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
          <span className="text-sm font-semibold" style={{ color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>PrettyK Studio</span>
          <span className="text-xs" style={{ color: "#64748b", fontFamily: "Golos UI, sans-serif" }}>dev preview</span>
        </div>
        <StudioV2 />
      </div>
    );
  } else if (route.kind === 'lab') {
    main = (
      <LabWorkspace
        onBackHome={() => go({ kind: 'home' })}
        onLogout={handleLogout}
      />
    );
  } else if (route.kind === 'design-playground') {
    main = <DesignPlayground />;
  } else if (route.kind === 'check') {
    const item = getCheck(route.checkId);
    main = item ? (
      <App
        key={workspaceKey}
        checkId={item.check_id}
        initialManifest={item.wired}
        initialResources={item.resource_contents ?? {}}
        initialView={route.view}
        onRegisterGuard={(guard) => {
          guardRef.current = guard;
        }}
        onViewChange={(view) => {
          const next = { kind: 'check' as const, checkId: item.check_id, view };
          if (formatHash(next) !== window.location.hash) {
            navigateHash(next);
            setRoute(next);
          }
        }}
        onRequestClose={() => tryLeaveCheck(returnToRef.current)}
        onBrandHome={() => tryLeaveCheck({ kind: 'home' })}
        onCheckDeleted={() => {
          guardRef.current = null;
          setActiveCheckId(null);
          setCloseOpen(false);
          go({ kind: 'home' });
        }}
        onLogout={handleLogout}
      />
    ) : (
      <HomePage
        onOpenHistory={() => go({ kind: 'history' })}
        onOpenAdmin={() => go({ kind: 'admin' })}
        onOpenLab={() => go({ kind: 'lab' })}
        onStartFresh={startFresh}
        onStartSetup={startSetup}
        onStartImported={startImported}
        onStartFromDeploy={(deployId, title) =>
          startFromDeploy(deployId, { title, returnTo: { kind: 'home' } })
        }
        onLogout={handleLogout}
        playEnter={homeEnter}
        onEnterPlayed={() => setHomeEnter(false)}
        canAccessAdmin={canAccessAdmin(user)}
        canimportWired={canimportWired(user)}
        roleLabel={roleLabel}
      />
    );
  } else {
    main = (
      <HomePage
        onOpenHistory={() => go({ kind: 'history' })}
        onOpenAdmin={() => go({ kind: 'admin' })}
        onOpenLab={() => go({ kind: 'lab' })}
        onStartFresh={startFresh}
        onStartSetup={startSetup}
        onStartImported={startImported}
        onStartFromDeploy={(deployId, title) =>
          startFromDeploy(deployId, { title, returnTo: { kind: 'home' } })
        }
        onLogout={handleLogout}
        playEnter={homeEnter}
        onEnterPlayed={() => setHomeEnter(false)}
        canAccessAdmin={canAccessAdmin(user)}
        canimportWired={canimportWired(user)}
        roleLabel={roleLabel}
      />
    );
  }

  const showAmbient = routeWantsAmbient(route, Boolean(user));

  return (
    <>
      {showAmbient ? (
        <div className="pk-shell-ambient-root" data-testid="shell-ambient-root">
          <ShellAmbientVideo />
          {main}
        </div>
      ) : (
        main
      )}
      <CommandPalette onNavigate={(next) => tryLeaveCheck(next)} />
      <CloseCheckModal
        open={closeOpen}
        onSaveAndLeave={handleSaveAndLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
        onStay={handleStay}
      />
    </>
  );
}
