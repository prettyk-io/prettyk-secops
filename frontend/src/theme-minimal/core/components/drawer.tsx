import type { Theme, Components } from '@mui/material/styles';

const MuiDrawer: Components<Theme>['MuiDrawer'] = {
  styleOverrides: {
    paper: ({ theme }: { theme: Theme }) => ({
      border: 'none',
      ...theme.applyStyles('dark', { boxShadow: theme.vars.customShadows.z24 }),
    }),
  },
};

export const drawer: Components<Theme> = { MuiDrawer };