import type { Theme, Components } from '@mui/material/styles';
import { parseCssVar } from '../../utils/minimal-shared';

const MuiTooltip: Components<Theme>['MuiTooltip'] = {
  defaultProps: {
    slotProps: {
      popper: { modifiers: [{ name: 'offset', options: { offset: [0, -4] } }] },
    },
  },
  styleOverrides: {
    tooltip: ({ theme }) => ({
      borderRadius: Number(theme.shape.borderRadius) * 0.75,
      [parseCssVar(theme.vars.palette.Tooltip.bg)]: theme.vars.palette.grey[800],
      ...theme.applyStyles('dark', {
        [parseCssVar(theme.vars.palette.Tooltip.bg)]: theme.vars.palette.grey[700],
      }),
    }),
  },
};

export const tooltip: Components<Theme> = { MuiTooltip };