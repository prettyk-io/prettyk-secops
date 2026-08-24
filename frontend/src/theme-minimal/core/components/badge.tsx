import type { Theme, Components } from '@mui/material/styles';

const MuiBadge: Components<Theme>['MuiBadge'] = {
  styleOverrides: {
    dot: { borderRadius: '50%' },
    badge: {
      variants: [
        {
          props: (props: any) => props.color === 'default',
          style: ({ theme }: { theme: Theme }) => ({ ...theme.mixins.filledStyles(theme, 'default') }),
        },
        {
          props: (props: any) => ['online', 'always', 'busy', 'offline'].includes(props.variant as string),
          style: () => ({
            width: 10, height: 10, padding: 0, top: 'auto', right: '14%', bottom: '14%',
            minWidth: 'auto', transform: 'scale(1) translate(50%, 50%)',
            '&::before, &::after': { content: "''" as any, borderRadius: 1, backgroundColor: '#FFFFFF' },
          }),
        },
        {
          props: (props: any) => props.variant === 'online',
          style: ({ theme }: { theme: Theme }) => ({ backgroundColor: theme.vars.palette.success.main }),
        },
        {
          props: (props: any) => props.variant === 'always',
          style: ({ theme }: { theme: Theme }) => ({
            backgroundColor: theme.vars.palette.warning.main,
            '&::before': { width: 2, height: 4, transform: 'translate(1px, -1px)' },
            '&::after': { width: 2, height: 4, transform: 'translate(0, 1px) rotate(125deg)' },
          }),
        },
        {
          props: (props: any) => props.variant === 'busy',
          style: ({ theme }: { theme: Theme }) => ({
            backgroundColor: theme.vars.palette.error.main,
            '&::before': { width: 6, height: 2 },
          }),
        },
        {
          props: (props: any) => props.variant === 'offline',
          style: ({ theme }: { theme: Theme }) => ({
            backgroundColor: theme.vars.palette.text.disabled,
            '&::before': { width: 6, height: 6, borderRadius: '50%' },
          }),
        },
        { props: (props: any) => props.variant === 'invisible', style: { display: 'none' } },
      ],
    },
  },
};

export const badge: Components<Theme> = { MuiBadge };