import type { Theme, Components } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { paginationItemClasses } from '@mui/material/PaginationItem';

const MuiPaginationItem: Components<Theme>['MuiPaginationItem'] = {
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({
      [`&.${paginationItemClasses.selected}`]: { fontWeight: theme.typography.fontWeightSemiBold },
      variants: [
        {
          props: (p: any) => p.variant === 'text' && p.color === 'standard',
          style: ({ theme: t }: { theme: Theme }) => ({
            [`&.${paginationItemClasses.selected}`]: { ...t.mixins.filledStyles(t, 'inherit', { hover: true }) },
          }),
        },
        {
          props: (p: any) => p.variant === 'outlined',
          style: ({ theme: t }: { theme: Theme }) => ({
            borderColor: t.vars.palette.shared.buttonOutlined,
            [`&.${paginationItemClasses.selected}`]: {
              borderColor: 'currentColor',
              backgroundColor: varAlpha('currentColor', t.vars.palette.action.selectedOpacity),
              '&:hover': { backgroundColor: varAlpha('currentColor', (t.vars.palette.action.selectedOpacity as number) * 2) },
            },
          }),
        },
        {
          props: (p: any) => p.variant === 'outlined' && p.color === 'standard',
          style: ({ theme: t }: { theme: Theme }) => ({
            [`&.${paginationItemClasses.selected}`]: {
              backgroundColor: varAlpha(t.vars.palette.grey['500Channel'], 0.08),
              '&:hover': { backgroundColor: varAlpha(t.vars.palette.grey['500Channel'], 0.16) },
            },
          }),
        },
        {
          props: {},
          style: ({ theme: t }: { theme: Theme }) => ({
            [`&.${paginationItemClasses.disabled}`]: {
              [`&.${paginationItemClasses.selected}`]: { backgroundColor: t.vars.palette.action.disabledBackground },
            },
          }),
        },
      ],
    }),
  },
};

export const pagination: Components<Theme> = { MuiPaginationItem };