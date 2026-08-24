import type { Theme, Components } from '@mui/material/styles';

const MuiBreadcrumbs: Components<Theme>['MuiBreadcrumbs'] = {
  styleOverrides: {
    ol: ({ theme }: { theme: Theme }) => ({ rowGap: theme.spacing(0.5), columnGap: theme.spacing(2) }),
    li: ({ theme }: { theme: Theme }) => ({ display: 'inline-flex', '& > *': { ...theme.typography.body2 } }),
    separator: { margin: 0 },
  },
};

export const breadcrumbs: Components<Theme> = { MuiBreadcrumbs };