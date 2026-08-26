/**
 * PK-TRM-4: Structured Command Console.
 *
 * Типовые действия представлены формой с typed inputs, risk preview и
 * требуемыми capabilities — вместо raw shell. Никакого запоминания синтаксиса.
 */
import { useState } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Select, MenuItem, FormControl,
  InputLabel, Chip, Alert,
} from '@mui/material';
import {
  Terminal, Search, Gavel, BugReport, Replay, CheckCircle, Storage, Shield,
} from '@mui/icons-material';
import { assessCommandRisk, redactTerminalOutput, type CommandRisk } from './commandSafety';

interface CommandDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  fields: { name: string; label: string; placeholder?: string; options?: string[] }[];
  buildCommand: (values: Record<string, string>) => string;
  defaultCapabilities: string[];
}

const COMMANDS: CommandDef[] = [
  {
    id: 'validate',
    label: 'Validate Pipeline',
    icon: <CheckCircle sx={{ fontSize: 18 }} />,
    description: 'Проверить DSL/pipeline без запуска.',
    fields: [{ name: 'path', label: 'Target / Pipeline', placeholder: '/checks/check-id' }],
    buildCommand: (v) => `pk validate ${v.path || '.'}`,
    defaultCapabilities: [],
  },
  {
    id: 'preview',
    label: 'Preview Scope',
    icon: <Search sx={{ fontSize: 18 }} />,
    description: 'Показать шаги, права, gates и ресурсы до запуска.',
    fields: [{ name: 'path', label: 'Target / Pipeline', placeholder: '/checks/check-id' }],
    buildCommand: (v) => `pk preview ${v.path || '.'}`,
    defaultCapabilities: [],
  },
  {
    id: 'explain-policy',
    label: 'Explain Policy',
    icon: <Gavel sx={{ fontSize: 18 }} />,
    description: 'Объяснить решение gate-политики для run.',
    fields: [{ name: 'runId', label: 'Run ID', placeholder: 'run-xyz' }],
    buildCommand: (v) => `pk explain-policy ${v.runId || ''}`,
    defaultCapabilities: ['policies:manage'],
  },
  {
    id: 'show-finding',
    label: 'Show Finding',
    icon: <BugReport sx={{ fontSize: 18 }} />,
    description: 'Показать детали находки (CWE, CVSS, PoC).',
    fields: [{ name: 'findingId', label: 'Finding ID', placeholder: 'f-123' }],
    buildCommand: (v) => `pk show-finding ${v.findingId || ''}`,
    defaultCapabilities: [],
  },
  {
    id: 'replay-step',
    label: 'Replay Step',
    icon: <Replay sx={{ fontSize: 18 }} />,
    description: 'Повторить отдельный security-шаг (без изменения scope).',
    fields: [
      { name: 'runId', label: 'Run ID', placeholder: 'run-xyz' },
      { name: 'stepId', label: 'Step ID', placeholder: 's1' },
    ],
    buildCommand: (v) => `pk replay-step ${v.runId || ''} ${v.stepId || ''}`,
    defaultCapabilities: ['fuzzer:execute'],
  },
  {
    id: 'list-evidence',
    label: 'List Evidence',
    icon: <Storage sx={{ fontSize: 18 }} />,
    description: 'Список артефактов и evidence для run.',
    fields: [{ name: 'runId', label: 'Run ID', placeholder: 'run-xyz' }],
    buildCommand: (v) => `pk list-evidence ${v.runId || ''}`,
    defaultCapabilities: [],
  },
];

function riskChip(risk: CommandRisk) {
  const map: Record<CommandRisk, { color: string; bg: string; label: string }> = {
    safe: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'SAFE' },
    caution: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'CAUTION' },
    dangerous: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'DANGEROUS' },
  };
  const m = map[risk];
  return <Chip label={m.label} size="small" sx={{ color: m.color, background: m.bg, fontWeight: 700, fontSize: 9 }} />;
}

export function StructuredCommandConsole() {
  const [selectedId, setSelectedId] = useState(COMMANDS[0]!.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{ command: string; risk: CommandRisk } | null>(null);

  const def = COMMANDS.find((c) => c.id === selectedId) ?? COMMANDS[0]!;
  const previewCommand = def.buildCommand(values);
  const assessment = assessCommandRisk(previewCommand);
  const hasRequiredCaps = def.defaultCapabilities.length === 0;

  const handleRun = () => {
    setSubmitted({ command: redactTerminalOutput(previewCommand), risk: assessment.risk });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Terminal sx={{ color: '#38bdf8', fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Structured Console</Typography>
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: 12, mb: 3 }}>
        Typed commands with preview — no raw shell syntax to remember.
      </Typography>

      {/* Command picker */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 1.5, mb: 3 }}>
        {COMMANDS.map((c) => {
          const active = c.id === selectedId;
          return (
            <Paper
              key={c.id}
              onClick={() => { setSelectedId(c.id); setValues({}); setSubmitted(null); }}
              sx={{
                p: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5,
                border: active ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                background: active ? 'rgba(56,189,248,0.08)' : 'transparent',
              }}
            >
              <Box sx={{ color: active ? '#38bdf8' : '#64748b' }}>{c.icon}</Box>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{c.label}</Typography>
                <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{c.description}</Typography>
              </Box>
            </Paper>
          );
        })}
      </Box>

      {/* Form + preview */}
      <Paper sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{def.label}</Typography>
        {def.fields.map((f) => (
          <TextField
            key={f.name}
            label={f.label}
            size="small"
            fullWidth
            placeholder={f.placeholder}
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
          />
        ))}

        {/* Preview */}
        <Box sx={{ p: 1.5, borderRadius: 1, background: '#0a0f18', border: '1px solid #1e293b', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#94a3b8' }}>
          <Typography sx={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Command preview</Typography>
          {previewCommand || '—'}
        </Box>

        {/* Risk + capabilities */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {riskChip(assessment.risk)}
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{assessment.reason}</Typography>
          {def.defaultCapabilities.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {def.defaultCapabilities.map((c) => (
                <Chip key={c} icon={<Shield sx={{ fontSize: '12px !important' }} />} label={c} size="small" sx={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', fontSize: 9 }} />
              ))}
            </Box>
          )}
        </Box>

        {assessment.risk === 'dangerous' && (
          <Alert severity="warning" sx={{ fontSize: 11 }}>This command requires explicit confirmation. It may affect a target or modify data.</Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button size="small" onClick={() => { setValues({}); setSubmitted(null); }} sx={{ fontSize: 11 }}>Reset</Button>
          <Button
            size="small"
            variant="contained"
            disabled={!hasRequiredCaps || !previewCommand.trim()}
            onClick={handleRun}
            sx={{ fontSize: 11, bgcolor: '#38bdf8', color: '#080c16', fontWeight: 600 }}
          >
            Execute
          </Button>
        </Box>
      </Paper>

      {submitted && (
        <Alert severity={submitted.risk === 'dangerous' ? 'error' : 'success'} sx={{ mt: 2, fontSize: 11 }} icon={false}>
          Executed (simulated): <span style={{ fontFamily: 'JetBrains Mono' }}>{submitted.command}</span>
        </Alert>
      )}
    </Box>
  );
}