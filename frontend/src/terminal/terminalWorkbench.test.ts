import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

describe('PK-EC-6..9: Terminal Workbench Store', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      bottomDrawer: { open: false, hasErrors: false, isRunning: false },
      cursor: { line: 1, column: 1 },
      contextPanelWidth: 300,
      currentConstructor: '',
      warRoom: false,
    });
  });

  it('manages bottom drawer open/close/toggle', () => {
    const store = useWorkspaceStore.getState();
    expect(store.bottomDrawer.open).toBe(false);

    store.openBottomDrawer();
    expect(useWorkspaceStore.getState().bottomDrawer.open).toBe(true);

    store.closeBottomDrawer();
    expect(useWorkspaceStore.getState().bottomDrawer.open).toBe(false);

    store.toggleBottomDrawer();
    expect(useWorkspaceStore.getState().bottomDrawer.open).toBe(true);
  });

  it('sets bottom drawer error and running flags', () => {
    const store = useWorkspaceStore.getState();
    store.setBottomDrawerErrors(true);
    expect(useWorkspaceStore.getState().bottomDrawer.hasErrors).toBe(true);

    store.setBottomDrawerRunning(true);
    expect(useWorkspaceStore.getState().bottomDrawer.isRunning).toBe(true);
  });

  it('manages cursor line and column coordinates', () => {
    const store = useWorkspaceStore.getState();
    store.setCursor(42, 18);
    expect(useWorkspaceStore.getState().cursor).toEqual({ line: 42, column: 18 });
  });

  it('manages context panel width and current constructor string', () => {
    const store = useWorkspaceStore.getState();
    store.setContextPanelWidth(360);
    expect(useWorkspaceStore.getState().contextPanelWidth).toBe(360);

    store.setCurrentConstructor('Component | Action | Target');
    expect(useWorkspaceStore.getState().currentConstructor).toBe('Component | Action | Target');
  });

  it('manages warRoom flag', () => {
    const store = useWorkspaceStore.getState();
    expect(store.warRoom).toBe(false);
    store.setWarRoom(true);
    expect(useWorkspaceStore.getState().warRoom).toBe(true);
  });
});
