import type { Theme, Components } from '@mui/material/styles';

const MuiLink: Components<Theme>['MuiLink'] = {
  defaultProps: { underline: 'hover' },
};

export const link: Components<Theme> = { MuiLink };