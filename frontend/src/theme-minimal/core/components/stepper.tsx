import type { Theme, Components } from '@mui/material/styles';
import { parseCssVar } from '../../utils/minimal-shared';

const MuiStepConnector: Components<Theme>['MuiStepConnector'] = {
  styleOverrides: { root: ({ theme }: { theme: Theme }) => ({ [parseCssVar(theme.vars.palette.StepConnector.border)]: theme.vars.palette.divider }) },
};
const MuiStepContent: Components<Theme>['MuiStepContent'] = {
  styleOverrides: { root: ({ theme }: { theme: Theme }) => ({ [parseCssVar(theme.vars.palette.StepContent.border)]: theme.vars.palette.divider }) },
};

export const stepper: Components<Theme> = { MuiStepConnector, MuiStepContent };