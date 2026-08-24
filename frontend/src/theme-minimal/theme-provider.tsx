import type { ThemeOptions } from './types';
import { MinimalThemeAdapter, type MinimalThemeAdapterProps } from './MinimalThemeAdapter';

export type ThemeProviderProps = MinimalThemeAdapterProps;

export function ThemeProvider(props: ThemeProviderProps) {
  return <MinimalThemeAdapter {...props} />;
}
