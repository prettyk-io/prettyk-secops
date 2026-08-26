// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

describe('useWorkspaceStore (PK-EC-2)', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.getState().resetLayout();
  });

  it('initializes with default layout values', () => {
    const s = useWorkspaceStore.getState();
    expect(s.leftPanel.open).toBe(true);
    expect(s.leftPanel.width).toBe(240);
    expect(s.rightPanel.open).toBe(true);
    expect(s.rightPanel.width).toBe(320);
    expect(s.rightPanel.activeTab).toBe('context');
    expect(s.bottomDrawer.open).toBe(false);
    expect(s.bottomDrawer.height).toBe(240);
    expect(s.bottomDrawer.activeTab).toBe('terminal');
    expect(s.density).toBe('comfortable');
    expect(s.activeCheck.checkId).toBeNull();
  });

  it('toggles left and right panels and bottom drawer', () => {
    const s = useWorkspaceStore.getState();
    s.toggleLeft();
    expect(useWorkspaceStore.getState().leftPanel.open).toBe(false);
    s.toggleLeft();
    expect(useWorkspaceStore.getState().leftPanel.open).toBe(true);

    s.toggleRight();
    expect(useWorkspaceStore.getState().rightPanel.open).toBe(false);

    s.toggleBottom();
    expect(useWorkspaceStore.getState().bottomDrawer.open).toBe(true);
  });

  it('resizes panels within bounds and clamps invalid values', () => {
    const s = useWorkspaceStore.getState();
    s.resizeLeft(300);
    expect(useWorkspaceStore.getState().leftPanel.width).toBe(300);

    // Clamping min / max for left
    s.resizeLeft(50);
    expect(useWorkspaceStore.getState().leftPanel.width).toBe(160);
    s.resizeLeft(1000);
    expect(useWorkspaceStore.getState().leftPanel.width).toBe(500);

    // Clamping min / max for right
    s.resizeRight(400);
    expect(useWorkspaceStore.getState().rightPanel.width).toBe(400);
    s.resizeRight(50);
    expect(useWorkspaceStore.getState().rightPanel.width).toBe(200);
    s.resizeRight(1200);
    expect(useWorkspaceStore.getState().rightPanel.width).toBe(700);

    // Clamping min / max for bottom drawer
    s.resizeBottom(350);
    expect(useWorkspaceStore.getState().bottomDrawer.height).toBe(350);
    s.resizeBottom(50);
    expect(useWorkspaceStore.getState().bottomDrawer.height).toBe(120);
    s.resizeBottom(1000);
    expect(useWorkspaceStore.getState().bottomDrawer.height).toBe(600);
  });

  it('sets active tab on right panel and bottom drawer', () => {
    const s = useWorkspaceStore.getState();
    s.setRightTab('telemetry');
    expect(useWorkspaceStore.getState().rightPanel.activeTab).toBe('telemetry');

    s.setActiveTab('right', 'inspector');
    expect(useWorkspaceStore.getState().rightPanel.activeTab).toBe('inspector');

    s.setBottomTab('logs');
    expect(useWorkspaceStore.getState().bottomDrawer.activeTab).toBe('logs');

    s.setActiveTab('bottom', 'traces');
    expect(useWorkspaceStore.getState().bottomDrawer.activeTab).toBe('traces');
  });

  it('updates density and active check metadata', () => {
    const s = useWorkspaceStore.getState();
    s.setDensity('compact');
    expect(useWorkspaceStore.getState().density).toBe('compact');

    s.setActiveCheck({
      checkId: 'chk-123',
      checkTitle: 'JWT Authorization Bypass Check',
      targetUrl: 'https://api.example.com',
    });
    expect(useWorkspaceStore.getState().activeCheck.checkId).toBe('chk-123');
    expect(useWorkspaceStore.getState().activeCheck.checkTitle).toBe('JWT Authorization Bypass Check');
  });

  it('persists layout state to localStorage', () => {
    const s = useWorkspaceStore.getState();
    s.resizeLeft(280);
    s.setDensity('compact');
    s.setRightTab('browser');

    const stored = JSON.parse(localStorage.getItem('pk.editor.workspace.v1') || '{}');
    expect(stored.leftPanel?.width).toBe(280);
    expect(stored.density).toBe('compact');
    expect(stored.rightPanel?.activeTab).toBe('browser');
  });

  it('ER-4: persists and restores the last selected entity (lastStudioTabId)', () => {
    const s = useWorkspaceStore.getState();
    expect(s.lastStudioTabId).toBeNull();

    s.setLastStudioTabId('scenario:2');
    expect(useWorkspaceStore.getState().lastStudioTabId).toBe('scenario:2');

    // Persisted under the same storage key
    const stored = JSON.parse(localStorage.getItem('pk.editor.workspace.v1') || '{}');
    expect(stored.lastStudioTabId).toBe('scenario:2');

    s.setLastStudioTabId(null);
    expect(useWorkspaceStore.getState().lastStudioTabId).toBeNull();
  });
});
