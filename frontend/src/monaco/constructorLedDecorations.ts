/**
 * D2: Monaco constructor LED decorations — colored dots on step lines.
 *
 * Reads telemetry events from the graph bus and maps step.started / step.completed
 * to colored dot decorations on the matching constructor lines.
 */
import type { editor, IRange } from 'monaco-editor';
import type { GraphTelemetryEvent } from '../studio/graph/useGraphTelemetry';

const DECORATION_OWNER = 'pk-constructor-led';

const DOT_STATES: Record<string, { content: string; className: string }> = {
  running:    { content: ' ◉', className: 'pk-mirror-led pk-mirror-led--running' },
  success:    { content: ' ●', className: 'pk-mirror-led pk-mirror-led--success' },
  succeeded:  { content: ' ●', className: 'pk-mirror-led pk-mirror-led--success' },
  ok:         { content: ' ●', className: 'pk-mirror-led pk-mirror-led--success' },
  passed:     { content: ' ●', className: 'pk-mirror-led pk-mirror-led--success' },
  warning:    { content: ' ◐', className: 'pk-mirror-led pk-mirror-led--warning' },
  failsafe:   { content: ' ◐', className: 'pk-mirror-led pk-mirror-led--failsafe' },
  failure:    { content: ' ✖', className: 'pk-mirror-led pk-mirror-led--failure' },
  failed:     { content: ' ✖', className: 'pk-mirror-led pk-mirror-led--failure' },
  error:      { content: ' ✖', className: 'pk-mirror-led pk-mirror-led--failure' },
  predicted:  { content: ' ◌', className: 'pk-mirror-led pk-mirror-led--predicted' },
  queued:     { content: ' ○', className: 'pk-mirror-led pk-mirror-led--queued' },
};

let _decorations: string[] = [];

export function applyConstructorLedDecorations(
  instance: editor.IStandaloneCodeEditor | null,
  events: GraphTelemetryEvent[],
): void {
  if (!instance) return;

  const model = instance.getModel();
  if (!model) return;

  const seenLines = new Set<number>();
  const newDecorations: editor.IModelDeltaDecoration[] = [];

  for (const event of events) {
    if (event.kind !== 'step.started' && event.kind !== 'step.completed') continue;
    const stepId = event.step_id;
    if (!stepId) continue;

    const match = /^scenario:(\d+)$/.exec(stepId);
    if (!match) continue;

    if (!match[1]) continue;
    const stepIndex = parseInt(match[1], 10);
    const lineNumber = stepIndex + 1;

    if (lineNumber < 1 || lineNumber > model.getLineCount() || seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);

    const status = event.status || 'queued';
    const dot = DOT_STATES[status] ?? DOT_STATES.queued;
    if (!dot) continue;

    const range: IRange = { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 };
    newDecorations.push({ range, options: { isWholeLine: false, after: { content: dot.content, inlineClassName: dot.className } } });
  }

  _decorations = instance.deltaDecorations(_decorations, newDecorations);
}

export function clearConstructorLedDecorations(
  instance: editor.IStandaloneCodeEditor | null,
): void {
  if (!instance) return;
  _decorations = instance.deltaDecorations(_decorations, []);
}