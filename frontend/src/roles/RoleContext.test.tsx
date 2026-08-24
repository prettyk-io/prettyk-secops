/**
 * Тесты RoleContext & RoleGuard
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleContext, RoleGuard, CanAccessAdmin, CanUseDebugMode } from './RoleContext';
import type { RoleCaps } from '../shell/auth';

const mockCapsFull: RoleCaps = {
  role: 'admin_ib',
  displayName: 'Администратор ИБ',
  canAccessAdmin: true,
  canSelectEmergency: true,
  canSelectPreRelease: true,
  canGenerateAct: true,
  canOverrideScanUrl: true,
  canUseDebugMode: true,
  canSelectWebswing: true,
  canimportWired: true,
};

const mockCapsLimited: RoleCaps = {
  ...mockCapsFull,
  role: 'expert_ib',
  displayName: 'Эксперт ИБ',
  canAccessAdmin: false,
  canUseDebugMode: false,
};

describe('RoleContext & RoleGuard', () => {
  it('renders children when policy is satisfied', () => {
    render(
      <RoleContext.Provider value={mockCapsFull}>
        <RoleGuard policy={CanAccessAdmin}>
          <div data-testid="admin-panel-ok">Admin Panel</div>
        </RoleGuard>
      </RoleContext.Provider>
    );
    expect(screen.getByTestId('admin-panel-ok')).toBeDefined();
  });

  it('renders fallback when policy is not satisfied', () => {
    render(
      <RoleContext.Provider value={mockCapsLimited}>
        <RoleGuard policy={CanAccessAdmin} fallback={<div data-testid="fallback-denied">Denied</div>}>
          <div data-testid="admin-panel-hidden">Admin Panel</div>
        </RoleGuard>
      </RoleContext.Provider>
    );
    expect(screen.queryByTestId('admin-panel-hidden')).toBeNull();
    expect(screen.getByTestId('fallback-denied')).toBeDefined();
  });

  it('CanAccessAdmin and CanUseDebugMode policies work with RoleGuard', () => {
    render(
      <RoleContext.Provider value={mockCapsLimited}>
        <RoleGuard policy={CanAccessAdmin} fallback={<div data-testid="no-admin">No Admin</div>}>
          <div data-testid="admin-content">Admin Content</div>
        </RoleGuard>
        <RoleGuard policy={CanUseDebugMode} fallback={<div data-testid="no-debug">No Debug</div>}>
          <div data-testid="debug-content">Debug Content</div>
        </RoleGuard>
      </RoleContext.Provider>
    );
    expect(screen.queryByTestId('admin-content')).toBeNull();
    expect(screen.getByTestId('no-admin')).toBeDefined();
    expect(screen.queryByTestId('debug-content')).toBeNull();
    expect(screen.getByTestId('no-debug')).toBeDefined();
  });
});
