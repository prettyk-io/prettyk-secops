import type { Theme, CSSObject, Components } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { gridClasses } from '@mui/x-data-grid';
import { paperClasses } from '@mui/material/Paper';
import { listClasses } from '@mui/material/List';
import { listItemIconClasses } from '@mui/material/ListItemIcon';
import { linearProgressClasses } from '@mui/material/LinearProgress';
import { circularProgressClasses } from '@mui/material/CircularProgress';
import { svgIconClasses } from '@mui/material/SvgIcon';
import { iconButtonClasses } from '@mui/material/IconButton';

const MuiDataGrid: Components<Theme>['MuiDataGrid'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      borderWidth: 0,
      backgroundColor: 'transparent',
      '--unstable_DataGrid-radius': 0,
      '--unstable_DataGrid-headWeight': theme.typography.fontWeightSemiBold,
      ...theme.mixins.scrollbarStyles(theme),
    }),
    columnHeader: ({ theme }: { theme: Theme }) => ({
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.background.neutral,
    }),
    cell: ({ theme }: { theme: Theme }) => ({
      borderTopStyle: 'dashed',
      '&:hover': { color: theme.vars.palette.primary.main },
      [`&.${gridClasses['cell--editing']}`]: {
        boxShadow: 'none',
        backgroundColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
      },
    }),
    footerContainer: { minHeight: 'auto', borderTopStyle: 'dashed' },
    overlay: ({ theme }: { theme: Theme }) => ({
      [`& .${linearProgressClasses.root}`]: {
        height: 3, borderRadius: 0,
        backgroundColor: varAlpha(theme.vars.palette.text.primaryChannel, 0.16),
      },
      [`& .${circularProgressClasses.root}`]: { color: theme.vars.palette.text.primary },
    }),
    menu: ({ theme }: { theme: Theme }) => ({
      [`& .${paperClasses.root}`]: { ...theme.mixins.paperStyles(theme, { dropdown: true }) },
      [`& .${listClasses.root}`]: { padding: 0, [`& .${listItemIconClasses.root}`]: { minWidth: 0 } },
    }),
    panelContent: ({ theme }: { theme: Theme }) => ({
      [`&.${gridClasses.paper}`]: { ...theme.mixins.paperStyles(theme, { dropdown: true }), margin: 0, padding: 0 },
    }),
    filterFormDeleteIcon: ({ theme }: { theme: Theme }) => ({
      [`& .${iconButtonClasses.root}`]: {
        padding: '5px',
        backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
        [`& .${svgIconClasses.root}`]: { width: 16, height: 16 },
      },
    }),
  },
};

export const dataGrid: Components<Theme> = { MuiDataGrid };