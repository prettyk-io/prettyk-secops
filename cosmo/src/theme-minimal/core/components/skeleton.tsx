import type { Theme, Components } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';

const MuiSkeleton: Components<Theme>['MuiSkeleton'] = {
  defaultProps: { animation: 'wave', variant: 'rounded' },
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({ backgroundColor: varAlpha(theme.vars.palette.grey['400Channel'], 0.12) }),
    rounded: ({ theme }: { theme: Theme }) => ({ borderRadius: Number(theme.shape.borderRadius) * 2 }),
  },
};

export const skeleton: Components<Theme> = { MuiSkeleton };