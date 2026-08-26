/**
 * Панель ресурса в Studio (as / path / kind / content) — вынесено из Workspace (S3776).
 */
import { Button, Checkbox, Input, Select, Typography } from 'antd';
import { useState } from 'react';
import { useLocalTextDraft } from '../utils/localTextDraft';
import {
  resourceAsHint,
  resourceContentFooter,
  resourceContentLabel,
  resourceContentPlaceholder,
} from './resourceFormHints';
import {
  isHarImportKind,
  isProtoPackImportKind,
  resourceAsError,
  resourcePathForAs,
  type ImportKind,
} from './studioResources';

const RESOURCE_KIND_OPTIONS: { value: ImportKind; label: string }[] = [
  { value: 'data_file', label: 'data_file (.txt)' },
  { value: 'har_file', label: 'har_file (.har → ВыполнитьЦепь)' },
  { value: 'proto_pack', label: 'proto_pack (.zip / .proto → gRPC)' },
  { value: 'openapi_spec', label: 'openapi_spec (.json / .yaml → OpenAPI)' },
  { value: 'graphql_sdl', label: 'graphql_sdl (.graphql / .sdl → GraphQL)' },
];

function ResourceAsField({
  as,
  path,
  kind,
  onCommit,
}: {
  as: string;
  path: string;
  kind: ImportKind;
  onCommit: (patch: { as: string; path: string }) => void;
}): React.JSX.Element {
  const { draft, onChange, onFocus, onBlur } = useLocalTextDraft(as, (next) => {
    const nextAs = next.trim();
    onCommit({
      as: next,
      path: nextAs ? resourcePathForAs(nextAs, kind) : path,
    });
  });
  const err = resourceAsError(draft);

  return (
    <label className="pk-studio-resource-field">
      <span>Имя (as)</span>
      <Input
        value={draft}
        status={err ? 'error' : undefined}
        placeholder="urls"
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {err ? (
        <Typography.Text type="danger" className="pk-studio-resource-hint">
          {err}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" className="pk-studio-resource-hint">
          {resourceAsHint(kind, draft)}
        </Typography.Text>
      )}
    </label>
  );
}

function ResourceContentField({
  content,
  kind,
  onCommit,
}: {
  content: string;
  kind: ImportKind;
  onCommit: (text: string) => void;
}): React.JSX.Element {
  const { draft, onChange, onFocus, onBlur } = useLocalTextDraft(content, onCommit);

  return (
    <label className="pk-studio-resource-field pk-studio-resource-preview">
      <span>{resourceContentLabel(kind)}</span>
      <Input.TextArea
        value={draft}
        rows={12}
        placeholder={resourceContentPlaceholder(kind)}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <Typography.Text type="secondary" className="pk-studio-resource-hint">
        {resourceContentFooter(kind, draft)}
      </Typography.Text>
    </label>
  );
}

export type ResourceFormPanelProps = {
  as: string;
  path: string;
  kind?: ImportKind;
  content: string;
  importPaths?: string[];
  onPatchAs: (patch: { as: string; path: string }) => void;
  onContentChange: (text: string) => void;
  onImportPathsChange?: (paths: string[]) => void;
  /** HAR: seed ВыполнитьЦепь into first/active scenario */
  onSeedHarImport?: (opts: { withSequenceScan: boolean }) => void;
};

export function ResourceFormPanel({
  as,
  path,
  kind = 'data_file',
  content,
  importPaths = [],
  onPatchAs,
  onContentChange,
  onImportPathsChange,
  onSeedHarImport,
}: ResourceFormPanelProps): React.JSX.Element {
  const har = isHarImportKind(kind);
  const proto = isProtoPackImportKind(kind);
  const [withScan, setWithScan] = useState(false);

  return (
    <div className="pk-studio-resource-form" data-testid="resource-form">
      <ResourceAsField as={as} path={path} kind={kind} onCommit={onPatchAs} />
      <label className="pk-studio-resource-field">
        <span>Путь в пакете</span>
        <Input value={path || resourcePathForAs(as || 'resource', kind)} readOnly />
      </label>
      <label className="pk-studio-resource-field">
        <span>Тип</span>
        <Select value={kind} options={RESOURCE_KIND_OPTIONS} disabled />
      </label>
      {proto && onImportPathsChange ? (
        <label className="pk-studio-resource-field">
          <span>Корни импорта (по строке, необязательно)</span>
          <Input.TextArea
            value={importPaths.join('\n')}
            rows={3}
            placeholder="пусто = корень пакета"
            onChange={(e) =>
              onImportPathsChange(
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      ) : null}
      <ResourceContentField content={content} kind={kind} onCommit={onContentChange} />
      {har && onSeedHarImport ? (
        <div className="pk-studio-resource-field" data-testid="resource-har-seed">
          <Checkbox checked={withScan} onChange={(e) => setWithScan(e.target.checked)}>
            + СканПоследовательности
          </Checkbox>
          <div style={{ marginTop: 8 }}>
            <Button type="primary" size="small" onClick={() => onSeedHarImport({ withSequenceScan: withScan })}>
              Вставить ВыполнитьЦепь в сценарий
            </Button>
          </div>
          <Typography.Text type="secondary" className="pk-studio-resource-hint">
            Без тихого скана: только вставка шагов. Запуск — обычный Launch.
          </Typography.Text>
        </div>
      ) : null}
    </div>
  );
}
