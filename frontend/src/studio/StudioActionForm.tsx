/**
 * In-place creation form after hub tile pick.
 */
import React, { useMemo, useState } from 'react';
import { Button, Input, Typography } from 'antd';
import type { EditorFolder } from './studioFolders';
import {
  hubTileById,
  type HubActionId,
  type HubSubmitPayload,
} from './StudioActionHub';
import {
  listGraphqlSdlResources,
  listOpenApiSpecResources,
  listProtoPackResources,
  type ImportKind,
} from './studioResources';
import {
  buildActionFormPayload,
  validateActionFormDraft,
} from './studioActionFormSubmit';
import {
  ActionKindFields,
  FolderPickerField,
} from './studioActionFormSections';
import { listAuthModuleOptions } from './listAuthModuleOptions';

export interface StudioActionFormProps {
  actionId: HubActionId;
  pageFolders: EditorFolder[];
  scenarioFolders: EditorFolder[];
  formData?: unknown;
  onSubmit: (payload: HubSubmitPayload) => boolean | void;
  onCancel: () => void;
}

const ROOT_FOLDER_KEY = '';

function hubIconClass(actionId: HubActionId): string {
  const keep = actionId === 'create-module' || actionId === 'create-scenario';
  return `pk-studio-action-hub-card-icon${keep ? ' pk-studio-action-hub-card-icon--keep' : ''}`;
}

export const StudioActionForm: React.FC<StudioActionFormProps> = (props) => {
  const tile = hubTileById(props.actionId);
  if (!tile) {
    return null;
  }
  return <StudioActionFormReady {...props} tile={tile} />;
};

type ReadyProps = StudioActionFormProps & {
  tile: NonNullable<ReturnType<typeof hubTileById>>;
};

