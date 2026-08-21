/**
 * Field sections for StudioActionForm (Sonar S3776 extract).
 */
import React from 'react';
import { Select } from 'antd';
import type { ImportKind } from './studioResources';

type Opt = { value: string; label: string };

export function ResourceKindField(props: {
  value: ImportKind;
  onChange: (v: ImportKind) => void;
}): React.JSX.Element {
  return (
    <label className="pk-studio-action-form-field">
      <span className="pk-studio-action-form-label">Тип ресурса</span>
      <Select
        value={props.value}
        style={{ width: '100%' }}
        options={[
          { value: 'data_file', label: 'data_file (.txt)' },
          { value: 'har_file', label: 'har_file (.har)' },
          { value: 'proto_pack', label: 'proto_pack (.zip / .proto)' },
          { value: 'openapi_spec', label: 'openapi_spec (.json / .yaml)' },
          { value: 'graphql_sdl', label: 'graphql_sdl (.graphql / .sdl)' },
        ]}
        onChange={props.onChange}
      />
    </label>
  );
}

export function OpenApiCreateFields(props: {
  specMode: 'resource' | 'url_relative';
  setSpecMode: (v: 'resource' | 'url_relative') => void;
  specAs: string;
  setSpecAs: (v: string) => void;
  specPathRel: string;
  setSpecPathRel: (v: string) => void;
  openApiOptions: Opt[];
  authModuleId: string;
  setAuthModuleId: (v: string) => void;
  authOptions: Opt[];
  submitError: string | null;
  clearError: () => void;
}): React.JSX.Element {
  return (
    <>
      <label className="pk-studio-action-form-field">
        <span className="pk-studio-action-form-label">Источник схемы</span>
        <Select
          value={props.specMode}
          style={{ width: '100%' }}
          options={[
            { value: 'url_relative', label: 'Относительный путь к URL атаки' },
            { value: 'resource', label: 'Ресурс openapi_spec' },
          ]}
          onChange={(v: 'resource' | 'url_relative') => {
            props.setSpecMode(v);
            props.clearError();
          }}
        />
      </label>
      {props.specMode === 'resource' ? (
        <label className="pk-studio-action-form-field">
          <span className="pk-studio-action-form-label">Ресурс openapi_spec</span>
          <Select
            value={props.specAs || undefined}
            style={{ width: '100%' }}
            placeholder={
              props.openApiOptions.length === 0
                ? 'Нет ресурсов — создайте openapi_spec'
                : 'Выберите ресурс'
            }
            options={props.openApiOptions}
            onChange={(v: string) => {
              props.setSpecAs(v);
              props.clearError();
            }}
            status={props.submitError && !props.specAs ? 'error' : undefined}
          />
        </label>
      ) : null}
      <AuthModuleSelect
        authModuleId={props.authModuleId}
        setAuthModuleId={(v) => {
          props.setAuthModuleId(v);
          props.clearError();
        }}
        authOptions={props.authOptions}
      />
    </>
  );
}

export function GraphqlCreateFields(props: {
  endpointRel: string;
  setEndpointRel: (v: string) => void;
  schemaMode: 'resource' | 'introspection_relative';
  setSchemaMode: (v: 'resource' | 'introspection_relative') => void;
  sdlAs: string;
  setSdlAs: (v: string) => void;
  schemaPathRel: string;
  setSchemaPathRel: (v: string) => void;
  gqlOptions: Opt[];
  authModuleId: string;
  setAuthModuleId: (v: string) => void;
  authOptions: Opt[];
  submitError: string | null;
  clearError: () => void;
}): React.JSX.Element {
  return (
    <>
      <label className="pk-studio-action-form-field">
        <span className="pk-studio-action-form-label">GraphQL endpoint (URL атаки)</span>
        <input
          type="text"
          value={props.endpointRel}
          onChange={(e) => {
            props.setEndpointRel(e.target.value);
            props.clearError();
          }}
          className="ant-input pk-studio-action-form-input"
        />
      </label>
      <label className="pk-studio-action-form-field">
        <span className="pk-studio-action-form-label">Источник схемы GraphQL</span>
        <Select
          value={props.schemaMode}
          style={{ width: '100%' }}
          options={[
            {
              value: 'introspection_relative',
              label: 'Introspection по относительному пути',
            },
            { value: 'resource', label: 'Ресурс graphql_sdl' },
          ]}
          onChange={(v: 'resource' | 'introspection_relative') => {
            props.setSchemaMode(v);
            props.clearError();
          }}
        />
      </label>
      {props.schemaMode === 'resource' ? (
        <label className="pk-studio-action-form-field">
          <span className="pk-studio-action-form-label">Ресурс graphql_sdl</span>
          <Select
            value={props.sdlAs || undefined}
            style={{ width: '100%' }}
            placeholder={
              props.gqlOptions.length === 0
                ? 'Нет ресурсов — создайте graphql_sdl'
                : 'Выберите ресурс'
            }
            options={props.gqlOptions}
            onChange={(v: string) => {
              props.setSdlAs(v);
              props.clearError();
            }}
            status={props.submitError && !props.sdlAs ? 'error' : undefined}
          />
        </label>
      ) : null}
      <AuthModuleSelect
        authModuleId={props.authModuleId}
        setAuthModuleId={(v) => {
          props.setAuthModuleId(v);
          props.clearError();
        }}
        authOptions={props.authOptions}
      />
    </>
  );
}

