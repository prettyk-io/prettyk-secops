import type { Theme, CSSObject, Components, ComponentsVariants } from '@mui/material/styles';

import { varAlpha } from '../../utils/minimal-shared';

import { fabClasses } from '@mui/material/Fab';
import { pxToRem } from '../../utils/minimal-shared';

// ----------------------------------------------------------------------

import { colorKeys } from '../palette';

export type FabExtendVariant = {
  outlined: true;
  outlinedExtended: true;
  soft: true;
  softExtended: true;
};
export type FabExtendColor = { black: true; white: true };

type FabVariants = ComponentsVariants<Theme>['MuiFab'];

const baseColors = ['default', 'inherit'] as const;
const allColors = [...baseColors, ...colorKeys.palette, ...colorKeys.common] as const;

const VARIANTS = {
  filled: ['circular', 'extended'],
  outlined: ['outlined', 'outlinedExtended'],
  soft: ['soft', 'softExtended'],
  extended: ['extended', 'outlinedExtended', 'softExtended'],
} as const;
const DIMENSIONS: Record<string, CSSObject> = {
  extendedSmall: { '--size': '36px', padding: '4px 8px', fontSize: pxToRem(13), lineHeight: 22 / 13 },
  extendedMedium: { '--size': '40px', padding: '6px 12px', fontSize: pxToRem(14), lineHeight: 24 / 14 },
  extendedLarge: { '--size': '48px', padding: '8px 16px', fontSize: pxToRem(15), lineHeight: 26 / 15 },
};

function isVariant<T extends string>(allowed: readonly T[], variant?: string): variant is T {
  return !!variant && allowed.includes(variant as T);
}

const filledVariants = [
  { props: (props: any) => isVariant(VARIANTS.filled, props.variant) && props.color === 'default',
    style: ({ theme }: { theme: Theme }) => ({ ...theme.mixins.filledStyles(theme, 'default', { hover: true }), boxShadow: theme.vars.customShadows.z8 }) },
  { props: (props: any) => isVariant(VARIANTS.filled, props.variant) && props.color === 'inherit',
    style: ({ theme }: { theme: Theme }) => ({ ...theme.mixins.filledStyles(theme, 'inherit', { hover: true }), boxShadow: theme.vars.customShadows.z8 }) },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => isVariant(VARIANTS.filled, props.variant) && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ ...theme.mixins.filledStyles(theme, colorKey, { hover: true }), boxShadow: theme.vars.customShadows.z8 }),
  })) satisfies FabVariants),
  ...(colorKeys.palette.map((colorKey) => ({
    props: (props: any) => isVariant(VARIANTS.filled, props.variant) && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ boxShadow: theme.vars.customShadows[colorKey] }),
  })) satisfies FabVariants),
] satisfies FabVariants;

const outlinedVariants = [
  { props: (props: any) => isVariant(VARIANTS.outlined, props.variant),
    style: ({ theme }: { theme: Theme }) => ({
      borderWidth: 1, boxShadow: 'none', borderStyle: 'solid', backgroundColor: 'transparent',
      borderColor: varAlpha('currentColor', theme.vars.opacity.outlined.border),
      '&:hover': { borderColor: 'currentColor', boxShadow: '0 0 0 0.75px currentColor',
        backgroundColor: varAlpha('currentColor', theme.vars.palette.action.hoverOpacity) },
    }) },
  { props: (props: any) => isVariant(VARIANTS.outlined, props.variant) && (props.color === 'default' || props.color === 'inherit'),
    style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.buttonOutlined, '&:hover': { backgroundColor: theme.vars.palette.action.hover } }) },
  { props: (props: any) => isVariant(VARIANTS.outlined, props.variant) && props.color === 'default',
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.action.active }) },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => isVariant(VARIANTS.outlined, props.variant) && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.common[colorKey] }),
  })) satisfies FabVariants),
  ...(colorKeys.palette.map((colorKey) => ({
    props: (props: any) => isVariant(VARIANTS.outlined, props.variant) && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette[colorKey].main }),
  })) satisfies FabVariants),
] satisfies FabVariants;

const softVariants = [
  ...(allColors.map((colorKey) => ({
    props: (props: any) => isVariant(VARIANTS.soft, props.variant) && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ ...theme.mixins.softStyles(theme, colorKey, { hover: true }) }),
  })) satisfies FabVariants),
] satisfies FabVariants;

const sizeVariants = [
  { props: (props: any) => isVariant(VARIANTS.extended, props.variant),
    style: ({ theme }: { theme: Theme }) => ({ width: 'auto', height: 'auto', gap: theme.spacing(1), minWidth: 'var(--size)', minHeight: 'var(--size)', borderRadius: 'calc(var(--size) / 2)' }) },
  { props: (props: any) => isVariant(VARIANTS.extended, props.variant) && props.size === 'small', style: { ...DIMENSIONS.extendedSmall } },
  { props: (props: any) => isVariant(VARIANTS.extended, props.variant) && props.size === 'medium', style: { ...DIMENSIONS.extendedMedium } },
  { props: (props: any) => isVariant(VARIANTS.extended, props.variant) && props.size === 'large', style: { ...DIMENSIONS.extendedLarge } },
] satisfies FabVariants;

const disabledVariants = [
  { props: (props: any) => isVariant(VARIANTS.outlined, props.variant),
    style: ({ theme }: { theme: Theme }) => ({ [`&.${fabClasses.disabled}`]: { backgroundColor: 'transparent', borderColor: theme.vars.palette.action.disabledBackground } }) },
] satisfies FabVariants;

const MuiFab: Components<Theme>['MuiFab'] = {
  defaultProps: { color: 'primary', size: 'medium' },
  styleOverrides: { root: { '&:hover': { boxShadow: 'none' }, variants: [...filledVariants, ...outlinedVariants, ...softVariants, ...sizeVariants, ...disabledVariants] } },
};

export const fab: Components<Theme> = { MuiFab };