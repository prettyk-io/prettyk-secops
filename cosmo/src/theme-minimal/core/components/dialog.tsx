import type { Theme, Components } from '@mui/material/styles';

const MuiDialog: Components<Theme>['MuiDialog'] = {
  styleOverrides: {
    paper: {
      variants: [
        {
          props: (props: any) => !props.fullScreen,
          style: ({ theme }: { theme: Theme }) => ({
            margin: theme.spacing(2),
            boxShadow: theme.vars.customShadows.dialog,
            borderRadius: Number(theme.shape.borderRadius) * 2,
          }),
        },
      ],
    },
  },
};

const MuiDialogTitle: Components<Theme>['MuiDialogTitle'] = {
  styleOverrides: { root: ({ theme }) => ({ padding: theme.spacing(3) }) },
};

const MuiDialogContent: Components<Theme>['MuiDialogContent'] = {
  styleOverrides: {
    root: ({ theme }) => ({ padding: theme.spacing(0, 3) }),
    dividers: ({ theme }) => ({
      borderTop: 0,
      borderBottomStyle: 'dashed',
      paddingBottom: theme.spacing(3),
    }),
  },
};

const MuiDialogActions: Components<Theme>['MuiDialogActions'] = {
  defaultProps: { disableSpacing: true },
  styleOverrides: {
    root: ({ theme }) => ({
      padding: theme.spacing(3),
      '& > :not(:first-of-type)': { marginLeft: theme.spacing(1.5) },
    }),
  },
};

export const dialog: Components<Theme> = { MuiDialog, MuiDialogTitle, MuiDialogContent, MuiDialogActions };