const StudioActionFormReady: React.FC<ReadyProps> = ({
  actionId,
  pageFolders,
  scenarioFolders,
  formData,
  onSubmit,
  onCancel,
  tile,
}) => {
  const [titleInput, setTitleInput] = useState('');
  const [nameInput, setNameInput] = useState(tile.defaultName ?? '');
  const [folderId, setFolderId] = useState(ROOT_FOLDER_KEY);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resourceKind, setResourceKind] = useState<ImportKind>('data_file');
  const [protoAs, setProtoAs] = useState<string>('');
  const [specAs, setSpecAs] = useState<string>('');
  const [sdlAs, setSdlAs] = useState<string>('');
  const [specMode, setSpecMode] = useState<'resource' | 'url_relative'>('url_relative');
  const [schemaMode, setSchemaMode] = useState<'resource' | 'introspection_relative'>(
    'introspection_relative',
  );
  const [specPathRel, setSpecPathRel] = useState('/openapi.json');
  const [schemaPathRel, setSchemaPathRel] = useState('/graphql');
  const [endpointRel, setEndpointRel] = useState('/graphql');
  const [authModuleId, setAuthModuleId] = useState<string>('');
  const [connectorType, setConnectorType] = useState<string>('');

  const folderOptions = useMemo(() => {
    if (!tile.folderSection) {
      return [];
    }
    const folders = tile.folderSection === 'pages' ? pageFolders : scenarioFolders;
    return [
      { id: ROOT_FOLDER_KEY, title: 'Корень раздела' },
      ...folders.map((folder) => ({ id: folder.id, title: folder.title })),
    ];
  }, [pageFolders, scenarioFolders, tile]);

  const protoOptions = useMemo(
    () => listProtoPackResources(formData).map((r) => ({ value: r.as, label: `${r.as} (${r.path})` })),
    [formData],
  );
  const openApiOptions = useMemo(
    () =>
      listOpenApiSpecResources(formData).map((r) => ({
        value: r.as,
        label: `${r.as} (${r.path})`,
      })),
    [formData],
  );
  const gqlOptions = useMemo(
    () =>
      listGraphqlSdlResources(formData).map((r) => ({
        value: r.as,
        label: `${r.as} (${r.path})`,
      })),
    [formData],
  );
  const authOptions = useMemo(() => listAuthModuleOptions(formData), [formData]);

  const handleSubmit = () => {
    if (tile.isStub) {
      return;
    }
    const draft = {
      actionId,
      name: nameInput,
      title: titleInput,
      folderId:
        tile.folderSection && folderId !== ROOT_FOLDER_KEY ? folderId : undefined,
      resourceKind,
      protoAs,
      specMode,
      specAs,
      specPathRel,
      schemaMode,
      sdlAs,
      schemaPathRel,
      endpointRel,
      authModuleId,
      protoOptionsLen: protoOptions.length,
      openApiOptionsLen: openApiOptions.length,
      gqlOptionsLen: gqlOptions.length,
    };
    const err = validateActionFormDraft(draft);
    if (err) {
      setSubmitError(err);
      return;
    }
    const ok = onSubmit(
      buildActionFormPayload(draft, {
        includeFolder: Boolean(tile.folderSection && folderId !== ROOT_FOLDER_KEY),
      }),
    );
    if (!ok) {
      setSubmitError('Не удалось создать — проверьте идентификатор (дубликат или недопустимый формат)');
    }
  };

  return (
    <div className="pk-studio-action-form" data-testid="studio-action-form">
      <div className="pk-studio-action-form-header">
        <div className="pk-studio-action-hub-icon-wrap">
          <img src={tile.icon} alt="" className="pk-studio-action-hub-card-icon" aria-hidden />
        </div>
        <div className="pk-studio-action-form-meta">
          <div className="pk-studio-action-form-title">{tile.title}</div>
          {tile.description ? (
            <div className="pk-studio-action-form-desc">{tile.description}</div>
          ) : null}
        </div>
      </div>
      {!tile.isStub ? (
        <div className="pk-studio-action-form-body">
          <FolderPickerField
            options={folderOptions}
            folderId={folderId}
            setFolderId={setFolderId}
            clearError={() => setSubmitError(null)}
          />

          <label className="pk-studio-action-form-field">
            <span className="pk-studio-action-form-label">Название</span>
            <Input
              autoFocus
              value={titleInput}
              onChange={(e) => {
                setTitleInput(e.target.value);
                setSubmitError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  e.preventDefault();
                  handleSubmit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="pk-studio-action-form-input"
            />
          </label>

          <label className="pk-studio-action-form-field">
            <span className="pk-studio-action-form-label">Идентификатор</span>
            <Input
              value={nameInput}
              status={submitError ? 'error' : undefined}
              onChange={(e) => {
                setNameInput(e.target.value);
                setSubmitError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  e.preventDefault();
                  handleSubmit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="pk-studio-action-form-input"
            />
          </label>

          <ActionKindFields
            actionId={actionId}
            resourceKind={resourceKind}
            setResourceKind={setResourceKind}
            clearError={() => setSubmitError(null)}
            openApi={{
              specMode,
              setSpecMode,
              specAs,
              setSpecAs,
              specPathRel,
              setSpecPathRel,
              openApiOptions,
              authModuleId,
              setAuthModuleId,
              authOptions,
              submitError,
              clearError: () => setSubmitError(null),
            }}
            graphql={{
              endpointRel,
              setEndpointRel,
              schemaMode,
              setSchemaMode,
              sdlAs,
              setSdlAs,
              schemaPathRel,
              setSchemaPathRel,
              gqlOptions,
              authModuleId,
              setAuthModuleId,
              authOptions,
              submitError,
              clearError: () => setSubmitError(null),
            }}
            grpc={{
              protoAs,
              setProtoAs,
              protoOptions,
              authModuleId,
              setAuthModuleId,
              authOptions,
              submitError,
              clearError: () => setSubmitError(null),
            }}
            connector={actionId === 'create-connector' ? { connectorType, setConnectorType } : undefined}
          />

          {submitError ? (
            <Typography.Text type="danger" className="pk-studio-action-form-error">
              {submitError}
            </Typography.Text>
          ) : null}

          <div className="pk-studio-action-form-actions">
            <Button
              type="primary"
              disabled={!nameInput.trim()}
              onClick={handleSubmit}
              className="pk-studio-action-form-submit"
            >
              Создать
            </Button>
            <Button type="text" onClick={onCancel} className="pk-studio-action-form-cancel">
              Назад
            </Button>
          </div>
        </div>
      ) : (
        <div className="pk-studio-action-form-stub">
          <Typography.Text type="secondary" className="pk-studio-action-form-stub-text">
            Раздел пока недоступен.
          </Typography.Text>
          <div>
            <Button type="text" onClick={onCancel}>
              Назад
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
