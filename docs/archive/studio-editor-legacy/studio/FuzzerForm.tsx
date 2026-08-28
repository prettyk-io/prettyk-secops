/**
 * Форма сущности Fuzzer: Алгоритм / Таблица троек (targets) / Политика / Сессия.
 * Канон v2: 3 колонки (url | method | corpus), Ctrl+V вставка, авто-дырка от method.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tabs,
  Typography,
} from 'antd';
import {
  addFuzzerTargetRow,
  applyPasteTargetsText,
  removeFuzzerTargetRow,
  updateFuzzerTargetRow,
} from './fuzzerFormTargets';
import {
  corpusOptions,
  FUZZ_WAVE_MODE_OPTIONS,
  normalizeWaveAlgorithm,
  type FuzzerFields,
  type FuzzerFormIssue,
  type FuzzerMethod,
  type FuzzerPatch,
  type FuzzTargetFields,
  PRESET_ATTACK_TEMPLATES,
  validateFuzzerFields,
} from './studioFuzzers';
import { DeferredTextInput } from './fuzzerDeferredInputs';
import { fuzzerTargetsExpandable } from './fuzzerTableExpandable';
import {
  readTrafficInsertionFeedOptIn,
  writeTrafficInsertionFeedOptIn,
} from './trafficInsertionFeed';

export type FuzzerFormProps = {
  value: FuzzerFields;
  formData: unknown;
  onChange: (patch: FuzzerPatch) => void;
  onValidate?: (issues: FuzzerFormIssue[]) => void;
};

export function FuzzerForm({
  value,
  formData,
  onChange,
  onValidate,
}: FuzzerFormProps): React.JSX.Element {
  const [issues, setIssues] = useState<FuzzerFormIssue[]>([]);
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [trafficFeed, setTrafficFeed] = useState(() => readTrafficInsertionFeedOptIn());

  const options = useMemo(() => corpusOptions(formData), [formData]);

  const issueFor = (field: string): string | undefined =>
    issues.find((item) => item.field === field)?.message;

  const runValidate = (): void => {
    const next = validateFuzzerFields(value, formData);
    setIssues(next);
    onValidate?.(next);
  };

  const copyScenarioStep = (): void => {
    const id = value.id.trim() || 'juice_search_q';
    const line = `ФаззингВолна ${id}`;
    void navigator.clipboard?.writeText(line);
  };

  const updateTargetRow = (
    index: number,
    field: keyof FuzzTargetFields,
    val: string,
  ): void => {
    onChange({ targets: updateFuzzerTargetRow(value.targets, index, field, val) });
  };

  const addTargetRow = (): void => {
    onChange({ targets: addFuzzerTargetRow(value.targets) });
  };

  const removeTargetRow = (index: number): void => {
    const nextTargets = removeFuzzerTargetRow(value.targets, index);
    if (nextTargets) {
      onChange({ targets: nextTargets });
    }
  };

  const handleApplyPaste = (): void => {
    setPasteError(null);
    const pasted = applyPasteTargetsText(pasteText);
    if (!pasted.ok) {
      setPasteError(pasted.error);
      return;
    }
    onChange({ targets: pasted.targets });
    setPasteModalVisible(false);
    setPasteText('');
  };

  const targetColumns = [
    {
      title: '#',
      width: 40,
      render: (_: unknown, __: unknown, idx: number) => idx + 1,
    },
    {
      title: 'URL цели',
      dataIndex: 'url',
      key: 'url',
      render: (text: string, _: FuzzTargetFields, idx: number) => (
        <DeferredTextInput
          size="small"
          value={text}
          status={issueFor(`targets[${idx}].url`) ? 'error' : undefined}
          placeholder="http://juice-shop:3000/rest/products/search?q="
          onCommit={(next) => updateTargetRow(idx, 'url', next)}
        />
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 110,
      render: (text: FuzzerMethod, _: FuzzTargetFields, idx: number) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={text}
          options={[
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
            { value: 'DELETE', label: 'DELETE' },
          ]}
          onChange={(method) => updateTargetRow(idx, 'method', method)}
        />
      ),
    },
    {
      title: 'Corpus (словарь)',
      dataIndex: 'corpus',
      key: 'corpus',
      width: 200,
      render: (text: string, _: FuzzTargetFields, idx: number) => (
        <Select
          size="small"
          showSearch
          style={{ width: '100%' }}
          value={text || undefined}
          status={issueFor(`targets[${idx}].corpus`) ? 'error' : undefined}
          options={options}
          placeholder="авто / preset / resource"
          onChange={(corpus) => updateTargetRow(idx, 'corpus', corpus)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => (
        <Button
          size="small"
          type="text"
          danger
          disabled={value.targets.length <= 1}
          onClick={() => removeTargetRow(idx)}
        >
          Удалить
        </Button>
      ),
    },
  ];

  return (
    <div className="pk-studio-fuzzer-form">
      <div className="pk-studio-fuzzer-form-head" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <label className="pk-studio-fuzzer-field" style={{ flex: 1 }}>
          <span>Id</span>
          <DeferredTextInput
            value={value.id}
            status={issueFor('id') ? 'error' : undefined}
            placeholder="juice_search_q"
            onCommit={(next) => {
              onChange({ id: next, label: next.trim() || value.label });
            }}
          />
          {issueFor('id') ? (
            <Typography.Text type="danger" className="pk-studio-fuzzer-hint">
              {issueFor('id')}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" className="pk-studio-fuzzer-hint">
              {`В сценарии: ФаззингВолна ${value.id || 'juice_search_q'}`}
            </Typography.Text>
          )}
        </label>
        <label className="pk-studio-fuzzer-field" style={{ width: 280 }}>
          <span>Алгоритм волны</span>
          <Select
            value={normalizeWaveAlgorithm(value.algorithm)}
            options={FUZZ_WAVE_MODE_OPTIONS}
            status={issueFor('algorithm') ? 'error' : undefined}
            onChange={(next) => {
              onChange({ algorithm: next });
            }}
            style={{ width: '100%' }}
          />
        </label>
        <Button size="small" style={{ marginTop: 22 }} onClick={copyScenarioStep}>
          Копировать шаг
        </Button>
        <Button type="primary" size="small" style={{ marginTop: 22 }} onClick={runValidate}>
          Валидировать форму
        </Button>
      </div>

      {issues.length > 0 ? (
        <Alert
          type="error"
          showIcon
          className="pk-studio-fuzzer-alert"
          message={`${String(issues.length)} ошибок формы`}
          description={issues.map((item) => item.message).join(' · ')}
        />
      ) : null}

      <Tabs
        size="small"
        className="pk-studio-fuzzer-tabs"
        items={[
          {
            key: 'targets',
            label: `Таблица целей (${String(value.targets.length)})`,
            children: (
              <div className="pk-studio-fuzzer-tab">
                <div
                  style={{
                    marginBottom: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <Checkbox
                    data-testid="fuzzer-traffic-insertion-feed"
                    checked={trafficFeed}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setTrafficFeed(on);
                      writeTrafficInsertionFeedOptIn(on);
                    }}
                  >
                    Дополнить цели параметрами из журнала трафика
                  </Checkbox>
                  <Typography.Text
                    type="secondary"
                    className="pk-studio-fuzzer-hint"
                    style={{ display: 'block', opacity: 0.75, fontSize: 12 }}
                  >
                    При запуске в цели волны добавляются имена параметров из
                    журнала трафика scanner (query и поля JSON). Если журнал пуст,
                    список целей не меняется.
                  </Typography.Text>
                </div>
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="small" onClick={addTargetRow}>
                    + Добавить цель
                  </Button>
                  <Button size="small" onClick={() => setPasteModalVisible(true)}>
                    Вставить из буфера (Ctrl+V)
                  </Button>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Шаблон атаки:
                    </Typography.Text>
                    <Select
                      size="small"
                      style={{ width: 260 }}
                      placeholder="Загрузить пресет атаки..."
                      options={Object.values(PRESET_ATTACK_TEMPLATES).map((tmpl) => ({
                        value: tmpl.id,
                        label: tmpl.title,
                      }))}
                      onChange={(presetId) => {
                        const tmpl = PRESET_ATTACK_TEMPLATES[presetId];
                        if (tmpl) {
                          onChange({ targets: tmpl.targets });
                        }
                      }}
                    />
                  </div>
                </div>

                <Table
                  size="small"
                  rowKey={(_, idx) => String(idx)}
                  dataSource={value.targets}
                  columns={targetColumns}
                  pagination={false}
                  expandable={fuzzerTargetsExpandable((row, next) =>
                    updateTargetRow(row, 'body', next),
                  )}
                />
              </div>
            ),
          },
          {
            key: 'policy',
            label: 'Политика',
            children: (
              <div className="pk-studio-fuzzer-tab">
                <label className="pk-studio-fuzzer-field">
                  <span>max_requests</span>
                  <InputNumber
                    min={1}
                    max={25}
                    value={value.policy.max_requests}
                    status={issueFor('policy.max_requests') ? 'error' : undefined}
                    onChange={(next) => {
                      onChange({
                        policy: { max_requests: typeof next === 'number' ? next : 25 },
                      });
                    }}
                  />
                </label>
                <label className="pk-studio-fuzzer-field">
                  <span>requests_per_second</span>
                  <InputNumber
                    min={0.1}
                    max={1}
                    step={0.1}
                    value={value.policy.requests_per_second}
                    status={issueFor('policy.requests_per_second') ? 'error' : undefined}
                    onChange={(next) => {
                      onChange({
                        policy: {
                          requests_per_second: typeof next === 'number' ? next : 1,
                        },
                      });
                    }}
                  />
                </label>
                <Checkbox
                  checked={value.policy.alert_on_server_error}
                  onChange={(event) => {
                    onChange({
                      policy: { alert_on_server_error: event.target.checked },
                    });
                  }}
                >
                  Отмечать 5xx
                </Checkbox>
                <label className="pk-studio-fuzzer-field">
                  <span>latency_multiplier</span>
                  <InputNumber
                    min={1.5}
                    max={5}
                    step={0.1}
                    value={value.policy.latency_multiplier}
                    onChange={(next) => {
                      onChange({
                        policy: {
                          latency_multiplier: typeof next === 'number' ? next : 3,
                        },
                      });
                    }}
                  />
                </label>
                <label className="pk-studio-fuzzer-field">
                  <span>size_ratio</span>
                  <InputNumber
                    min={1.5}
                    max={10}
                    step={0.1}
                    value={value.policy.size_ratio}
                    onChange={(next) => {
                      onChange({
                        policy: { size_ratio: typeof next === 'number' ? next : 3 },
                      });
                    }}
                  />
                </label>
                <label className="pk-studio-fuzzer-field">
                  <span>size_abs_delta</span>
                  <InputNumber
                    min={0}
                    value={value.policy.size_abs_delta}
                    onChange={(next) => {
                      onChange({
                        policy: { size_abs_delta: typeof next === 'number' ? next : 2048 },
                      });
                    }}
                  />
                </label>
              </div>
            ),
          },
          {
            key: 'session',
            label: 'Сессия и Заголовки',
            children: (
              <div className="pk-studio-fuzzer-tab">
                <Checkbox
                  checked={value.session_replay}
                  onChange={(event) => {
                    onChange({ session_replay: event.target.checked });
                  }}
                >
                  Повторить Cookie / Authorization из истории scanner
                </Checkbox>
                <Typography.Text type="secondary" className="pk-studio-fuzzer-hint">
                  Включать только после входа в сценарии. Иначе жёсткий отказ session_missing.
                  По умолчанию у нового фаззера выключено (публичный search).
                </Typography.Text>
                <Checkbox
                  checked={value.follow_redirects}
                  onChange={(event) => {
                    onChange({ follow_redirects: event.target.checked });
                  }}
                >
                  Следовать перенаправлениям
                </Checkbox>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="Вставка целей из буфера обмена (pitchfork-формат)"
        open={pasteModalVisible}
        onOk={handleApplyPaste}
        onCancel={() => {
          setPasteModalVisible(false);
          setPasteError(null);
        }}
        okText="Распарсить и заменить цели"
        cancelText="Отмена"
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Формат строк: <code>URL [METHOD] CORPUS</code> (через табуляцию, запятую или пробелы).
          Без corpus или <code>auto</code> — словарь по дырке на бэке.
          <br />
          Пример: <code>http://example.com/search GET auto</code>
        </Typography.Paragraph>

        <Input.TextArea
          rows={6}
          value={pasteText}
          placeholder={`http://juice-shop:3000/rest/products/search?q=\tGET\tauto\nhttp://juice-shop:3000/api/Users/login\tPOST\tintent_sqli_smoke`}
          onChange={(e) => setPasteText(e.target.value)}
        />

        {pasteError ? (
          <Alert
            type="error"
            style={{ marginTop: 8 }}
            message={pasteError}
          />
        ) : null}
      </Modal>
    </div>
  );
}
