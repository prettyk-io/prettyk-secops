import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  syncDocumentTitle,
  type HashRoute,
} from '../checks/hashRoute';
import type { CheckView } from '../checks/types';
import { freshCheckWiredData } from './freshCheck';
import {
  canAccessAdmin,
  canAccessControl,
  canAccessSecOpsControl,
  canimportWired,
  canSelectPreRelease,
  displayNameOf,
  logout,
  readSession,
  writeSession,
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
import { EditorWorkbench } from '../workbench/EditorWorkbench';
import { SanctuaryMap } from '../sanctuary/SanctuaryMap';
import { ControlPanel } from '../control/ControlPanel';
import { SecOpsControl } from '../admin/SecOpsControl';
import { SecOpsControlPure } from '../admin/views/SecOpsControlPure';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ShellAmbientVideo } from './ShellAmbientVideo';
import { ProfileDrawer } from './ProfileDrawer';
import { buildWiredFromDeploy, titleFromDeploy } from '../admin/buildWiredFromDeploy';
import { getDeploy, linkCheckToDeploy } from '../admin/deployStore';
import { StudioSetupPage } from './StudioSetupPage';

const AdminShowcase = lazy(() => import('../design-admin/AdminShowcase').then(m => ({ default: m.AdminShowcase })));

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
  const [user, setUser] = useState<AuthUser | null>(() => {
    const existing = readSession();
    if (existing) return existing;
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      writeSession('admin');
      return 'admin';
    }
    return null;
  });
  const [route, setRoute] = useState<HashRoute>(() => {
    const session = readSession() ?? ((typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? 'admin' : null);
    if (session) {
      return defaultAuthedRoute();
    }
    return parseHash(window.location.hash || '#/home');
  });
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
      // PK-WB-A3: #/studio/:id → единый check workspace (EditorWorkbench внутри App.tsx)
      if (next.kind === 'studio' && next.checkId) {
        localStorage.setItem('pk-workbench-surface', 'editor');
        const unified: HashRoute = { kind: 'check', checkId: next.checkId, view: 'studio' };
        navigateHash(unified);
        setRoute(unified);
        return;
      }
      if (next.kind === 'studio') {
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
      if (e.key === 'pk.auth.user') {
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
        // PK-WB-A3: initial mount с #/studio/:id → единый check workspace
        let resolved = guarded;
        if (guarded.kind === 'studio' && guarded.checkId) {
          localStorage.setItem('pk-workbench-surface', 'editor');
          resolved = { kind: 'check' as const, checkId: guarded.checkId, view: 'studio' };
        } else if (guarded.kind === 'studio') {
          resolved = { kind: 'home' as const };
        }
        if (formatHash(resolved) !== window.location.hash) {
          navigateHash(resolved);
        }
        setRoute(resolved);
      }
    }

    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    syncDocumentTitle(route);
  }, [route]);

  // MAP-FLASH: Ctrl+M → открыть Sanctuary Map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        navigateHash({ kind: 'sanctuary-map' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const startWithWired = useCallback(
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
          startWithWired(wired, title);
        }}
        onLogout={handleLogout}
        roleLabel={roleLabel}
      />
    );
  } else if (route.kind === 'admin' && canAccessAdmin(user)) {
    main = <SecOpsControlPure />;
  } else if (route.kind === 'control' && canAccessControl(user)) {
    main = <ControlPanel />;
  } else if (route.kind === 'control') {
    main = (
      <div className="dark h-screen w-screen flex items-center justify-center bg-[#080c16] text-white font-sans">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-rose-400 mb-2">403</h1>
          <p className="text-slate-400">Access Denied — admin_service only</p>
          <button
            onClick={() => go({ kind: 'home' })}
            className="mt-4 px-4 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  } else if (route.kind === 'dashboard') {
    main = <DashboardPage />;
  } else if (route.kind === 'studio') {
    // PK-WB-A3: #/studio/:id перенаправлен в #/checks/:id/studio.
    // Этот branch — safety net для #/studio без id (должен быть пойман выше).
    main = <EditorWorkbench checkId={route.checkId} />;
  } else if (route.kind === 'sanctuary-map') {
    // SANCTUARY-MAP: полноэкранный тактический радар Обители.
    main = <SanctuaryMap />;
  } else if (route.kind === 'lab') {
    main = (
      <LabWorkspace
        onBackHome={() => go({ kind: 'home' })}
        onLogout={handleLogout}
      />
    );
  } else if (route.kind === 'design-playground') {
    main = <DesignPlayground />;
  } else if (route.kind === 'design-admin') {
    main = (
      <Suspense fallback={<div className="dark h-screen w-screen flex items-center justify-center bg-[#080c16] text-slate-400 text-sm">Loading Admin Showcase…</div>}>
        <AdminShowcase />
      </Suspense>
    );
  } else if (route.kind === 'check') {
    const item = getCheck(route.checkId);
    main = item ? (
      <App
        // STU-RAILS B1/B2: key привязан и к instance id — при прямой hash-навигации
        // между проверками App пересоздаётся, чужой контекст не утекает.
        key={`${workspaceKey}:${item.check_id}`}
        checkId={item.check_id}
        initialWired={item.wired}
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
      // STU-RAILS B1: несуществующий id → честная ошибка, НЕ home и не чужой проект.
      <div className="dark h-screen w-screen flex items-center justify-center bg-[#080c16] text-white font-sans">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-rose-400 mb-2">404</h1>
          <p className="text-slate-300 mb-1">Проверка не найдена</p>
          <p className="text-slate-500 text-sm font-mono mb-4">{route.checkId}</p>
          <button
            onClick={() => go({ kind: 'history' })}
            className="px-4 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm"
          >
            К истории проверок
          </button>
        </div>
      </div>
    );
  } else {
    main = (
      <HomePage
        onOpenHistory={() => go({ kind: 'history' })}
        onOpenAdmin={() => go({ kind: 'admin' })}
        onOpenLab={() => go({ kind: 'lab' })}
        onOpenControl={() => go({ kind: 'control' })}
        onOpenDashboard={() => go({ kind: 'dashboard' })}
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
      <ProfileDrawer />
    </>
  );
}