export function GrpcCreateFields(props: {
  protoAs: string;
  setProtoAs: (v: string) => void;
  protoOptions: Opt[];
  authModuleId: string;
  setAuthModuleId: (v: string) => void;
  authOptions: Opt[];
  submitError: string | null;
  clearError: () => void;
}): React.JSX.Element {
  return (
    <>
      <label className="pk-studio-action-form-field">
        <span className="pk-studio-action-form-label">Пакет proto (imports)</span>
        <Select
          value={props.protoAs || undefined}
          style={{ width: '100%' }}
          placeholder={
            props.protoOptions.length === 0
              ? 'Нет ресурсов proto_pack — сначала импортируйте'
              : 'Выберите ресурс proto_pack'
          }
          options={props.protoOptions}
          onChange={(v: string) => {
            props.setProtoAs(v);
            props.clearError();
          }}
          status={props.submitError && !props.protoAs ? 'error' : undefined}
        />
      </label>
      <AuthModuleSelect
        authModuleId={props.authModuleId}
        setAuthModuleId={(v) => {
          props.setAuthModuleId(v);
          props.clearError();
        }}
        authOptions={props.authOptions}
      />
    </>
  );
}

export function ActionKindFields(props: {
  actionId: string;
  resourceKind: ImportKind;
  setResourceKind: (k: ImportKind) => void;
  clearError: () => void;
  openApi: Parameters<typeof OpenApiCreateFields>[0];
  graphql: Parameters<typeof GraphqlCreateFields>[0];
  grpc: Parameters<typeof GrpcCreateFields>[0];
  connector?: { connectorType: string; setConnectorType: (v: string) => void };
}): React.JSX.Element | null {
  if (props.actionId === 'create-resource') {
    return (
      <ResourceKindField
        value={props.resourceKind}
        onChange={(k) => {
          props.setResourceKind(k);
          props.clearError();
        }}
      />
    );
  }
  if (props.actionId === 'create-connector' && props.connector) {
    return (
      <label className="pk-studio-action-form-field">
        <span className="pk-studio-action-form-label">Тип коннектора</span>
        <Select
          value={props.connector.connectorType || undefined}
          style={{ width: '100%' }}
          placeholder="Выберите тип"
          options={[
            { value: '', label: 'Коннектор (REST/SOAP)' },
            { value: 'openapi', label: 'OpenAPI' },
            { value: 'graphql', label: 'GraphQL' },
            { value: 'grpc', label: 'gRPC' },
            { value: 'chain', label: 'Цепь' },
          ]}
          onChange={(v: string) => {
            props.connector?.setConnectorType(v);
            props.clearError();
          }}
        />
      </label>
    );
  }
  if (props.actionId === 'create-openapi') {
    return <OpenApiCreateFields {...props.openApi} />;
  }
  if (props.actionId === 'create-graphql') {
    return <GraphqlCreateFields {...props.graphql} />;
  }
  if (props.actionId === 'create-grpc') {
    return <GrpcCreateFields {...props.grpc} />;
  }
  return null;
}

export function FolderPickerField(props: {
  options: Array<{ id: string; title: string }>;
  folderId: string;
  setFolderId: (id: string) => void;
  clearError: () => void;
}): React.JSX.Element | null {
  if (props.options.length === 0) {
    return null;
  }
  return (
    <div className="pk-studio-action-form-field">
      <span className="pk-studio-action-form-label">Группа</span>
      <div className="pk-studio-action-folder-options" role="listbox">
        {props.options.map((option) => {
          const active = props.folderId === option.id;
          return (
            <button
              key={option.id || 'root'}
              type="button"
              role="option"
              aria-selected={active}
              className={`pk-studio-action-folder-option${
                active ? ' pk-studio-action-folder-option--active' : ''
              }`}
              onClick={() => {
                props.setFolderId(option.id);
                props.clearError();
              }}
            >
              {option.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuthModuleSelect(props: {
  authModuleId: string;
  setAuthModuleId: (v: string) => void;
  authOptions: Opt[];
}): React.JSX.Element {
  return (
    <label className="pk-studio-action-form-field">
      <span className="pk-studio-action-form-label">Авторизация (необязательно)</span>
      <Select
        value={props.authModuleId || undefined}
        style={{ width: '100%' }}
        allowClear
        placeholder="без профиля"
        options={props.authOptions}
        onChange={(v: string) => props.setAuthModuleId(v || '')}
      />
    </label>
  );
}
