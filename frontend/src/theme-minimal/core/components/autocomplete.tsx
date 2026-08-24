import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme, Components } from '@mui/material/styles';
import SvgIcon from '@mui/material/SvgIcon';
import { svgIconClasses } from '@mui/material/SvgIcon';
import { autocompleteClasses } from '@mui/material/Autocomplete';

const ArrowDownIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path fill="currentColor" d="M12 16a1 1 0 0 1-.64-.23l-6-5a1 1 0 1 1 1.28-1.54L12 13.71l5.36-4.32a1 1 0 0 1 1.41.15a1 1 0 0 1-.14 1.46l-6 4.83A1 1 0 0 1 12 16" />
  </SvgIcon>
);

const MuiAutocomplete: Components<Theme>['MuiAutocomplete'] = {
  defaultProps: { popupIcon: <ArrowDownIcon /> },
  styleOverrides: {
    paper: ({ theme }: { theme: Theme }) => ({
      ...theme.mixins.paperStyles(theme, { dropdown: true }),
    }),
    listbox: ({ theme }: { theme: Theme }) => ({
      padding: 0,
      [`& .${autocompleteClasses.option}`]: { ...theme.mixins.menuItemStyles(theme) },
    }),
    endAdornment: { [`& .${svgIconClasses.root}`]: { fontSize: 18 } },
  },
};

export const autocomplete: Components<Theme> = { MuiAutocomplete };