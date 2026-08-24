import type { Theme, Components, ComponentsVariants } from '@mui/material/styles';
import { varAlpha } from '../../utils/minimal-shared';
import { switchClasses } from '@mui/material/Switch';

const DIMENSIONS = {
  small: { thumb: 10, track: 16, trackRadius: 8, translateX: '10px' },
  medium: { thumb: 14, track: 20, trackRadius: 10, translateX: '14px' },
} as const;

const MuiSwitch: Components<Theme>['MuiSwitch'] = {
  styleOverrides: {
    root: { alignItems: 'center', variants: [{ props: (p: any) => p.size === 'small', style: { [`& .${switchClasses.switchBase}`]: { [`&.${switchClasses.checked}`]: { transform: `translateX(${DIMENSIONS.small.translateX})` } }, [`& .${switchClasses.thumb}`]: { width: 10, height: 10 }, [`& .${switchClasses.track}`]: { height: 16, borderRadius: 8 } } }] },
    switchBase: { top: 'auto', left: '6px',
      variants: [{
        props: (p: any) => p.color === 'default',
        style: ({ theme }: { theme: Theme }) => ({ [`&.${switchClasses.checked}`]: { [`& + .${switchClasses.track}`]: { backgroundColor: theme.vars.palette.text.primary } } }),
      }, {
        props: {}, style: ({ theme }: { theme: Theme }) => ({
          [`&.${switchClasses.checked}`]: { transform: `translateX(${DIMENSIONS.medium.translateX})`, [`& + .${switchClasses.track}`]: { opacity: theme.vars.opacity.switchTrack } },
          [`&.${switchClasses.disabled}`]: { [`& + .${switchClasses.track}`]: { opacity: theme.vars.opacity.switchTrackDisabled } },
        }),
      }] },
    thumb: ({ theme }: { theme: Theme }) => ({ width: 14, height: 14, color: theme.vars.palette.common.white }),
    track: ({ theme }: { theme: Theme }) => ({ height: 20, borderRadius: 10, backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.48) }),
  },
};

export const switches: Components<Theme> = { MuiSwitch };