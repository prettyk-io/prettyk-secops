/**
 * PK-TRM-1/3: TerminalPane — xterm.js with fit addon + web-links.
 *
 * Подключается к WsTerminal (WebSocket duplex). Resize, reconnect, честные статусы.
 * Без xterm — fallback на простой scrollbox логов (RunConsole уже имеет).
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Chip, LinearProgress } from '@mui/material';
import { Terminal as TerminalIcon, Wifi, WifiOff, Timer } from '@mui/icons-material';
import {
  connectTerminal,
  createTerminalClient,
  type WsTerminal,
  type TerminalState,
  type TerminalQuota,
} from './TerminalSessionClient';

// lazy load xterm — не блокирует bundle если не используется
let TerminalClass: any = null;
let FitAddonClass: any = null;
let WebLinksAddonClass: any = null;

async function loadXterm(): Promise<boolean> {
  if (TerminalClass) return true;
  try {
    const [xterm, fit, webLinks] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
    ]);
    TerminalClass = xterm.Terminal;
    FitAddonClass = fit.FitAddon;
    WebLinksAddonClass = webLinks.WebLinksAddon;
    return true;
  } catch {
    return false;
  }
}

export interface TerminalPaneProps {
  sessionId?: string;
  /** Если нет sessionId — создаём новую сессию. */
  mode?: 'workspace' | 'run-console';
  runId?: string;
  /** Колбэк при изменении состояния. */
  onStateChange?: (state: TerminalState) => void;
  /** Показать заголовок с квотами. */
  showHeader?: boolean;
  /** Высота контейнера. */
  height?: string | number;
}

export function TerminalPane({
  sessionId: initialSessionId,
  mode = 'workspace',
  runId,
  onStateChange,
  showHeader = true,
  height = '100%',
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const wsRef = useRef<WsTerminal | null>(null);
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [state, setState] = useState<TerminalState>('reconnecting');
  const [quota, setQuota] = useState<TerminalQuota | null>(null);
  const [xtermOk, setXtermOk] = useState(false);
  const [ttl, setTtl] = useState(0);

  const client = createTerminalClient();

  const updateState = (s: TerminalState) => { setState(s); onStateChange?.(s); };

  // Create session if no sessionId provided
  useEffect(() => {
    if (initialSessionId) return;
    let cancelled = false;
    client.create(mode, runId).then((s) => {
      if (!cancelled && s) setSessionId(s.session_id);
    });
    return () => { cancelled = true; };
  }, [initialSessionId, mode, runId]);

  // Load xterm
  useEffect(() => {
    loadXterm().then(setXtermOk);
  }, []);

  // Attach terminal when sessionId + DOM ready
  useEffect(() => {
    if (!sessionId || !containerRef.current || !xtermOk) return;

    const container = containerRef.current;
    const term = new TerminalClass({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
      theme: {
        background: '#0a0f18',
        foreground: '#94a3b8',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56,189,248,0.25)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#38bdf8',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#7dd3fc',
        brightMagenta: '#c084fc',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      allowProposedApi: true,
      cols: 100,
      rows: 30,
    });

    const fitAddon = new FitAddonClass();
    const webLinksAddon = new WebLinksAddonClass();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);
    fitAddon.fit();
    terminalRef.current = term;

    // Connect WS
    const ws = connectTerminal(sessionId, client, {
      cols: term.cols,
      rows: term.rows,
    });
    wsRef.current = ws;

    ws.onOpen(() => updateState('connected'));
    ws.onClose(() => updateState('reconnecting'));

    ws.onMessage((msg) => {
      if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'status') {
        setTtl(msg.ttl_remaining);
        if (msg.state === 'expired') updateState('expired');
        else if (msg.state === 'terminated') updateState('terminated');
      } else if (msg.type === 'quota') {
        setQuota({ cpu_percent: msg.cpu, mem_mb: msg.mem, disk_mb: msg.disk, pids: msg.pids });
      }
    });

    // Resize when container changes
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
      const cols = term.cols;
      const rows = term.rows;
      ws.send({ type: 'resize', cols, rows });
    });
    ro.observe(container);

    // Keyboard input → WS
    term.onData((data: string) => {
      ws.send({ type: 'input', data });
    });

    // Ping every 30s
    const ping = setInterval(() => ws.send({ type: 'ping' }), 30_000);

    return () => {
      clearInterval(ping);
      ro.disconnect();
      ws.close();
      term.dispose();
      terminalRef.current = null;
    };
  }, [sessionId, xtermOk]);

  // Keyboard shortcut: Ctrl+Shift+C → copy
  useEffect(() => {
    if (!terminalRef.current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const sel = terminalRef.current?.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [terminalRef.current]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, minHeight: 200 }}>
      {showHeader && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.5, borderBottom: '1px solid rgba(56,189,248,0.12)', bgcolor: '#0a0f18', flexShrink: 0 }}>
          <TerminalIcon sx={{ fontSize: 14, color: '#38bdf8' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', fontFamily: 'JetBrains Mono' }}>
            {sessionId ? sessionId.slice(0, 16) + '...' : 'Terminal'}
          </Typography>
          <Chip
            icon={state === 'connected' ? <Wifi sx={{ fontSize: '12px !important' }} /> : <WifiOff sx={{ fontSize: '12px !important' }} />}
            label={state.toUpperCase()}
            size="small"
            sx={{
              color: state === 'connected' ? '#22c55e' : state === 'expired' ? '#f59e0b' : '#ef4444',
              background: state === 'connected' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              fontWeight: 700, fontSize: 9, ml: 'auto',
            }}
          />
          {ttl > 0 && (
            <Chip icon={<Timer sx={{ fontSize: '12px !important' }} />} label={`${ttl}s`} size="small" sx={{ color: '#64748b', background: 'rgba(255,255,255,0.04)', fontSize: 9 }} />
          )}
          {quota && (
            <Chip
              label={`CPU ${quota.cpu_percent}% · ${quota.mem_mb}MB · ${quota.pids}p`}
              size="small"
              sx={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            />
          )}
        </Box>
      )}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          '& .xterm': { height: '100%', padding: '4px 8px' },
          '& .xterm-viewport': { '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { background: '#334155', borderRadius: 2 } },
        }}
      />
    </Box>
  );
}