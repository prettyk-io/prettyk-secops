export * from './core';
export * from './theme-config';
export * from './theme-provider';
export * from './MinimalThemeAdapter';
export * from './create-theme';
export type * from './types';

// Convenience: a fully-resolved Theme for drop-in use (Flash F3, Design Showcase, etc.)
import { createTheme } from './create-theme';
export const minimalTheme = createTheme();
