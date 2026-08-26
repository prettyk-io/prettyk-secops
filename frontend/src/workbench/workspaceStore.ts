/**
 * Workspace Store (PK-EC-2)
 *
 * Single source of truth for Editor Workbench layout state:
 * - 3-panel layout (Left Explorer, Center Monaco, Right Context)
 * - Bottom drawer (Terminal / Telemetry / Output)
 * - Panel widths, drawer height, density, and active tabs
 * - LocalStorage persistence with safe fallback
 */

import { create } from 'zustand';

export type WorkspaceDensity = 'compact' | 'comfortable';

export interface PanelState {
  open: boolean;
  width: number;
}

export interface RightPanelState extends PanelState {
  activeTab: string;
}

export interface BottomDrawerState {
  open: boolean;
  height: number;
  activeTab: string;
}

export interface ActiveCheckInfo {
  checkId: string | null;
  checkTitle?: string;
  targetUrl?: string;
}

export interface WorkspaceState {
  leftPanel: PanelState;
  rightPanel: RightPanelState;
  bottomDrawer: BottomDrawerState;
  density: WorkspaceDensity;
  activeCheck: ActiveCheckInfo;
  /** ER-4: последняя выбранная сущность в Editor Explorer (персистится между поверхностями). */
  lastStudioTabId: string | null;

  // Actions
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBottom: () => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  resizeLeft: (width: number) => void;
  resizeRight: (width: number) => void;
  resizeBottom: (height: number) => void;
  setActiveTab: (panel: 'right' | 'bottom', tab: string) => void;
  setRightTab: (tab: string) => void;
  setBottomTab: (tab: string) => void;
  setDensity: (density: WorkspaceDensity) => void;
  setActiveCheck: (check: ActiveCheckInfo | null) => void;
  setLastStudioTabId: (tabId: string | null) => void;
  resetLayout: () => void;
}

const STORAGE_KEY = 'pk.editor.workspace.v1';

const DEFAULT_LAYOUT = {
  leftPanel: { open: true, width: 240 },
  rightPanel: { open: true, width: 320, activeTab: 'context' },
  bottomDrawer: { open: false, height: 240, activeTab: 'terminal' },
  density: 'comfortable' as WorkspaceDensity,
};

function loadStoredLayout(): typeof DEFAULT_LAYOUT & { lastStudioTabId: string | null } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_LAYOUT, lastStudioTabId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT, lastStudioTabId: null };
    const parsed = JSON.parse(raw);
    return {
      leftPanel: {
        open: typeof parsed.leftPanel?.open === 'boolean' ? parsed.leftPanel.open : DEFAULT_LAYOUT.leftPanel.open,
        width: typeof parsed.leftPanel?.width === 'number' ? Math.max(160, Math.min(500, parsed.leftPanel.width)) : DEFAULT_LAYOUT.leftPanel.width,
      },
      rightPanel: {
        open: typeof parsed.rightPanel?.open === 'boolean' ? parsed.rightPanel.open : DEFAULT_LAYOUT.rightPanel.open,
        width: typeof parsed.rightPanel?.width === 'number' ? Math.max(200, Math.min(700, parsed.rightPanel.width)) : DEFAULT_LAYOUT.rightPanel.width,
        activeTab: typeof parsed.rightPanel?.activeTab === 'string' ? parsed.rightPanel.activeTab : DEFAULT_LAYOUT.rightPanel.activeTab,
      },
      bottomDrawer: {
        open: typeof parsed.bottomDrawer?.open === 'boolean' ? parsed.bottomDrawer.open : DEFAULT_LAYOUT.bottomDrawer.open,
        height: typeof parsed.bottomDrawer?.height === 'number' ? Math.max(120, Math.min(600, parsed.bottomDrawer.height)) : DEFAULT_LAYOUT.bottomDrawer.height,
        activeTab: typeof parsed.bottomDrawer?.activeTab === 'string' ? parsed.bottomDrawer.activeTab : DEFAULT_LAYOUT.bottomDrawer.activeTab,
      },
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      lastStudioTabId: typeof parsed.lastStudioTabId === 'string' ? parsed.lastStudioTabId : null,
    };
  } catch {
    return { ...DEFAULT_LAYOUT, lastStudioTabId: null };
  }
}

