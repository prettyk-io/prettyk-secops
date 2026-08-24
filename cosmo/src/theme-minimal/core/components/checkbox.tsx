import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme, Components } from '@mui/material/styles';
import SvgIcon from '@mui/material/SvgIcon';

const Icon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M17.9 2.318A5 5 0 0 1 22.895 7.1l.005.217v10a5 5 0 0 1-4.783 4.995l-.217.005h-10a5 5 0 0 1-4.995-4.783l-.005-.217v-10a5 5 0 0 1 4.783-4.995l.217-.005h10Zm-.5 1.5h-9a4 4 0 0 0-4 4v9a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-9a4 4 0 0 0-4-4Z" fill="currentColor" />
  </SvgIcon>
);

const CheckedIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M17 2a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm-1.625 7.255l-4.13 4.13l-1.75-1.75a.881.881 0 0 0-1.24 0c-.34.34-.34.89 0 1.24l2.38 2.37c.17.17.39.25.61.25c.23 0 .45-.08.62-.25l4.75-4.75c.34-.34.34-.89 0-1.24a.88.88 0 0 0-1.24 0Z" fill="currentColor" />
  </SvgIcon>
);

const IndeterminateIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M17 2a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm-9.75 7.75A.75.75 0 1 0 7 10.5h10a.75.75 0 1 0-.25-1.5H7.25Z" fill="currentColor" />
  </SvgIcon>
);

const MuiCheckbox: Components<Theme>['MuiCheckbox'] = {
  defaultProps: { size: 'small', icon: <Icon />, checkedIcon: <CheckedIcon />, indeterminateIcon: <IndeterminateIcon /> },
  styleOverrides: {
    root: ({ theme }: { theme: Theme }) => ({ padding: theme.spacing(1) }),
  },
};

export const checkbox: Components<Theme> = { MuiCheckbox };