import type { Theme, Components, ComponentsVariants } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { linearProgressClasses } from '@mui/material/LinearProgress';

const MuiCircularProgress: Components<Theme>['MuiCircularProgress'] = {
  defaultProps: { color: 'inherit' },
};

const MuiLinearProgress: Components<Theme>['MuiLinearProgress'] = {
  defaultProps: { color: 'inherit' },
  styleOverrides: {
    root: { borderRadius: 16 },
    bar: { borderRadius: 'inherit' },
  },
};

export const progress: Components<Theme> = { MuiLinearProgress, MuiCircularProgress };