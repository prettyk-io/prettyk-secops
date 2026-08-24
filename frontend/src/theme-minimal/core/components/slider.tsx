import type { Theme, Components, ComponentsVariants } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { sliderClasses } from '@mui/material/Slider';

const DIMENSIONS: Record<string, { rail: number; thumb: number; mark: number }> = {
  small: { rail: 6, thumb: 16, mark: 4 },
  medium: { rail: 10, thumb: 20, mark: 6 },
};

const MuiSlider: Components<Theme>['MuiSlider'] = {
  defaultProps: { size: 'small' },
  styleOverrides: {
    root: { variants: [{ props: {}, style: ({ theme }: { theme: Theme }) => ({ [`&.${sliderClasses.disabled}`]: { color: theme.vars.palette.action.disabled } }) }] },
    thumb: ({ theme }: { theme: Theme }) => ({
      boxShadow: theme.vars.customShadows.z1, color: theme.vars.palette.common.white,
      border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
      '&::before': { opacity: 0.4, boxShadow: 'none', width: 'calc(100% - 4px)', height: 'calc(100% - 4px)',
        backgroundImage: `linear-gradient(180deg, ${theme.vars.palette.grey[500]}, transparent)` },
      variants: [{ props: (p: any) => p.size === 'small', style: { width: 16, height: 16 } }, { props: (p: any) => p.size === 'medium', style: { width: 20, height: 20 } }],
    }),
    rail: ({ theme }: { theme: Theme }) => ({ opacity: 0.12, backgroundColor: theme.vars.palette.grey[500],
      variants: [{ props: (p: any) => p.size === 'small', style: { height: 6 } }, { props: (p: any) => p.size === 'medium', style: { height: 10 } }] }),
    track: { variants: [{ props: (p: any) => p.size === 'small', style: { height: 6 } }, { props: (p: any) => p.size === 'medium', style: { height: 10 } }] },
    mark: ({ theme }: { theme: Theme }) => ({ backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.48), '&[data-index="0"]': { display: 'none' },
      variants: [{ props: { size: 'small' }, style: { width: 1, height: 4 } }, { props: { size: 'medium' }, style: { width: 1, height: 6 } }] }),
    markActive: ({ theme }: { theme: Theme }) => ({ backgroundColor: varAlpha(theme.vars.palette.common.whiteChannel, 0.64) }),
    markLabel: ({ theme }: { theme: Theme }) => ({ fontSize: theme.typography.pxToRem(13), color: theme.vars.palette.text.disabled }),
    valueLabel: ({ theme }: { theme: Theme }) => ({ borderRadius: 8, backgroundColor: theme.vars.palette.grey[800] }),
  },
};

export const slider: Components<Theme> = { MuiSlider };