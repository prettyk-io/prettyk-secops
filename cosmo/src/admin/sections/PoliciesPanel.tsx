import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Space, Switch, message } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { loadAdminPolicies, saveAdminPolicies } from '../deployStore';
import { recordGatePolicyPush } from '../gatePolicyFingerprint';
import { pushGatePolicyToLive } from '../gatePolicySerialize';
import { pushRetentionPolicyToLive } from '../retentionPolicySerialize';
import type { AdminPolicies } from '../types';
import { summarizeWaiversExpiry } from '../waiverExpiry';

export function PoliciesPanel(): React.JSX.Element {
  const [form] = Form.useForm<AdminPolicies>();
  const [policies] = useState<AdminPolicies>(() => loadAdminPolicies());
  const [saving, setSaving] = useState(false);
  const waiversWatch = Form.useWatch('waivers', form);
  const waiverSummary = useMemo(
    () => summarizeWaiversExpiry(waiversWatch ?? policies.waivers),
    [waiversWatch, policies.waivers],
  );

  return (
    <div data-testid="admin-policies" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {waiverSummary.expired.length > 0 || waiverSummary.soon.length > 0 ? (
        <Alert
          type={waiverSummary.expired.length > 0 ? 'error' : 'warning'}
          showIcon
          data-testid="admin-waivers-expiry-alert"
          message={
            waiverSummary.expired.length > 0
              ? `Истёкшие waivers: ${waiverSummary.expired.length}`
              : `Скоро истекают waivers: ${waiverSummary.soon.length}`
          }
          description={[
            ...waiverSummary.expired.map((w) => `expired · ${w.title}`),
            ...waiverSummary.soon.map(
              (w) => `soon (${w.daysLeft}d) · ${w.title}`,
            ),
          ].join('; ')}
        />
      ) : null}
      <ProCard title="Политики quality gate и retention" bordered>
        <Form
          form={form}
          layout="vertical"
          initialValues={policies}
          style={{ maxWidth: 560 }}
        >
          <Form.Item
            name="max_critical"
            label="Max Critical (fail_gate)"
            tooltip="ACTIVE Critical выше порога → fail_gate (exit 2). Дефолт 0 = любой Critical валит допуск."
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="max_high"
            label="Max High (fail_gate)"
            tooltip="ACTIVE High выше порога → fail_gate (exit 2). Medium/Low/Info → watch при pass. Дефолт 0."
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="gate_enabled"
            label="Quality gate включён"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="filter_verified_only"
            label="Только verified"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="filter_min_severity"
            label="Min severity (info|low|medium|high|critical)"
          >
            <Input placeholder="пусто = без пола" />
          </Form.Item>
          <Form.Item
            name="filter_exclude_tags"
            label="Exclude tags (через запятую)"
          >
            <Input placeholder="noise, lab" />
          </Form.Item>
          <Form.Item
            name="filter_require_tags"
            label="Require tags (через запятую)"
          >
            <Input placeholder="in-scope" />
          </Form.Item>
          <Form.Item name="filter_max_age_days" label="Max age findings (дни, 0 = off)">
            <InputNumber min={0} max={3650} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="artifact_retention_days" label="Retention артефактов (дни)">
            <InputNumber min={7} max={3650} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="require_pre_release_for_deploy"
            label="Деплой → assessment_purpose = pre_release"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="allow_init_without_sso"
            label="Разрешить init без SSO (lab)"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <TypographyWaiversHeader />
          <Form.List name="waivers">
            {(fields, { add, remove }) => (
              <div data-testid="admin-waivers-list">
                {fields.map((field) => (
                  <Space
                    key={field.key}
                    align="start"
                    style={{ display: 'flex', marginBottom: 8 }}
                    wrap
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'title']}
                      rules={[{ required: true, message: 'title' }]}
                      style={{ marginBottom: 0, minWidth: 140 }}
                    >
                      <Input placeholder="title" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'severity']}
                      style={{ marginBottom: 0, width: 100 }}
                    >
                      <Input placeholder="severity" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'cwe']}
                      style={{ marginBottom: 0, width: 90 }}
                    >
                      <Input placeholder="cwe" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'fingerprint']}
                      style={{ marginBottom: 0, minWidth: 120 }}
                    >
                      <Input placeholder="fingerprint" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'expires_at']}
                      style={{ marginBottom: 0, width: 160 }}
                    >
                      <Input placeholder="expires_at ISO" />
                    </Form.Item>
                    <MinusCircleOutlined
                      onClick={() => remove(field.name)}
                      data-testid={`admin-waiver-remove-${field.name}`}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ title: '', severity: '', expires_at: '' })}
                  icon={<PlusOutlined />}
                  data-testid="admin-waiver-add"
                >
                  Waiver
                </Button>
              </div>
            )}
          </Form.List>

          <Button
            type="primary"
            loading={saving}
            style={{ marginTop: 16 }}
            onClick={async () => {
              const values = form.getFieldsValue(true) as AdminPolicies;
              const cleaned: AdminPolicies = {
                ...values,
                waivers: (values.waivers ?? []).filter((w) => (w.title || '').trim()),
              };
              saveAdminPolicies(cleaned);
              setSaving(true);
              const pushed = await pushGatePolicyToLive(cleaned);
              const retention = await pushRetentionPolicyToLive(cleaned);
              setSaving(false);
              if (pushed.ok) {
                recordGatePolicyPush(cleaned, pushed.path);
              }
              if (pushed.ok && retention.ok) {
                message.success(
                  pushed.path
                    ? `Политики в runtime: ${pushed.path}`
                    : 'Политики сохранены в runtime (Live)',
                );
              } else if (pushed.ok && !retention.ok) {
                message.warning(
                  `Gate OK; retention: ${retention.error || 'недоступен'}`,
                );
              } else {
                message.warning(
                  `Локально сохранено; Live runtime: ${pushed.error || 'недоступен'}`,
                );
              }
            }}
          >
            Сохранить в runtime
          </Button>
        </Form>
      </ProCard>
    </div>
  );
}

function TypographyWaiversHeader(): React.JSX.Element {
  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 600 }}>Waivers (expires_at)</div>
      <div style={{ opacity: 0.65, fontSize: 12 }}>
        Уходят в тот же GatePolicy JSON (Live). Пустой title при сохранении отбрасывается.
      </div>
    </div>
  );
}
