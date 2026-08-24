/**
 * Guard-обёртка для декларативного RBAC.
 * Реэкспорт из RoleContext.tsx.
 */

export {
  RoleContext,
  RoleGuard,
  RoleProvider,
  useRoleCaps,
  CanAccessAdmin,
  CanSelectEmergency,
  CanSelectPreRelease,
  CanGenerateAct,
  CanOverrideScanUrl,
  CanUseDebugMode,
  CanSelectWebswing,
  CanimportWired,
} from './RoleContext';

export type { RoleGuardProps, RolePolicy, RoleProviderProps } from './RoleContext';
