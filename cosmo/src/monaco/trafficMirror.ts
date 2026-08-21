import type * as monacoNs from 'monaco-editor';
import { LIVE_BASE } from '../api/apiBase';

const DECORATION_CLASS = 'pk-traffic-mirror';
const OWNER = 'traffic-mirror';

interface DiaryEvent {
  kind: string;
  text: string;
  pretty?: string;
  ts: number;
  run_id?: string;
}

interface LineAnnotation {
  lineNumber: number;
  status: string;
  kind: string;
  ts: number;
}

let _decorations: string[] = [];

function matchEditorLine(model: monacoNs.editor.ITextModel, pretty: string): number {
  for (let i = 1; i <= model.getLineCount(); i++) {
    const line = model.getLineContent(i).trim();
    if (!line) continue;
    if (line === pretty) return i;
    if (pretty && pretty.includes('|')) {
      const actionPart = pretty.split('|').slice(1).join('|').trim();
      if (actionPart && line.includes(actionPart)) return i;
    }
    if (line.includes(pretty) || pretty.includes(line)) return i;
  }
  return -1;
}

function createMirrorDecorations(
  monaco: typeof monacoNs,
  _model: monacoNs.editor.ITextModel,
  annotations: LineAnnotation[],
): monacoNs.editor.IModelDeltaDecoration[] {
  return annotations.map((a) => {
    const glyph = statusGlyph(a);
    const className = statusClass(a);
    const lineLen = 1;
    return {
      range: new monaco.Range(a.lineNumber, lineLen, a.lineNumber, lineLen),
      options: {
        isWholeLine: false,
        after: {
          content: `  ${glyph} ${a.status}`,
          inlineClassName: `${DECORATION_CLASS} ${className}`,
        },
      },
    };
  });
}

function statusGlyph(a: LineAnnotation): string {
  const k = a.kind || '';
  if (k === 'ERROR') return '✗';
  if (k === 'STEP' || k === 'NEXT') return '→';
  if (k === 'LOG') return '·';
  if (k === 'HIGH') return '▲';
  return '·';
}

function statusClass(a: LineAnnotation): string {
  const k = a.kind || '';
  if (k === 'ERROR') return 'pk-mirror-error';
  if (k === 'STEP') return 'pk-mirror-step';
  if (k === 'NEXT') return 'pk-mirror-next';
  if (k === 'LOG') return 'pk-mirror-log';
  if (k === 'HIGH') return 'pk-mirror-alert';
  return 'pk-mirror-default';
}

function fmtStatus(a: LineAnnotation): string {
  const k = a.kind || '';
  if (k === 'ERROR') return 'ERR';
  if (k === 'STEP') return a.status.substring(0, 40);
  if (k === 'NEXT') return '▸ next';
  if (k === 'LOG') return a.status.substring(0, 40);
  if (k === 'HIGH') return 'HIGH';
  return a.status.substring(0, 30);
}

export type TrafficMirrorEvent = {
  kind: string;
  text: string;
  pretty?: string;
  ts: number;
  lineNumber?: number;
  matched: boolean;
};

export function startTrafficMirror(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  editor: monacoNs.editor.IStandaloneCodeEditor | null,
  onEvent?: (ev: TrafficMirrorEvent) => void,
): () => void {
  const url = `${LIVE_BASE}/api/diary?channel=all`;
  let es: EventSource | null = null;
  let closed = false;

  const annotations: LineAnnotation[] = [];
  const seenLines = new Set<number>();

  function updateDecorations(): void {
    if (!editor) return;
    const decs = createMirrorDecorations(monaco, model, annotations);
    _decorations = editor.deltaDecorations(_decorations, decs);
  }

  function handleEvent(event: MessageEvent): void {
    if (closed) return;
    try {
      const ev: DiaryEvent = JSON.parse(event.data);
      if (!ev.text && !ev.pretty) return;

      const mirrorEv: TrafficMirrorEvent = {
        kind: ev.kind || 'STEP',
        text: ev.text || '',
        pretty: ev.pretty,
        ts: ev.ts || 0,
        lineNumber: undefined,
        matched: false,
      };

      const searchText = ev.pretty || ev.text || '';
      const lineNum = matchEditorLine(model, searchText);

      if (lineNum > 0) {
        mirrorEv.lineNumber = lineNum;
        mirrorEv.matched = true;

        if (!seenLines.has(lineNum)) {
          seenLines.add(lineNum);
          annotations.push({
            lineNumber: lineNum,
            status: fmtStatus({ lineNumber: lineNum, status: searchText, kind: ev.kind, ts: ev.ts }),
            kind: ev.kind || 'STEP',
            ts: ev.ts || 0,
          });
          if (annotations.length > 200) {
            annotations.splice(0, annotations.length - 200);
          }
          updateDecorations();
        }
      }

      if (onEvent) onEvent(mirrorEv);
    } catch { /* ignore parse errors */ }
  }

  try {
    es = new EventSource(url);
    es.onmessage = handleEvent;
    es.onerror = () => {
      if (es && es.readyState === EventSource.CLOSED && !closed) {
        setTimeout(() => {
          if (!closed) {
            es?.close();
            const newEs = new EventSource(url);
            newEs.onmessage = handleEvent;
            es = newEs;
          }
        }, 3000);
      }
    };
  } catch { /* Live server offline */ }

  return () => {
    closed = true;
    if (es) {
      es.close();
      es = null;
    }
    if (editor) {
      _decorations = editor.deltaDecorations(_decorations, []);
    }
  };
}

export function clearTrafficMirror(
  editor: monacoNs.editor.IStandaloneCodeEditor | null,
): void {
  if (editor) {
    _decorations = editor.deltaDecorations(_decorations, []);
  }
}

export function getTrafficMirrorStyles(): string {
  return `
    .${DECORATION_CLASS} {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      opacity: 0.7;
      white-space: pre;
      margin-left: 8px;
    }
    .pk-mirror-step {
      color: #22C55E;
      opacity: 0.85;
    }
    .pk-mirror-next {
      color: #38BDF8;
      opacity: 0.6;
      font-style: italic;
    }
    .pk-mirror-error {
      color: #EF4444;
      opacity: 0.9;
    }
    .pk-mirror-log {
      color: #94A3B8;
      opacity: 0.5;
    }
    .pk-mirror-alert {
      color: #FB923C;
      opacity: 0.85;
    }
    .pk-mirror-default {
      color: #64748B;
      opacity: 0.4;
    }
  `;
}