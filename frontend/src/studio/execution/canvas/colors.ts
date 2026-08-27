/**
 * Theme-aware canvas colors.
 */

export const OBSIDIAN = {
  bg: '#0B1120',
  gridDot: 'rgba(30, 41, 59, 0.7)',
  gridLine: 'rgba(30, 41, 59, 0.3)',
  text: '#E2E8F0',
  textMuted: '#64748B',
  healthBarBg: 'rgba(15, 23, 42, 0.7)',
  healthGreen: '#22C55E',
  healthYellow: '#F59E0B',
  healthRed: '#EF4444',
  nodeStatus: {
    idle: '#475569',
    targeted: '#F59E0B',
    penetrated: '#EF4444',
    shielded: '#3B82F6',
  },
  beamCore: '#FFFFFF',
  beamGlow: {
    normal: '#22D3EE',
    critical: '#EF4444',
  },
  hitFlash: 'rgba(255, 255, 255, 0.6)',
};

export const STUDIO_WHITE = {
  bg: '#F8FAFC',
  gridDot: 'rgba(148, 163, 184, 0.5)',
  gridLine: 'rgba(148, 163, 184, 0.15)',
  text: '#1E293B',
  textMuted: '#64748B',
  healthBarBg: 'rgba(226, 232, 240, 0.8)',
  healthGreen: '#16A34A',
  healthYellow: '#D97706',
  healthRed: '#DC2626',
  nodeStatus: {
    idle: '#94A3B8',
    targeted: '#F59E0B',
    penetrated: '#DC2626',
    shielded: '#2563EB',
  },
  beamCore: '#0F172A',
  beamGlow: {
    normal: '#06B6D4',
    critical: '#DC2626',
  },
  hitFlash: 'rgba(15, 23, 42, 0.5)',
};

export type ThemeColors = typeof OBSIDIAN;

export function resolveTheme(isLight: boolean): ThemeColors {
  return isLight ? STUDIO_WHITE : OBSIDIAN;
}