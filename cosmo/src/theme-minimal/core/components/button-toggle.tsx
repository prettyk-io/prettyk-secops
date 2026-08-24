import type { Theme, CSSObject, Components, ComponentsVariants } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { toggleButtonClasses } from '@mui/material/ToggleButton';
import { colorKeys } from '../palette';

type ToggleButtonVariants = ComponentsVariants<Theme>['MuiToggleButton'];

const SIZES = ['small', 'medium', 'large'] as const;
const DIMENSIONS: Record<(typeof SIZES)[number] | 'group', CSSObject> = {
  small: { '--size': '40px', '--padding': '7px' },
  medium: { '--size': '48px', '--padding': '11px' },
  large: { '--size': '56px', '--padding': '15px' },
  group: { '--group-gap': '4px' },
};

const colorVariants = [
  ...(colorKeys.palette.map((colorKey) => ({
    props: (props: any) => props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({
      '&:hover': { borderColor: varAlpha(theme.vars.palette[colorKey].mainChannel, theme.vars.opacity.outlined.border), backgroundColor: varAlpha(theme.vars.palette[colorKey].mainChannel, theme.vars.palette.action.hoverOpacity) },
    }),
  })) satisfies ToggleButtonVariants),
] satisfies ToggleButtonVariants;

const sizeVariants = [
  ...(SIZES.map((size) => ({ props: (props: any) => props.size === size, style: { ...DIMENSIONS[size] } })) satisfies ToggleButtonVariants),
] satisfies ToggleButtonVariants;

const MuiToggleButton: Components<Theme>['MuiToggleButton'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      gap: 8, minWidth: 'var(--size)', minHeight: 'var(--size)', padding: 'var(--padding)',
      fontWeight: theme.typography.fontWeightSemiBold,
      variants: [...colorVariants, ...sizeVariants, {
        props: {}, style: ({ theme: t }: { theme: Theme }) => ({
          [`&.${toggleButtonClasses.selected}`]: { borderColor: 'currentColor', boxShadow: '0 0 0 0.75px currentColor' },
          [`&.${toggleButtonClasses.disabled}`]: { boxShadow: 'none', color: t.vars.palette.action.disabled, borderColor: t.vars.palette.action.disabledBackground },
        }),
      }],
    }),
  },
};

const MuiToggleButtonGroup: Components<Theme>['MuiToggleButtonGroup'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({ ...DIMENSIONS.group, gap: 'var(--group-gap)', padding: 'var(--group-gap)', border: `1px solid ${theme.vars.palette.shared.paperOutlined}` }),
    grouped: () => ({ border: 'none', borderRadius: 'inherit', padding: 'calc(var(--padding) - var(--group-gap))', minWidth: 'calc(var(--size) - (var(--group-gap) * 2 + 2px))', minHeight: 'calc(var(--size) - (var(--group-gap) * 2 + 2px))' }),
  },
};

export const toggleButton: Components<Theme> = { MuiToggleButton, MuiToggleButtonGroup };