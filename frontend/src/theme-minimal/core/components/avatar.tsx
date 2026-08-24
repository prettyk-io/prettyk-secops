import type { Theme, Components } from '@mui/material/styles';

const MuiAvatar: Components<Theme>['MuiAvatar'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      fontSize: theme.typography.pxToRem(18),
      fontWeight: theme.typography.fontWeightMedium,
    }),
    rounded: ({ theme }: { theme: Theme }) => ({
      borderRadius: Number(theme.shape.borderRadius) * 1.5,
    }),
  },
};

const MuiAvatarGroup: Components<Theme>['MuiAvatarGroup'] = {
  defaultProps: { max: 4 },
  styleOverrides: {
    root: { justifyContent: 'flex-end' },
  },
};

export const avatar: Components<Theme> = { MuiAvatar, MuiAvatarGroup };