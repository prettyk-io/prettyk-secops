import type { Theme, Components } from '@mui/material/styles';

import { varAlpha } from '../../utils/minimal-shared';

import { filledInputClasses } from '@mui/material/FilledInput';
import { outlinedInputClasses } from '@mui/material/OutlinedInput';
import { inputAdornmentClasses } from '@mui/material/InputAdornment';

// ----------------------------------------------------------------------

const MuiInputBase: Components<Theme>['MuiInputBase'] = {
  styleOverrides: {
    root: ({ theme }) => ({
      '--disabled-color': theme.vars.palette.action.disabled,
      '&.Mui-disabled': {
        [`& .${inputAdornmentClasses.root} *`]: { color: 'var(--disabled-color)' },
      },
    }),
    input: ({ theme }) => ({
      '&:focus': { borderRadius: 'inherit' },
      '&::placeholder': { color: theme.vars.palette.text.disabled },
    }),
  },
};

const MuiInput: Components<Theme>['MuiInput'] = {
  styleOverrides: {
    root: ({ theme }) => ({
      '&::before': { borderBottomColor: theme.vars.palette.shared.inputUnderline },
      '&::after': { borderBottomColor: theme.vars.palette.text.primary },
    }),
  },
};

const MuiOutlinedInput: Components<Theme>['MuiOutlinedInput'] = {
  styleOverrides: {
    root: ({ theme }) => ({
      [`&.${outlinedInputClasses.focused}:not(.${outlinedInputClasses.error})`]: {
        [`& .${outlinedInputClasses.notchedOutline}`]: { borderColor: theme.vars.palette.text.primary },
      },
      [`&.${outlinedInputClasses.disabled}`]: {
        [`& .${outlinedInputClasses.notchedOutline}`]: { borderColor: theme.vars.palette.action.disabledBackground },
      },
    }),
    notchedOutline: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.inputOutlined,
      transition: theme.transitions.create(['border-color'], { duration: theme.transitions.duration.shortest }),
    }),
  },
};

const MuiFilledInput: Components<Theme>['MuiFilledInput'] = {
  defaultProps: { disableUnderline: true },
  styleOverrides: {
    root: ({ theme }) => ({
      backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
      borderRadius: theme.shape.borderRadius,
      [`&:hover, &.${filledInputClasses.focused}`]: { backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16) },
      [`&.${filledInputClasses.error}`]: {
        backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.08),
        [`&:hover, &.${filledInputClasses.focused}`]: { backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.16) },
      },
      [`&.${filledInputClasses.disabled}`]: { backgroundColor: theme.vars.palette.action.disabledBackground },
    }),
  },
};

const MuiTextField: Components<Theme>['MuiTextField'] = {
  defaultProps: { variant: 'outlined' },
};

export const textField: Components<Theme> = { MuiInput, MuiInputBase, MuiTextField, MuiFilledInput, MuiOutlinedInput };