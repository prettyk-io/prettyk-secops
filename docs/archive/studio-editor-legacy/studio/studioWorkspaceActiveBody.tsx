/**
 * PrettyK pane active document body (S3776 extract from StudioWorkspace).
 */
import React from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ConstructorDiagnostic } from '../keywords/constructor';
import {
  STUDIO_LINE_DECORATIONS_WIDTH,
  constructorOptionsForTheme,
  monacoThemeId,
} from '../monaco/editorOptions';
import type { ThemeId } from '../theme/catalog';
import { bindStudioPrettyEditor } from './bindStudioPrettyEditor';
import { StudioActionHub, type HubActionId, type HubSubmitPayload } from './StudioActionHub';
import { StudioActionForm } from './StudioActionForm';
import type { EditorFolders } from './studioFolders';
import { ResourceFormPanel } from './ResourceFormPanel';
import { FuzzerForm } from './FuzzerForm';
import { ConnectorForm } from './ConnectorForm';
import { OpenApiModuleForm } from './OpenApiModuleForm';
import { GraphqlModuleForm } from './GraphqlModuleForm';
import { GrpcModuleForm } from './GrpcModuleForm';
import { ChainModuleForm } from './ChainModuleForm';
import { AuthFormModuleForm } from './AuthFormModuleForm';
import { AuthActionModuleForm } from './AuthActionModuleForm';
import {
  defaultAuthActionFields,
  defaultAuthFormFields,
  serializeAuthActionConstructor,
  serializeAuthFormConstructor,
} from './authFormFields';
import type { StudioTab } from './studioTabs';
import type { ImportKind, ResourceFields } from './studioResources';
import type { FuzzerFields, FuzzerPatch } from './studioFuzzers';
import type { ConnectorFields, ConnectorFieldsPatch } from './connectorFields';
import type { OpenApiFields, GraphqlFields, GrpcFields } from './apiModuleFields';
import type { ChainFields } from './chainModuleFields';
import { attackBaseFromForm, moduleIdForTab } from './studioWorkspaceChainPlay';
import {
  prettyPaneLabelKind,
  type PrettyPaneMode,
} from './studioWorkspacePaneMeta';

export function PrettyPaneLabel(props: PrettyPaneMode): React.JSX.Element {
  const kind = prettyPaneLabelKind(props);
  if (kind === 'resource') {
    return <>Ресурс</>;
  }
  if (kind === 'fuzzer') {
    return <>Fuzzer</>;
  }
  if (kind === 'connector') {
    return <>Коннектор</>;
  }
  return (
    <span>
      pretty<span className="pk-studio-pane-k">K</span>
    </span>
  );
}

export type StudioPrettyActiveBodyProps = {
  activeTabId: string | undefined;
  openTabs: StudioTab[];
  activeTab: StudioTab | undefined;
  formData: unknown;
  themeId: ThemeId;
  monaco: typeof import('monaco-editor');
  isResourceTab: boolean;
  isFuzzerTab: boolean;
  isConnectorModuleActive: boolean;
  isOpenApiModuleActive: boolean;
  isGraphqlModuleActive: boolean;
  isGrpcModuleActive: boolean;
  isChainModuleActive: boolean;
  isAuthFormUiActive: boolean;
  isAuthActionUiActive: boolean;
  isAuthModuleActive: boolean;
  isPlainDataActive: boolean;
  activeResource: ResourceFields | undefined;
  activeResourceContent: string;
  activeFuzzer: FuzzerFields | undefined;
  activeConnector: ConnectorFields | undefined;
  activeOpenApi: OpenApiFields | undefined;
  activeGraphql: GraphqlFields | undefined;
  activeGrpc: GrpcFields | undefined;
  activeChain: ChainFields | undefined;
  authFormCtorText: string;
  activeModelPath: string | undefined;
  activeLanguageId: string;
  activeDefaultValue: string;
  diagnostics: ConstructorDiagnostic[];
  paintCursorHud: (line: number, column: number, symbol?: string) => void;
  openTabsRef: { current: StudioTab[] };
  activeTabIdRef: { current: string | undefined };
  flushTab: (tab: StudioTab | undefined) => void;
  editorRef: { current: editor.IStandaloneCodeEditor | null };
  handleHubPickAction: (id: HubActionId) => void;
  handleHubExternal: (id: HubActionId) => void;
  hubFormActionId?: HubActionId | null;
  hubFormEpoch?: number;
  hubFolders?: EditorFolders;
  handleHubSubmit?: (payload: HubSubmitPayload) => boolean | void;
  closeHubForm?: () => void;
  patchActiveResource: (patch: {
    path?: string;
    kind?: ImportKind;
    as?: string;
    import_paths?: string[];
  }) => void;
  setActiveResourceContent: (text: string) => void;
  handleSeedHarImport: (opts: { withSequenceScan: boolean }) => void;
  patchActiveFuzzer: (patch: FuzzerPatch) => void;
  patchActiveConnector: (patch: ConnectorFieldsPatch) => void;
  patchActiveOpenApi: (patch: Partial<OpenApiFields>) => void;
  patchActiveGraphql: (patch: Partial<GraphqlFields>) => void;
  patchActiveGrpc: (patch: Partial<GrpcFields>) => void;
  patchActiveChain: (patch: Partial<ChainFields>) => void;
  handleChainApplyPlay: (payload: {
    harAs: string;
    harText: string;
    seed: string;
    fuzzTargets: Array<{ method?: string; url?: string; body?: string }>;
  }) => void;
  patchActiveAuthFormConstructor: (text: string) => void;
  handleEditorChange: (value: string | undefined) => void;
  /** STU-EDITOR-PURE: режим «Редактор» — только Monaco, без форм инструментов. */
  isEditorMode: boolean;
};

