import type { Theme, Components, ComponentsVariants } from '@mui/material/styles';
import { colorKeys } from '../palette';

export type IconButtonExtendColor = { black: true; white: true };
type IconButtonVariants = ComponentsVariants<Theme>['MuiIconButton'];

const colorVariants = [
  ...(colorKeys.common.map((colorKey) => ({
    props: (props: any) => props.color === colorKey,
    style: ({ theme }: { theme: Theme }) => ({ color: theme.vars.palette.common[colorKey] }),
  })) satisfies IconButtonVariants),
] satisfies IconButtonVariants;

const MuiIconButton: Components<Theme>['MuiIconButton'] = {
  styleOverrides: { root: { variants: [...colorVariants] } },
};

export const iconButton: Components<Theme> = { MuiIconButton };