function persistLayout(state: Pick<WorkspaceState, 'leftPanel' | 'rightPanel' | 'bottomDrawer' | 'density' | 'lastStudioTabId'>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload = {
      leftPanel: state.leftPanel,
      rightPanel: state.rightPanel,
      bottomDrawer: state.bottomDrawer,
      density: state.density,
      lastStudioTabId: state.lastStudioTabId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

const initialPersisted = loadStoredLayout();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  leftPanel: initialPersisted.leftPanel,
  rightPanel: initialPersisted.rightPanel,
  bottomDrawer: initialPersisted.bottomDrawer,
  density: initialPersisted.density,
  activeCheck: { checkId: null },
  lastStudioTabId: initialPersisted.lastStudioTabId,

  toggleLeft: () => {
    set((state) => {
      const next = { ...state.leftPanel, open: !state.leftPanel.open };
      const nextState = { leftPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  toggleRight: () => {
    set((state) => {
      const next = { ...state.rightPanel, open: !state.rightPanel.open };
      const nextState = { rightPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  toggleBottom: () => {
    set((state) => {
      const next = { ...state.bottomDrawer, open: !state.bottomDrawer.open };
      const nextState = { bottomDrawer: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setLeftOpen: (open: boolean) => {
    set((state) => {
      const next = { ...state.leftPanel, open };
      const nextState = { leftPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setRightOpen: (open: boolean) => {
    set((state) => {
      const next = { ...state.rightPanel, open };
      const nextState = { rightPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setBottomOpen: (open: boolean) => {
    set((state) => {
      const next = { ...state.bottomDrawer, open };
      const nextState = { bottomDrawer: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  resizeLeft: (width: number) => {
    const clamped = Math.max(160, Math.min(500, width));
    set((state) => {
      const next = { ...state.leftPanel, width: clamped };
      const nextState = { leftPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  resizeRight: (width: number) => {
    const clamped = Math.max(200, Math.min(700, width));
    set((state) => {
      const next = { ...state.rightPanel, width: clamped };
      const nextState = { rightPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  resizeBottom: (height: number) => {
    const clamped = Math.max(120, Math.min(600, height));
    set((state) => {
      const next = { ...state.bottomDrawer, height: clamped };
      const nextState = { bottomDrawer: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setActiveTab: (panel: 'right' | 'bottom', tab: string) => {
    if (panel === 'right') {
      get().setRightTab(tab);
    } else {
      get().setBottomTab(tab);
    }
  },

  setRightTab: (activeTab: string) => {
    set((state) => {
      const next = { ...state.rightPanel, activeTab };
      const nextState = { rightPanel: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setBottomTab: (activeTab: string) => {
    set((state) => {
      const next = { ...state.bottomDrawer, activeTab };
      const nextState = { bottomDrawer: next };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setDensity: (density: WorkspaceDensity) => {
    set((state) => {
      const nextState = { density };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  setActiveCheck: (check: ActiveCheckInfo | null) => {
    set({ activeCheck: check ?? { checkId: null } });
  },

  setLastStudioTabId: (tabId: string | null) => {
    set((state) => {
      const nextState = { lastStudioTabId: tabId };
      persistLayout({ ...state, ...nextState });
      return nextState;
    });
  },

  resetLayout: () => {
    set((state) => ({
      leftPanel: { ...DEFAULT_LAYOUT.leftPanel },
      rightPanel: { ...DEFAULT_LAYOUT.rightPanel },
      bottomDrawer: { ...DEFAULT_LAYOUT.bottomDrawer },
      density: DEFAULT_LAYOUT.density,
    }));
    persistLayout({ ...DEFAULT_LAYOUT, lastStudioTabId: get().lastStudioTabId });
  },
}));
