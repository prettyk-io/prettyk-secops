import type { Theme, Components } from '@mui/material/styles';
import { tabClasses } from '@mui/material/Tab';

const MuiTabs: Components<Theme>['MuiTabs'] = {
  defaultProps: { variant: 'scrollable', allowScrollButtonsMobile: true },
  styleOverrides: {
    root: { minHeight: 'auto' },
  },
};

const MuiTab: Components<Theme>['MuiTab'] = {
  defaultProps: { disableRipple: true, iconPosition: 'start' },
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      opacity: 1, minWidth: 48, paddingLeft: 0, paddingRight: 0,
      color: theme.vars.palette.text.secondary,
      fontWeight: theme.typography.fontWeightMedium,
      [`&.${tabClasses.selected}`]: { fontWeight: theme.typography.fontWeightSemiBold },
    }),
  },
};

export const tabs: Components<Theme> = { MuiTab, MuiTabs };