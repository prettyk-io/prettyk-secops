import type { Theme, Components, ComponentsVariants } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { buttonGroupClasses } from '@mui/material/ButtonGroup';
import { colorKeys } from '../palette';

export type ButtonGroupExtendVariant = { soft: true };
export type ButtonGroupExtendColor = { black: true; white: true };
type ButtonGroupVariants = ComponentsVariants<Theme>['MuiButtonGroup'];

const containedVariants = [
  { props: (props: any) => props.variant === 'contained', style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.buttonOutlined }) },
  ...(colorKeys.palette.map((colorKey) => ({
    props: (props: any) => props.variant === 'contained' && props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ borderColor: varAlpha(theme.vars.palette[colorKey].darkChannel, theme.vars.opacity.outlined.border) }),
  })) satisfies ButtonGroupVariants),
] satisfies ButtonGroupVariants;

const textVariants = [
  { props: (props: any) => props.variant === 'text', style: ({ theme }: { theme: Theme }) => ({ borderColor: varAlpha('currentColor', theme.vars.opacity.outlined.border) }) },
  { props: (props: any) => props.variant === 'text' && props.color === 'inherit', style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.buttonOutlined }) },
] satisfies ButtonGroupVariants;

const softVariants = [
  { props: (props: any) => props.variant === 'soft', style: ({ theme }: { theme: Theme }) => ({ borderStyle: 'solid', borderColor: varAlpha('currentColor', theme.vars.opacity.soft.border) }) },
  { props: (props: any) => props.variant === 'soft' && props.color === 'inherit', style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.buttonOutlined }) },
] satisfies ButtonGroupVariants;

const MuiButtonGroup: Components<Theme>['MuiButtonGroup'] = {
  defaultProps: { color: 'inherit', disableElevation: true },
  styleOverrides: {
    grouped: { variants: [...containedVariants, ...textVariants, ...softVariants] },
    firstButton: { variants: [{ props: (props: any) => props.variant === 'soft' && props.orientation === 'horizontal', style: { borderRightWidth: 1 } }, { props: (props: any) => props.variant === 'soft' && props.orientation === 'vertical', style: { borderBottomWidth: 1 } }] },
    middleButton: { variants: [{ props: (props: any) => props.variant === 'soft' && props.orientation === 'horizontal', style: { borderRightWidth: 1 } }, { props: (props: any) => props.variant === 'soft' && props.orientation === 'vertical', style: { borderBottomWidth: 1 } }] },
  },
};

export const buttonGroup: Components<Theme> = { MuiButtonGroup };