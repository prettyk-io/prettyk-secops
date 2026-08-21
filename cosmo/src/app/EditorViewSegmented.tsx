/**
 * Segmented вкладок: local value красится сразу, тяжёлый commit — снаружи после paint.
 */
import { useEffect, useState } from 'react';
import { Segmented } from 'antd';
import type { EditorView } from './appEditorViews';

/** Состояние индикатора «Мониторинг». */
export type MonitorState = 'idle' | 'running' | 'done';

export type EditorViewSegmentedProps = {
  value: EditorView;
  studioDisabled?: boolean;
  onChange: (view: EditorView) => void;
  onMonitorClick?: () => void;
  monitorState?: MonitorState;
};

function monitorLabel(state: MonitorState): React.JSX.Element {
  const dotClass =
    state === 'running'
      ? 'pk-monitor-dot pk-monitor-dot--running'
      : state === 'done'
        ? 'pk-monitor-dot pk-monitor-dot--done'
        : 'pk-monitor-dot';
  return (
    <span className="pk-monitor-label">
      Мониторинг
      <span className={dotClass} aria-hidden="true" />
    </span>
  );
}

export function EditorViewSegmented({
  value,
  studioDisabled = false,
  onChange,
  onMonitorClick,
  monitorState = 'idle',
}: EditorViewSegmentedProps): React.JSX.Element {
  const [local, setLocal] = useState<EditorView>(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <Segmented
      className="pk-view-segmented"
      size="small"
      value={local}
      onChange={(next) => {
        if (next === 'monitor') {
          onMonitorClick?.();
          return;
        }
        if (next === 'studio' && studioDisabled) {
          return;
        }
        if (next !== 'studio' && next !== 'results') {
          return;
        }
        setLocal(next);
        onChange(next);
      }}
      options={[
        { label: monitorLabel(monitorState), value: 'monitor' },
        { label: 'Результаты', value: 'results' },
      ]}
    />
  );
}
