/**
 * Studio connector: только активация типа; доступ и packs — Admin / defaults при init.
 */
import { Button, Select, Tag, Typography } from 'antd';
import {
  adminSnapshotForType,
  CONNECTOR_TYPE_LABELS,
  CONNECTOR_TYPES,
  rebindConnectorFromAdmin,
  type ConnectorFields,
  type ConnectorFieldsPatch,
  type ConnectorType,
} from './connectorFields';

export type ConnectorFormProps = {
  value: ConnectorFields;
  onChange: (patch: ConnectorFieldsPatch) => void;
};

const TYPE_OPTIONS = [
  ...CONNECTOR_TYPES.map((value) => ({
    value,
    label: CONNECTOR_TYPE_LABELS[value],
  })),
  {
    value: '__iast_roadmap__',
    label: 'IAST-агент',
    disabled: true,
  },
];

export function ConnectorForm({ value, onChange }: ConnectorFormProps): React.JSX.Element {
  const typeApplied = value.connector_type !== null;
  const snap = adminSnapshotForType(value.connector_type);

  const activateType = (next: ConnectorType | string): void => {
    if (next === '__iast_roadmap__' || !CONNECTOR_TYPES.includes(next as ConnectorType)) {
      return;
    }
    onChange({ connector_type: next } as ConnectorFieldsPatch);
  };

  return (
    <div className="pk-studio-connector-form" data-testid="connector-form">
      <div className="pk-studio-connector-form-head">
        <label className="pk-studio-connector-field" style={{ width: 300 }}>
          <span className="pk-studio-connector-field-label">Тип подключения</span>
          <Select
            value={value.connector_type ?? undefined}
            options={TYPE_OPTIONS}
            onChange={activateType}
            placeholder="Активировать тип…"
            style={{ width: '100%' }}
            aria-label="Тип подключения"
          />
        </label>
        <Button
          size="small"
          style={{ marginTop: 22 }}
          disabled={!typeApplied}
          onClick={() => {
            onChange(rebindConnectorFromAdmin(value));
          }}
        >
          Обновить из Admin
        </Button>
      </div>

      <div
        className="pk-studio-connector-admin-snap"
        data-testid="connector-admin-snapshot"
      >
        <div className="pk-studio-connector-admin-snap-row">
          <Typography.Text type="secondary">Admin → Интеграции</Typography.Text>
          {typeApplied ? (
            <>
              <Tag color={snap.configured ? 'success' : 'default'}>
                {snap.configured ? 'доступ задан' : 'не задан'}
              </Tag>
              <Tag>{snap.health}</Tag>
            </>
          ) : (
            <Tag>не активирован</Tag>
          )}
        </div>
        <Typography.Text className="pk-studio-connector-admin-summary">
          {snap.summary}
        </Typography.Text>
      </div>
    </div>
  );
}
