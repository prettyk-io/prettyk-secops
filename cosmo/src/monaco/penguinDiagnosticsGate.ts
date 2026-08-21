/**
 * Client-side diagnostics gate for the validate/penguin pipeline.
 * Checks ALL Monaco markers (prettyk, security, constructor) across ALL open models.
 * Returns non-empty array if any error/warning markers exist — gate should block.
 */
import type * as monacoNs from 'monaco-editor';

export interface MarkerDiagnostic {
  path: string;
  line: number;
  message: string;
  owner: string;
}

const DIAGNOSTIC_OWNERS = [
  'prettyk-diagnostics',
  'security-diagnostics',
  'pk-constructor',
];

export function collectAllMonacoDiagnostics(
  monaco: typeof monacoNs,
): MarkerDiagnostic[] {
  const result: MarkerDiagnostic[] = [];
  const models = monaco.editor.getModels();
  for (const model of models) {
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    for (const m of markers) {
      if (DIAGNOSTIC_OWNERS.includes(m.owner) && m.severity >= 4) {
        result.push({
          path: model.uri.path,
          line: m.startLineNumber,
          message: m.message,
          owner: m.owner,
        });
      }
    }
  }
  return result;
}

/** Returns true if there are blocking diagnostics that should prevent validation. */
export function hasBlockingDiagnostics(
  monaco: typeof monacoNs,
): boolean {
  return collectAllMonacoDiagnostics(monaco).length > 0;
}