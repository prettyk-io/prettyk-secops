/**
 * Preview pane label for StudioWorkspace (S3776).
 * Language id string kept here to avoid importing monaco/setup in unit tests.
 */
export const PLAIN_TEXT_LANGUAGE = 'plaintext';

export function resourceLanguageFromPath(path: string | undefined): string {
  if (!path) return 'plaintext';
  const lower = path.toLowerCase();
  if (lower.endsWith('.json') || lower.endsWith('.har')) return 'json';
  if (lower.endsWith('.properties') || lower.endsWith('.env')) return 'ini';
  if (lower.endsWith('.proto')) return 'proto';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.graphql') || lower.endsWith('.sdl')) return 'graphql';
  if (lower.endsWith('.xml') || lower.endsWith('.svg')) return 'xml';
  return 'plaintext';
}

export type PrettyPaneMode = {
  isResourceTab: boolean;
  isFuzzerTab: boolean;
  isConnectorTab?: boolean;
  isConnectorModuleActive?: boolean;
};

export function prettyPaneLabelKind(
  mode: PrettyPaneMode,
): 'resource' | 'fuzzer' | 'connector' | 'prettyk' {
  if (mode.isResourceTab) {
    return 'resource';
  }
  if (mode.isFuzzerTab) {
    return 'fuzzer';
  }
  if (mode.isConnectorTab || mode.isConnectorModuleActive) {
    return 'connector';
  }
  return 'prettyk';
}
