import type { Theme, Components } from '@mui/material/styles';

const MuiPaper: Components<Theme>['MuiPaper'] = {
  defaultProps: { elevation: 0 },
  styleOverrides: {
    root: {
      backgroundImage: 'none',
      variants: [
        {
          props: (props: any) => props.variant === 'outlined',
          style: ({ theme }: { theme: Theme }) => ({ borderColor: theme.vars.palette.shared.paperOutlined }),
        },
      ],
    },
  },
};

export const paper: Components<Theme> = { MuiPaper };