/**
 * BlankPayload builder — всегда через redact (RES-1 / RES-6).
 */

import { exportWiredPayload } from '../utils/exportWired';
import { redactWiredForPreview } from '../utils/redact';
import { defaultBlankOrg, wiredContentHash } from './blankLetterhead';
import { buildExplorerTree } from './explorerTree';
import {
  BLANK_TEMPLATE_VERSION,
  type BlankKind,
  type BlankOrg,
  type BlankPayload,
  type RunRecord,
} from './types';

export function buildBlankPayload(input: {
  kind: BlankKind;
  formData: unknown;
  org?: BlankOrg;
  run?: RunRecord;
}): BlankPayload {
  const authoring = exportWiredPayload(input.formData, 'authoring');
  const form_snapshot = redactWiredForPreview(authoring);
  const explorer_tree = buildExplorerTree(input.formData);
  const wired_hash = wiredContentHash(form_snapshot);

  return {
    kind: input.kind,
    template_version: BLANK_TEMPLATE_VERSION,
    org: defaultBlankOrg(input.org),
    form_snapshot,
    explorer_tree,
    run: input.run,
    generated_at: new Date().toISOString(),
    wired_hash,
  };
}
