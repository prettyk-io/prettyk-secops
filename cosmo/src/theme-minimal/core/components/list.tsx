import type { Theme, Components } from '@mui/material/styles';

const MuiList: Components<Theme>['MuiList'] = {
  styleOverrides: {
    root: { padding: 0 },
  },
};

export const list: Components<Theme> = { MuiList };