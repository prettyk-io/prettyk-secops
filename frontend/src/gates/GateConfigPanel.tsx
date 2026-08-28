/**
 * COS-F7: Gate Configuration Panel.
 *
 * Редактор Gate-политики: `rules[]` = `{finding_type, action, max_count}`.
 * Predefined profiles: «Стандарт ЦБ», «Pre-release», «Emergency».
 */
import { useState, useCallback } from 'react';
import { Button, InputNumber, Select, Typography, Space, Card, Tag, Empty, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';

const FINDING_TYPES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
  { value: 'total', label: 'Total' },
];

const GATE_ACTIONS = [
  { value: 'block', label: 'Block' },
  { value: 'warn', label: 'Warn' },
  { value: 'pass', label: 'Pass' },
];

export interface GateRule {
  finding_type: string;
  action: 'block' | 'warn' | 'pass';
  max_count: number;
}

export interface GateProfile {
  id: string;
  name: string;
  description: string;
  rules: GateRule[];
}

const PROFILES: GateProfile[] = [
  {
    id: 'cbr-standard', name: 'Стандарт ЦБ', description: 'ГОСТ 57580.1 — усиленный',
    rules: [
      { finding_type: 'critical', action: 'block', max_count: 0 },
      { finding_type: 'high', action: 'block', max_count: 3 },
      { finding_type: 'medium', action: 'warn', max_count: 10 },
      { finding_type: 'low', action: 'pass', max_count: 999 },
    ],
  },
  {
    id: 'pre-release', name: 'Pre-release', description: 'Перед релизом',
    rules: [
      { finding_type: 'critical', action: 'block', max_count: 0 },
      { finding_type: 'high', action: 'block', max_count: 5 },
      { finding_type: 'medium', action: 'warn', max_count: 20 },
    ],
  },
  {
    id: 'emergency', name: 'Emergency', description: 'Горячий фикс',
    rules: [
      { finding_type: 'critical', action: 'block', max_count: 0 },
      { finding_type: 'high', action: 'warn', max_count: 10 },
    ],
  },
];

export interface GateConfigPanelProps {
  onSave?: (profile: GateProfile) => void;
  /** E2E-FRONT: когда true — шлём POST /api/gate/policy. */
  live?: boolean;
}

export function GateConfigPanel({ onSave, live = false }: GateConfigPanelProps) {
  const [profileId, setProfileId] = useState('cbr-standard');
  const [rules, setRules] = useState<GateRule[]>(PROFILES[0]!.rules);
  const [saving, setSaving] = useState(false);

  const handleProfileChange = useCallback((id: string) => {
    setProfileId(id);
    const p = PROFILES.find((p) => p.id === id);
    if (p) setRules([...p.rules]);
  }, []);

  const currentProfile = PROFILES.find((p) => p.id === profileId);

  const updateRule = useCallback((index: number, patch: Partial<GateRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const addRule = useCallback(() => {
    setRules((prev) => [...prev, { finding_type: 'high', action: 'warn', max_count: 5 }]);
  }, []);

  const removeRule = useCallback((index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    const profile: GateProfile = {
      id: profileId,
      name: currentProfile?.name ?? '',
      description: currentProfile?.description ?? '',
      rules,
    };

    if (live) {
      setSaving(true);
      try {
        const r = await fetch('/api/gate/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: profileId, rules }),
        });
        if (r.ok) {
          message.success('Политика сохранена');
        } else {
          message.error('Ошибка сохранения');
        }
      } catch {
        message.error('Сервер недоступен');
      } finally {
        setSaving(false);
      }
    }

    onSave?.(profile);
  }, [profileId, currentProfile, rules, live, onSave]);

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Profile selector */}
        <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
          <Typography.Text style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
            Профиль Gate-политики
          </Typography.Text>
          <Select
            value={profileId}
            onChange={handleProfileChange}
            style={{ width: '100%' }}
            size="small"
            options={PROFILES.map((p) => ({ value: p.id, label: p.name }))}
          />
          {currentProfile && (
            <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>{currentProfile.description}</Typography.Text>
          )}
        </Card>

        {/* Rules */}
        <Card size="small" title={<span style={{ color: '#e2e8f0', fontSize: 13 }}>Rules</span>} style={{ background: '#0f172a', borderColor: '#1e293b' }}>
          {rules.length === 0 ? (
            <Empty description="Нет правил" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {rules.map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Select
                    value={rule.finding_type}
                    onChange={(v) => updateRule(i, { finding_type: v })}
                    options={FINDING_TYPES}
                    size="small"
                    style={{ width: 110 }}
                  />
                  <Select
                    value={rule.action}
                    onChange={(v) => updateRule(i, { action: v as GateRule['action'] })}
                    options={GATE_ACTIONS}
                    size="small"
                    style={{ width: 90 }}
                  />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>max</span>
                  <InputNumber
                    value={rule.max_count}
                    onChange={(v) => updateRule(i, { max_count: v ?? 0 })}
                    size="small"
                    min={0}
                    max={999}
                    style={{ width: 70 }}
                  />
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeRule(i)}
                    type="text"
                  />
                </div>
              ))}
            </Space>
          )}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={addRule}
            style={{ marginTop: 8 }}
            type="dashed"
            block
          >
            Добавить правило
          </Button>
        </Card>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          block
          size="small"
        >
          Сохранить Gate-политику
        </Button>
      </Space>
    </div>
  );
}