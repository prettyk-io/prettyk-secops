import { Box, Typography, Paper, Button, Card, CardContent, Grid, Chip } from '@mui/material';
import { OpenInNew, Dns, Security, Dashboard, Person, Lock, SwapHoriz } from '@mui/icons-material';
import type { Theme } from '@mui/material/styles';
import { readSession, displayNameOf, capsForUser, login } from '../../shell/auth';
import { useState } from 'react';

const PANELS = [
  {
    id: 'control',
    label: 'Control Panel',
    icon: <Dns sx={{ fontSize: 28 }} />,
    color: '#38bdf8',
    desc: 'Infrastructure admin — system health, retention, vault, daemons.',
    role: 'admin_service',
    url: '#/control',
  },
  {
    id: 'admin',
    label: 'SecOps Control',
    icon: <Security sx={{ fontSize: 28 }} />,
    color: '#7c4dff',
    desc: 'Security admin — blank templates, gate policies, assignments.',
    role: 'admin_sec',
    url: '#/admin',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Dashboard sx={{ fontSize: 28 }} />,
    color: '#2ee6a8',
    desc: 'Cross-role results feed — polymorphic run cards, KPI trends.',
    role: 'all roles',
    url: '#/dashboard',
  },
];

export default function LivePreviews({ theme }: { theme: Theme }) {
  const session = readSession();
  const caps = session ? capsForUser(session) : null;
  const displayName = displayNameOf(session);
  const role = caps?.displayName ?? 'No session';

  return (
    <Box sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        <OpenInNew sx={{ fontSize: 20, mr: 0.5, verticalAlign: 'middle' }} />
        Live Previews
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12, mb: 2 }}>
        Open live admin panels built with React Admin + MUI. Each demo uses the current selected theme.
      </Typography>

      {/* Session badge & Quick Test Role Switcher */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Person sx={{ color: '#38bdf8' }} />
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{session ?? 'No session'}</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>Active role: {role}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Test Switch:</Typography>
          <Button
            size="small"
            variant={session === 'admin-service@spaceport.cbr.ru' ? 'contained' : 'outlined'}
            onClick={() => {
              login('admin-service@spaceport.cbr.ru', 'verysecure');
              window.location.reload();
            }}
            sx={{ fontSize: 10, height: 26, color: session === 'admin-service@spaceport.cbr.ru' ? '#080c16' : '#38bdf8', bgcolor: session === 'admin-service@spaceport.cbr.ru' ? '#38bdf8' : 'transparent' }}
          >
            admin_service (#/control)
          </Button>
          <Button
            size="small"
            variant={session === 'admin-sec@spaceport.cbr.ru' ? 'contained' : 'outlined'}
            onClick={() => {
              login('admin-sec@spaceport.cbr.ru', 'verysecure');
              window.location.reload();
            }}
            sx={{ fontSize: 10, height: 26, color: session === 'admin-sec@spaceport.cbr.ru' ? '#fff' : '#7c4dff', bgcolor: session === 'admin-sec@spaceport.cbr.ru' ? '#7c4dff' : 'transparent', borderColor: '#7c4dff' }}
          >
            admin_sec (#/admin)
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
        {PANELS.map((panel) => (
          <Box key={panel.id}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.15s',
                height: '100%',
                '&:hover': { borderColor: panel.color, transform: 'translateY(-2px)', boxShadow: `0 8px 30px ${panel.color}20` },
              }}
              onClick={() => { window.location.hash = panel.url; }}
            >
              <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center', textAlign: 'center', height: '100%' }}>
                <Box sx={{ color: panel.color, opacity: 0.9 }}>{panel.icon}</Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{panel.label}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>{panel.desc}</Typography>
                <Box sx={{
                  px: 1.5,
                  py: 0.3,
                  borderRadius: 1,
                  background: `${panel.color}15`,
                  border: `1px solid ${panel.color}30`,
                  fontSize: 9,
                  fontWeight: 600,
                  color: panel.color,
                  fontFamily: 'JetBrains Mono',
                  mt: 'auto',
                }}>
                  {panel.role}
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<OpenInNew sx={{ fontSize: '12px !important' }} />}
                  sx={{ fontSize: 10, mt: 1, borderColor: `${panel.color}40`, color: panel.color }}
                  onClick={(e) => { e.stopPropagation(); window.location.hash = panel.url; }}
                >
                  Open Panel
                </Button>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Quick links section */}
      <Paper sx={{ p: 3, mt: 4, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 2 }}>Design System Links</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
          {[
            { label: 'MUI Templates', url: 'https://mui.com/material-ui/getting-started/templates/' },
            { label: 'React Admin Demos', url: 'https://marmelab.com/react-admin/Demos.html' },
            { label: 'Preline UI Blocks', url: 'https://preline.co/blocks/' },
            { label: 'shadcn/ui Blocks', url: 'https://ui.shadcn.com/blocks' },
          ].map((link) => (
            <Box key={link.label}>
              <Button
                fullWidth
                variant="outlined"
                size="small"
                onClick={() => window.open(link.url, '_blank')}
                sx={{ fontSize: 10, textTransform: 'none', py: 1 }}
              >
                {link.label} →
              </Button>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}