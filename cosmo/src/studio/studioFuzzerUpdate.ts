/**
 * updateFuzzer patch apply (S3776).
 */
import type { FuzzerFields, FuzzerPatch, FuzzTargetFields } from './studioFuzzers';

export function applyFuzzerPatch(
  prev: FuzzerFields,
  patch: FuzzerPatch,
  opts: {
    idError: (id: string) => string | undefined;
    emptyTarget: FuzzTargetFields;
    formHasId: (id: string) => boolean;
  },
): FuzzerFields | undefined {
  const nextId = patch.id !== undefined ? patch.id.trim() : prev.id;
  if (
    nextId &&
    !opts.idError(nextId) &&
    nextId !== prev.id &&
    opts.formHasId(nextId)
  ) {
    return undefined;
  }

  let nextTargets: FuzzTargetFields[] =
    patch.targets !== undefined ? patch.targets : prev.targets;
  if (patch.corpus !== undefined && nextTargets.length > 0) {
    const first = nextTargets[0] ?? opts.emptyTarget;
    nextTargets = [{ ...first, corpus: patch.corpus }, ...nextTargets.slice(1)];
  }

  const primaryTarget = nextTargets[0] ?? opts.emptyTarget;

  return {
    id: nextId,
    label: patch.label !== undefined ? patch.label : prev.label || nextId,
    algorithm: patch.algorithm !== undefined ? patch.algorithm : prev.algorithm,
    targets: nextTargets,
    policy: { ...prev.policy, ...(patch.policy ?? {}) },
    session_replay:
      patch.session_replay !== undefined ? patch.session_replay : prev.session_replay,
    headers: patch.headers !== undefined ? patch.headers : prev.headers,
    follow_redirects:
      patch.follow_redirects !== undefined ? patch.follow_redirects : prev.follow_redirects,
    message: {
      ...prev.message,
      ...(patch.message ?? {}),
      url: primaryTarget.url,
      method: 'GET',
    },
    location: { ...prev.location, ...(patch.location ?? {}) },
    corpus: primaryTarget.corpus,
  };
}