function AuthSwitchBar(props: {
  onForm: () => void;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <div style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>
      <button
        type="button"
        className="ant-btn ant-btn-default ant-btn-sm"
        data-testid="auth-form-switch"
        onClick={props.onForm}
      >
        Форма (локаторы)
      </button>
      <button
        type="button"
        className="ant-btn ant-btn-default ant-btn-sm"
        data-testid="auth-action-switch"
        onClick={props.onAction}
      >
        MFA action
      </button>
    </div>
  );
}

function MonacoCtorBody(props: StudioPrettyActiveBodyProps): React.JSX.Element {
  const { themeId, isPlainDataActive, diagnostics, paintCursorHud } = props;
  return (
    <div className="pk-studio-monaco">
      {props.isAuthModuleActive && props.activeTab ? (
        <AuthSwitchBar
          onForm={() =>
            props.patchActiveAuthFormConstructor(
              serializeAuthFormConstructor(defaultAuthFormFields()),
            )
          }
          onAction={() =>
            props.patchActiveAuthFormConstructor(
              serializeAuthActionConstructor(defaultAuthActionFields()),
            )
          }
        />
      ) : null}
      {props.activeModelPath ? (
        <Editor
          height="100%"
          theme={monacoThemeId(themeId)}
          path={props.activeModelPath}
          defaultLanguage={props.activeLanguageId}
          language={props.activeLanguageId}
          defaultValue={props.activeDefaultValue}
          saveViewState
          keepCurrentModel
          options={{
            ...constructorOptionsForTheme(themeId),
            readOnly: false,
            quickSuggestions: !isPlainDataActive,
            suggestOnTriggerCharacters: !isPlainDataActive,
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: STUDIO_LINE_DECORATIONS_WIDTH,
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            wordWrap: 'on',
            padding: { top: 6, bottom: 0 },
            scrollbar: {
              vertical: 'auto',
              horizontal: 'hidden',
              verticalScrollbarSize: 3,
              horizontalScrollbarSize: 0,
              handleMouseWheel: true,
              alwaysConsumeMouseWheel: false,
            },
          }}
          onMount={(instance) => {
            bindStudioPrettyEditor(instance, {
              monaco: props.monaco,
              isPlainDataActive,
              diagnostics,
              paintCursorHud,
              openTabsRef: props.openTabsRef,
              activeTabIdRef: props.activeTabIdRef,
              flushTab: props.flushTab,
              setEditor: (ed) => {
                props.editorRef.current = ed;
              },
            });
          }}
          onChange={props.handleEditorChange}
        />
      ) : null}
    </div>
  );
}

