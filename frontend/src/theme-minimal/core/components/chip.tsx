import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme, CSSObject, Components, ComponentsVariants } from '@mui/material/styles';

import SvgIcon from '@mui/material/SvgIcon';
import { chipClasses } from '@mui/material/Chip';

import { colorKeys } from '../palette';

// ----------------------------------------------------------------------

export type ChipExtendVariant = { soft: true };
export type ChipExtendColor = { black: true; white: true };

type ChipVariants = ComponentsVariants<Theme>['MuiChip'];

const baseColors = ['default'] as const;
const allColors = [...baseColors, ...colorKeys.palette, ...colorKeys.common] as const;

const DIMENSIONS: Record<'small' | 'medium', CSSObject> = {
  small: { borderRadius: '6px' },
  medium: { borderRadius: '8px' },
};

const DeleteIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path fill="currentColor" fillRule="evenodd" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10M8.97 8.97a.75.75 0 0 1 1.06 0L12 10.94l1.97-1.97a.75.75 0 0 1 1.06 1.06L13.06 12l1.97 1.97a.75.75 0 0 1-1.06 1.06L12 13.06l-1.97 1.97a.75.75 0 0 1-1.06-1.06L10.94 12l-1.97-1.97a.75.75 0 0 1 0-1.06" clipRule="evenodd" />
  </SvgIcon>
);

const filledVariants = [
  {
    props: (props: any) => props.variant === 'filled' && props.color === 'default',
    style: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.filledStyles(theme, 'inherit'),
      [`&.${chipClasses.clickable}`]: { ...theme.mixins.filledStyles(theme, 'inherit', { hover: true }) },
    }),
  },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.variant === 'filled' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.filledStyles(theme, colorKey),
      [`&.${chipClasses.clickable}`]: { ...theme.mixins.filledStyles(theme, colorKey, { hover: true }) },
    }),
  })) satisfies ChipVariants),
] satisfies ChipVariants;

const outlinedVariants = [
  { props: (props: any) => props.variant === 'outlined', style: { borderColor: 'currentColor' } },
  {
    props: (props: any) => props.variant === 'outlined' && props.color === 'default',
    style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.buttonOutlined }),
  },
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.variant === 'outlined' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.common[colorKey] }),
  })) satisfies ChipVariants),
] satisfies ChipVariants;

const softVariants = [
  ...(allColors.map((colorKey) => ({
    props: (props: any) => props.variant === 'soft' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => {
      const currentColor = colorKey === 'default' ? 'inherit' : colorKey;
      return {
        ...theme.mixins.softStyles(theme, currentColor),
        [`&.${chipClasses.clickable}`]: { ...theme.mixins.softStyles(theme, currentColor, { hover: true }) },
      };
    },
  })) satisfies ChipVariants),
] satisfies ChipVariants;

const sizeVariants = [
  { props: (props: any) => props.size === 'small', style: { ...DIMENSIONS.small } },
  { props: (props: any) => props.size === 'medium', style: { ...DIMENSIONS.medium } },
] satisfies ChipVariants;

const disabledVariants = [
  {
    props: {},
    style: ({ theme }: { theme: Theme }) => ({
      [`&.${chipClasses.disabled}`]: {
        opacity: 1,
        color: theme.vars.palette.action.disabled,
        [`&:not(.${chipClasses.outlined})`]: { backgroundColor: theme.vars.palette.action.disabledBackground },
        [`&.${chipClasses.outlined}`]: { borderColor: theme.vars.palette.action.disabledBackground },
        [`& .${chipClasses.avatar}`]: {
          color: theme.vars.palette.action.disabled,
          backgroundColor: theme.vars.palette.action.disabledBackground,
          '& img': { opacity: theme.vars.palette.action.disabledOpacity },
        },
      },
    }),
  },
] satisfies ChipVariants;

const MuiChip: Components<Theme>['MuiChip'] = {
  defaultProps: { deleteIcon: <DeleteIcon />, variant: 'soft' },
  styleOverrides: {
    root: { variants: [...filledVariants, ...outlinedVariants, ...softVariants, ...sizeVariants, ...disabledVariants] },
    label: ({ theme }) => ({ fontWeight: theme.typography.fontWeightMedium }),
    icon: { color: 'currentColor' },
    deleteIcon: { opacity: 0.48, color: 'currentColor', '&:hover': { opacity: 0.8, color: 'currentColor' } },
  },
};

export const chip: Components<Theme> = { MuiChip };