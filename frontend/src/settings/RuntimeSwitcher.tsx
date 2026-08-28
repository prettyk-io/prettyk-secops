/**
 * PW-F3: Runtime Switcher — переключатель браузерного рантайма.
 *
 * Переключатель: Playwright / Selenium.
 * Виден только в dev-режиме (флаг `?dev=true` в URL).
 * Влияет на `PK_BROWSER_RUNTIME` в запросе Run.
 */
import { useState, useCallback, useEffect } from 'react';
import { Switch, Typography, Tooltip } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

const LOCAL_KEY = 'pk_browser_runtime';

export type RuntimeMode = 'playwright' | 'selenium';

function isDevMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('dev') === 'true';
  } catch {
    return false;
  }
}

function loadRuntime(): RuntimeMode {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    if (stored === 'playwright' || stored === 'selenium') return stored;
  } catch { /* noop */ }
  return 'selenium'; // default
}

function saveRuntime(mode: RuntimeMode): void {
  try { localStorage.setItem(LOCAL_KEY, mode); } catch { /* noop */ }
}

export function useRuntimeMode(): RuntimeMode {
  const [mode, setMode] = useState<RuntimeMode>(loadRuntime);

  useEffect(() => {
    const stored = loadRuntime();
    setMode(stored);
  }, []);

  return mode;
}

export interface RuntimeSwitcherProps {
  value?: RuntimeMode;
  onChange?: (mode: RuntimeMode) => void;
}

export function RuntimeSwitcher({
  value = loadRuntime(),
  onChange,
}: RuntimeSwitcherProps) {
  const [mode, setMode] = useState<RuntimeMode>(value);

  const visible = isDevMode();
  if (!visible) return null;

  const handleToggle = useCallback((checked: boolean) => {
    const next: RuntimeMode = checked ? 'playwright' : 'selenium';
    setMode(next);
    saveRuntime(next);
    onChange?.(next);
  }, [onChange]);

  return (
    <Tooltip title={`Browser Runtime: ${mode === 'playwright' ? 'Playwright' : 'Selenium'}`}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        background: mode === 'playwright' ? 'rgba(34, 211, 238, 0.1)' : 'rgba(100, 116, 139, 0.1)',
        border: `1px solid ${mode === 'playwright' ? 'rgba(34, 211, 238, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`,
      }}>
        <ExperimentOutlined style={{ color: mode === 'playwright' ? '#22d3ee' : '#64748b', fontSize: 12 }} />
        <Typography.Text style={{ fontSize: 10, color: mode === 'playwright' ? '#22d3ee' : '#64748b', fontWeight: 600 }}>
          {mode === 'playwright' ? 'PW' : 'SE'}
        </Typography.Text>
        <Switch
          checked={mode === 'playwright'}
          onChange={handleToggle}
          size="small"
        />
      </div>
    </Tooltip>
  );
}