export function renderStudioPrettyActiveBody(
  props: StudioPrettyActiveBodyProps,
): React.ReactNode {
  if (!props.activeTabId || props.activeTabId === 'action-hub' || props.openTabs.length === 0) {
    if (!props.isEditorMode) {
      return (
        <div
          className="pk-studio-empty-main"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 280,
            color: '#64748B',
            fontSize: 13,
            padding: 32,
            textAlign: 'center',
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.35 }}>
            ⚡
          </div>
          <div style={{ color: '#94A3B8', fontWeight: 500 }}>
            Выберите элемент на графе
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6, maxWidth: 280 }}>
            Кликните по любой карточке для просмотра и редактирования параметров, или нажмите <strong style={{ color: '#38BDF8' }}>+</strong> на канвасе для создания
          </div>
        </div>
      );
    }
    return props.hubFormActionId && props.hubFolders && props.handleHubSubmit && props.closeHubForm ? (
      <StudioActionForm
        key={props.hubFormEpoch}
        actionId={props.hubFormActionId}
        pageFolders={props.hubFolders.pages}
        scenarioFolders={props.hubFolders.scenarios}
        formData={props.formData}
        onSubmit={props.handleHubSubmit}
        onCancel={props.closeHubForm}
      />
    ) : (
      <StudioActionHub
        onPickAction={props.handleHubPickAction}
        onExternal={props.handleHubExternal}
      />
    );
  }
  if (props.isResourceTab && props.activeResource) {
    const r = props.activeResource;
    return (
      <ResourceFormPanel
        as={r.as}
        path={r.path}
        kind={r.kind}
        content={props.activeResourceContent}
        importPaths={r.import_paths || []}
        onPatchAs={props.patchActiveResource}
        onContentChange={props.setActiveResourceContent}
        onImportPathsChange={
          r.kind === 'proto_pack'
            ? (paths) => props.patchActiveResource({ import_paths: paths })
            : undefined
        }
        onSeedHarImport={r.kind === 'har_file' ? props.handleSeedHarImport : undefined}
      />
    );
  }
  if (props.isFuzzerTab && props.activeFuzzer) {
    return (
      <FuzzerForm
        value={props.activeFuzzer}
        formData={props.formData}
        onChange={props.patchActiveFuzzer}
      />
    );
  }
  if (props.isConnectorModuleActive && props.activeConnector) {
    return (
      <ConnectorForm value={props.activeConnector} onChange={props.patchActiveConnector} />
    );
  }
  if (props.isOpenApiModuleActive && props.activeOpenApi && props.activeTab) {
    return (
      <OpenApiModuleForm
        value={props.activeOpenApi}
        moduleId={moduleIdForTab(props.activeTab, props.formData, 'openapi')}
        formData={props.formData}
        attackBaseUrl={attackBaseFromForm(props.formData)}
        onChange={props.patchActiveOpenApi}
      />
    );
  }
  if (props.isGraphqlModuleActive && props.activeGraphql && props.activeTab) {
    return (
      <GraphqlModuleForm
        value={props.activeGraphql}
        moduleId={moduleIdForTab(props.activeTab, props.formData, 'graphql')}
        formData={props.formData}
        attackBaseUrl={attackBaseFromForm(props.formData)}
        onChange={props.patchActiveGraphql}
      />
    );
  }
  if (props.isGrpcModuleActive && props.activeGrpc && props.activeTab) {
    return (
      <GrpcModuleForm
        value={props.activeGrpc}
        moduleId={moduleIdForTab(props.activeTab, props.formData, 'grpc')}
        formData={props.formData}
        attackBaseUrl={attackBaseFromForm(props.formData)}
        onChange={props.patchActiveGrpc}
      />
    );
  }
  if (props.isChainModuleActive && props.activeChain && props.activeTab) {
    return (
      <ChainModuleForm
        value={props.activeChain}
        moduleId={moduleIdForTab(props.activeTab, props.formData, 'chain')}
        formData={props.formData}
        onChange={props.patchActiveChain}
        onApplyPlay={props.handleChainApplyPlay}
      />
    );
  }
  if (props.isAuthFormUiActive && props.activeTab) {
    return (
      <AuthFormModuleForm
        constructorText={props.authFormCtorText}
        onConstructorChange={props.patchActiveAuthFormConstructor}
      />
    );
  }
  if (props.isAuthActionUiActive && props.activeTab) {
    return (
      <AuthActionModuleForm
        constructorText={props.authFormCtorText}
        onConstructorChange={props.patchActiveAuthFormConstructor}
      />
    );
  }
  return <MonacoCtorBody {...props} />;
}
