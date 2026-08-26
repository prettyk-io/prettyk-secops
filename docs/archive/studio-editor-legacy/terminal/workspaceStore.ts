/**
 * PK-EC: Workspace Store — unified state for Workbench panels.
 * Управляет BottomDrawer, контекстной панелью, Monaco cursor и статус-баром.
 */
import { create } from 'zustand';

export interface WorkspaceStore {
  // Bottom Drawer
  bottomDrawer: {
    open: boolean;
    hasErrors: boolean;
    isRunning: boolean;
  };
  openBottomDrawer: () => void;
  closeBottomDrawer: () => void;
  toggleBottomDrawer: () => void;
  setBottomDrawerErrors: (hasErrors: boolean) => void;
  setBottomDrawerRunning: (isRunning: boolean) => void;

  // Status Bar
  cursor: { line: number; column: number };
  setCursor: (line: number, column: number) => void;

  // Context Panel
  contextPanelWidth: number;
  setContextPanelWidth: (w: number) => void;
  currentConstructor: string;
  setCurrentConstructor: (text: string) => void;

  // War Room
  warRoom: boolean;
  setWarRoom: (active: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  bottomDrawer: { open: false, hasErrors: false, isRunning: false },
  openBottomDrawer: () => set((s) => ({ bottomDrawer: { ...s.bottomDrawer, open: true } })),
  closeBottomDrawer: () => set((s) => ({ bottomDrawer: { ...s.bottomDrawer, open: false } })),
  toggleBottomDrawer: () => set((s) => ({ bottomDrawer: { ...s.bottomDrawer, open: !s.bottomDrawer.open } })),
  setBottomDrawerErrors: (hasErrors) => set((s) => ({ bottomDrawer: { ...s.bottomDrawer, hasErrors } })),
  setBottomDrawerRunning: (isRunning) => set((s) => ({ bottomDrawer: { ...s.bottomDrawer, isRunning } })),

  cursor: { line: 1, column: 1 },
  setCursor: (line, column) => set({ cursor: { line, column } }),

  contextPanelWidth: 300,
  setContextPanelWidth: (w) => set({ contextPanelWidth: w }),
  currentConstructor: '',
  setCurrentConstructor: (text) => set({ currentConstructor: text }),

  warRoom: false,
  setWarRoom: (active) => set({ warRoom: active }),
}));