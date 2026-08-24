/**
 * Wire `data|let|…` / `data|secret|…` name harvest (S3776).
 */
import { rootNameFromRefPath } from './refs';

export function collectNamesFromWire(text: string, found: Set<string>): void {
  let from = 0;
  while (from < text.length) {
    const idx = text.toLowerCase().indexOf('data|', from);
    if (idx < 0) {
      break;
    }
    const afterData = text.slice(idx + 'data|'.length);
    const actionEnd = afterData.indexOf('|');
    if (actionEnd < 0) {
      break;
    }
    const action = afterData.slice(0, actionEnd).toLowerCase();
    if (action !== 'let' && action !== 'secret') {
      from = idx + 5;
      continue;
    }
    const pathStart = idx + 'data|'.length + actionEnd + 1;
    const pathEnd = text.indexOf('|', pathStart);
    if (pathEnd < 0) {
      break;
    }
    const path = text.slice(pathStart, pathEnd);
    const root = rootNameFromRefPath(path);
    if (root !== undefined) {
      found.add(root);
    }
    from = pathEnd + 1;
  }
}
