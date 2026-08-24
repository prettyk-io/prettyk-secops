import type { Theme, CSSObject, Components, ComponentsVariants } from '@mui/material/styles';

import { varAlpha } from '../../utils/minimal-shared';

import { buttonClasses } from '@mui/material/Button';

import { colorKeys } from '../palette';

// ----------------------------------------------------------------------

export type ButtonExtendSize = { xLarge: true };
export type ButtonExtendVariant = { soft: true };
export type ButtonExtendColor = { black: true; white: true };

type ButtonVariants = ComponentsVariants<Theme>['MuiButton'];

const baseColors = ['inherit'] as const;
const allColors = [...baseColors, ...colorKeys.palette, ...colorKeys.common] as const;

const DIMENSIONS: Record<'small' | 'medium' | 'large' | 'xLarge', CSSObject> = {
  small: { '--padding-y': '4px', '--padding-x': '8px', minHeight: 30, lineHeight: 22 / 13 },
  medium: { '--padding-y': '6px', '--padding-x': '12px', minHeight: 36, lineHeight: 24 / 14 },
  large: { '--padding-y': '8px', '--padding-x': '16px', minHeight: 48, lineHeight: 26 / 15 },
  xLarge: { minHeight: 56 },
};

/* **********************************************************************
 * Variants
 * **********************************************************************/
const containedVariants = [
  {
    props: (props: any) => props.variant === 'contained' && props.color === 'inherit',
    style: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.filledStyles(theme, 'inherit', {
        hover: { boxShadow: theme.vars.customShadows.z8 },
      }),
    }),
  },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.variant === 'contained' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.filledStyles(theme, colorKey, {
        hover: { boxShadow: theme.vars.customShadows.z8 },
      }),
    }),
  })) satisfies ButtonVariants),
  ...(colorKeys.palette.map((colorKey) => ({
    props: (props: any) => props.variant === 'contained' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({
      '&:hover': { boxShadow: theme.vars.customShadows[colorKey] },
    }),
  })) satisfies ButtonVariants),
] satisfies ButtonVariants;

const outlinedVariants = [
  {
    props: (props: any) => props.variant === 'outlined',
    style: ({ theme }: { theme: Theme }) => ({
      borderColor: varAlpha('currentColor', theme.vars.opacity.outlined.border),
      '&:hover': {
        borderColor: 'currentColor',
        boxShadow: '0 0 0 0.75px currentColor',
        backgroundColor: varAlpha('currentColor', theme.vars.palette.action.hoverOpacity),
      },
    }),
  },
  {
    props: (props: any) => props.variant === 'outlined' && props.color === 'inherit',
    style: ({ theme }: { theme: Theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
      '&:hover': { backgroundColor: theme.vars.palette.action.hover },
    }),
  },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.variant === 'outlined' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.common[colorKey] }),
  })) satisfies ButtonVariants),
] satisfies ButtonVariants;

const textVariants = [
  {
    props: (props: any) => props.variant === 'text',
    style: ({ theme }: { theme: Theme }) => ({
      '&:hover': { backgroundColor: varAlpha('currentColor', theme.vars.palette.action.hoverOpacity) },
    }),
  },
  {
    props: (props: any) => props.variant === 'text' && props.color === 'inherit',
    style: ({ theme }: { theme: Theme }) => ({
      '&:hover': { backgroundColor: theme.vars.palette.action.hover },
    }),
  },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.variant === 'text' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.common[colorKey] }),
  })) satisfies ButtonVariants),
] satisfies ButtonVariants;

const softVariants = [
  ...(allColors.map((colorKey) => ({
    props: (props: any) => props.variant === 'soft' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.softStyles(theme, colorKey, { hover: true }),
    }),
  })) satisfies ButtonVariants),
] satisfies ButtonVariants;

const sizeVariants = [
  { props: {}, style: { padding: 'var(--padding-y) var(--padding-x)' } },
  { props: (props: any) => props.size === 'small', style: { ...DIMENSIONS.small } },
  { props: (props: any) => props.size === 'medium', style: { ...DIMENSIONS.medium } },
  { props: (props: any) => props.size === 'large' || props.size === 'xLarge', style: { ...DIMENSIONS.large } },
  { props: (props: any) => props.size === 'xLarge', style: ({ theme }: { theme: Theme }) => ({ ...DIMENSIONS.xLarge, fontSize: theme.typography.pxToRem(15) }) },
  { props: (props: any) => props.variant === 'outlined', style: { paddingTop: 'calc(var(--padding-y) - 4px)', paddingBottom: 'calc(var(--padding-y) - 4px)' } },
  { props: (props: any) => props.variant === 'text', style: { paddingLeft: 'calc(var(--padding-x) - 4px)', paddingRight: 'calc(var(--padding-x) - 4px)' } },
] satisfies ButtonVariants;

const disabledVariants = [
  {
    props: (props: any) => props.variant === 'soft',
    style: ({ theme }: { theme: Theme }) => ({
      [`&.${buttonClasses.disabled}`]: { backgroundColor: theme.vars.palette.action.disabledBackground },
    }),
  },
] satisfies ButtonVariants;

/* **********************************************************************
 * Components
 * **********************************************************************/
const MuiButtonBase: Components<Theme>['MuiButtonBase'] = {
  styleOverrides: {
    root: ({ theme }) => ({ fontFamily: theme.typography.fontFamily }),
  },
};

const MuiButton: Components<Theme>['MuiButton'] = {
  defaultProps: { color: 'inherit', disableElevation: true },
  styleOverrides: {
    root: {
      variants: [...containedVariants, ...outlinedVariants, ...textVariants, ...softVariants, ...sizeVariants, ...disabledVariants],
    },
  },
};

/* **********************************************************************
 * Export
 * **********************************************************************/
export const button: Components<Theme> = { MuiButton, MuiButtonBase };