import type { Theme, Components } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';

const MuiBackdrop: Components<Theme>['MuiBackdrop'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      variants: [
        {
          props: (props: any) => !props.invisible,
          style: { backgroundColor: varAlpha(theme.vars.palette.grey['800Channel'], 0.48) },
        },
      ],
    }),
  },
};

export const backdrop: Components<Theme> = { MuiBackdrop };