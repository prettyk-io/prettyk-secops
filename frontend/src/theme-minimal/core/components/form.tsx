import type { Theme, Components } from '@mui/material/styles';

const MuiFormControlLabel: Components<Theme>['MuiFormControlLabel'] = {
  styleOverrides: {
    label: ({ theme }: { theme: Theme }) => ({ ...theme.typography.body2 }),
  },
};

export const form: Components<Theme> = { MuiFormControlLabel };