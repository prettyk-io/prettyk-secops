// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    // BROWSER-STUDIO-2: браузер в полноразмерном Desk, шторка закрыта по умолчанию.
    expect(s.rightPanel.open).toBe(false);
    expect(s.rightPanel.width).toBe(480);
    expect(s.rightPanel.activeTab).toBe('browser');
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
    expect(useWorkspaceStore.getState().rightPanel.open).toBe(true);

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

    const stored = JSON.parse(localStorage.getItem('pk.editor.workspace.v2') || '{}');
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
    const stored = JSON.parse(localStorage.getItem('pk.editor.workspace.v2') || '{}');
    expect(stored.lastStudioTabId).toBe('scenario:2');

    s.setLastStudioTabId(null);
    expect(useWorkspaceStore.getState().lastStudioTabId).toBeNull();
  });
});

describe('BROWSER-STUDIO-3: migration from v1 (browser-in-shтурка) to v2', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('drops stale v1 rightPanel.open:true + browser tab and removes the legacy key', async () => {
    // Застарелый v1 layout у «рецидивного» пользователя: шторка с браузером открыта.
    localStorage.setItem(
      'pk.editor.workspace.v1',
      JSON.stringify({
        leftPanel: { open: true, width: 240 },
        rightPanel: { open: true, width: 320, activeTab: 'browser' },
        bottomDrawer: { open: false, height: 240, activeTab: 'terminal' },
      }),
    );

    // Свежий импорт модуля = «монтирование Editor» после обновления.
    const { useWorkspaceStore } = await import('./workspaceStore');
    const s = useWorkspaceStore.getState();

    // Шторка-браузер не воскресла: дефолт open:false.
    expect(s.rightPanel.open).toBe(false);
    // Застарелый ключ вычищен — браузер живёт только в полноразмерном Desk (v2).
    expect(localStorage.getItem('pk.editor.workspace.v1')).toBeNull();
  });

  it('keeps the new v2 default when no key is present', async () => {
    const { useWorkspaceStore } = await import('./workspaceStore');
    expect(useWorkspaceStore.getState().rightPanel.open).toBe(false);
    expect(useWorkspaceStore.getState().rightPanel.activeTab).toBe('browser');
  });

  it('preserves an explicit v2 reveal across a reload', async () => {
    // Пользователь явно раскрыл шторку (toggleRight) с не-браузерной вкладкой.
    localStorage.setItem(
      'pk.editor.workspace.v2',
      JSON.stringify({
        leftPanel: { open: true, width: 240 },
        rightPanel: { open: true, width: 480, activeTab: 'inspector' },
        bottomDrawer: { open: false, height: 240, activeTab: 'terminal' },
      }),
    );

    const { useWorkspaceStore } = await import('./workspaceStore');
    expect(useWorkspaceStore.getState().rightPanel.open).toBe(true);
  });
});
