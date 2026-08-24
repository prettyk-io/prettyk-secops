import type { Theme, Components } from '@mui/material/styles';

const MuiCard: Components<Theme>['MuiCard'] = {
  styleOverrides: {
    root: ({ theme }) => ({
      position: 'relative',
      boxShadow: `var(--card-shadow, ${theme.vars.customShadows.card})`,
      borderRadius: `var(--card-radius, ${Number(theme.shape.borderRadius) * 2}px)`,
      zIndex: 0,
    }),
  },
};

const MuiCardHeader: Components<Theme>['MuiCardHeader'] = {
  defaultProps: {
    slotProps: { title: { variant: 'h6' }, subheader: { variant: 'body2', sx: { mt: 0.5 } } },
  },
  styleOverrides: {
    root: ({ theme }) => ({ padding: theme.spacing(3, 3, 0) }),
  },
};

const MuiCardContent: Components<Theme>['MuiCardContent'] = {
  styleOverrides: {
    root: ({ theme }) => ({ padding: theme.spacing(3) }),
  },
};

export const card: Components<Theme> = { MuiCard, MuiCardHeader, MuiCardContent };