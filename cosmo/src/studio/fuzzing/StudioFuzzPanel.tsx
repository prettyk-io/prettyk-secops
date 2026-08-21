/**
 * CD-9b + INTRUDER-PRO: Панель фаззинга в Studio (Burp Intruder-killer).
 * Изолированный компонент: не трогает PrettyK/WireK и существующие вкладки.
 * Режимы атаки (Sniper / Battering Ram / Pitchfork / Cluster Bomb), мульти-позиции,
 * Payload Sets, фильтры результатов и подсветка отражения пейлоада.
 */
import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ATTACK_MODES,
  PAYLOAD_PRESETS,
  buildAttackRequests,
  computeTotalRequests,
  executeFuzzRequest,
  splitReflectionHighlight,
  DEFAULT_STUDIO_PAYLOADS,
  type AttackMode,
  type FuzzPosition,
  type FuzzRequestItem,
  type FuzzResultItem,
  type GrepRule,
} from './studioFuzzEngine';
import { normalizeFuzzer, type FuzzTargetFields } from '../studioFuzzers';
import { MONO_STACK } from '../../theme/tokens';

interface TargetOption {
  key: string;
  label: string;
  method: string;
  url: string;
  body?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Читает цели фаззинга из formData (test_suites.fuzzers[].targets). */
function collectTargets(formData: unknown): TargetOption[] {
  const suites = asRecord(asRecord(formData).test_suites);
  const fuzzers = Array.isArray(suites.fuzzers) ? suites.fuzzers : [];
  const targets: TargetOption[] = [];
  for (let i = 0; i < fuzzers.length; i += 1) {
    const f = normalizeFuzzer(fuzzers[i], i);
    for (let t = 0; t < f.targets.length; t += 1) {
      const target = f.targets[t] as FuzzTargetFields | undefined;
      if (!target?.url) continue;
      targets.push({
        key: `${f.id || `fuzzer_${i + 1}`}::${t}`,
        label: `${f.id || `fuzzer_${i + 1}`} → ${target.method} ${target.url}`,
        method: target.method,
        url: target.url,
        body: target.body || undefined,
      });
    }
  }
  return targets;
}

/** Извлекает позиции для мутации из URL (query) и JSON body (body_field). */
function detectPositions(target: TargetOption): FuzzPosition[] {
  const positions: FuzzPosition[] = [];
  try {
    const u = new URL(target.url, 'http://127.0.0.1');
    u.searchParams.forEach((value, name) => {
      positions.push({ type: 'query', name, originalValue: value });
    });
  } catch {
    // URL может быть относительным/маской — query не парсим, raw_body всё ещё доступен.
  }
  const canHaveBody = target.method !== 'GET' && target.method !== 'HEAD';
  if (canHaveBody) {
    const body = target.body;
    if (body && (body.trim().startsWith('{') || body.trim().startsWith('['))) {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const key of Object.keys(parsed as Record<string, unknown>)) {
            positions.push({
              type: 'body_field',
              name: key,
              originalValue: String((parsed as Record<string, unknown>)[key] ?? ''),
            });
          }
        }
      } catch {
        // Не-JSON body — raw_body.
      }
    }
    positions.push({ type: 'raw_body', name: 'body', originalValue: body ?? '' });
  }
  return positions;
}

function positionKeyOf(p: FuzzPosition): string {
  return `${p.type}:${p.name}`;
}

function positionLabel(p: FuzzPosition): string {
  if (p.type === 'query') return `query: ${p.name}`;
  if (p.type === 'body_field') return `body_field: ${p.name}`;
  return 'raw_body';
}

const PANEL_STYLE: React.CSSProperties = {
  borderTop: '1px solid var(--pk-border)',
  background: 'var(--pk-surface)',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: 0,
  overflow: 'auto',
};

const CONTROL_ROW: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const PRE_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: 'var(--pk-monaco-surface-wirek, #0b0f15)',
  border: '1px solid var(--pk-border)',
  borderRadius: 5,
  fontFamily: MONO_STACK,
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  color: 'var(--pk-text)',
  maxHeight: 220,
  overflow: 'auto',
};
function statusTag(status: number): React.JSX.Element {
  if (status === 0) return <Tag color="default">ERR</Tag>;
  if (status >= 500) return <Tag color="red">{status}</Tag>;
  if (status >= 400) return <Tag color="orange">{status}</Tag>;
  return <Tag color="green">{status}</Tag>;
}

export function StudioFuzzPanel({ formData }: { formData: unknown }): React.JSX.Element {
  const targets = useMemo(() => collectTargets(formData), [formData]);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [positionKeys, setPositionKeys] = useState<string[]>([]);
  const [mode, setMode] = useState<AttackMode>('sniper');
  const [payloadSets, setPayloadSets] = useState<string[]>([DEFAULT_STUDIO_PAYLOADS.join('\n')]);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<FuzzResultItem[]>([]);
  const [selectedResult, setSelectedResult] = useState<FuzzResultItem | null>(null);
  const [requests, setRequests] = useState<FuzzRequestItem[]>([]);
  const [baselineBody, setBaselineBody] = useState('');
  const [filter5xx, setFilter5xx] = useState(false);
  const [filterDiff, setFilterDiff] = useState(false);
  const [filterSlow, setFilterSlow] = useState(false);
  const [grepMatchPattern, setGrepMatchPattern] = useState('');
  const [grepExtractPattern, setGrepExtractPattern] = useState('');

  const selectedTarget = targets.find((t) => t.key === selectedKey);
  const positions = useMemo(
    () => (selectedTarget ? detectPositions(selectedTarget) : []),
    [selectedTarget],
  );
  const activePositions = useMemo(
    () => positions.filter((p) => positionKeys.includes(positionKeyOf(p))),
    [positions, positionKeys],
  );

  const multiSet = mode === 'pitchfork' || mode === 'cluster_bomb';
  const setCount = multiSet ? Math.max(activePositions.length, 1) : 1;

  const payloadSetsArr = useMemo(() => {
    const base = payloadSets.slice();
    while (base.length < setCount) base.push(DEFAULT_STUDIO_PAYLOADS.join('\n'));
    return base.slice(0, setCount);
  }, [payloadSets, setCount]);

  const parsedSets = useMemo(
    () =>
      payloadSetsArr.map((t) =>
        t
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    [payloadSetsArr],
  );

  const totalRequests = useMemo(
    () => computeTotalRequests(mode, activePositions, parsedSets),
    [mode, activePositions, parsedSets],
  );

  const canRun =
    selectedTarget &&
    activePositions.length > 0 &&
    parsedSets.some((s) => s.length > 0);

  const selectedModeMeta = ATTACK_MODES.find((m) => m.value === mode);

  const updateSetText = (index: number, text: string): void => {
    setPayloadSets((prev) => {
      const next = prev.slice();
      next[index] = text;
      return next;
    });
  };

  const loadPreset = (index: number, presetPayloads: string[]): void => {
    setPayloadSets((prev) => {
      const next = prev.slice();
      next[index] = presetPayloads.join('\n');
      return next;
    });
  };

  const runFuzz = async (): Promise<void> => {
    if (!selectedTarget || activePositions.length === 0) return;
    setRunning(true);
    setResults([]);
    setSelectedResult(null);
    try {
      const items = buildAttackRequests(
        selectedTarget.method,
        selectedTarget.url,
        activePositions,
        parsedSets,
        mode,
        {},
        selectedTarget.body,
      );
      setRequests(items);

      // Baseline: оригинальный запрос без мутации.
      let base = '';
      try {
        const res = await fetch(selectedTarget.url, {
          method: selectedTarget.method,
          body:
            selectedTarget.method !== 'GET' && selectedTarget.method !== 'HEAD'
              ? selectedTarget.body
              : undefined,
        });
        base = await res.text();
      } catch {
        base = '';
      }
      setBaselineBody(base);

      const matchRules: GrepRule[] = grepMatchPattern.trim()
        ? [{ key: 'match', pattern: grepMatchPattern.trim() }]
        : [];
      const extractRules: GrepRule[] = grepExtractPattern.trim()
        ? [{ key: 'extract', pattern: grepExtractPattern.trim(), isRegex: true }]
        : [];

      const out: FuzzResultItem[] = [];
      for (const item of items) {
        const r = await executeFuzzRequest(
          item,
          base,
          fetch,
          matchRules,
          extractRules
        );
        out.push(r);
      }
      setResults(out);
    } finally {
      setRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filter5xx && !(r.status >= 500 || r.status === 0)) return false;
      if (filterDiff && r.diffCount <= 0) return false;
      if (filterSlow && r.elapsedMs <= 1000) return false;
      return true;
    });
  }, [results, filter5xx, filterDiff, filterSlow]);

  const columns: ColumnsType<FuzzResultItem> = [
    { title: '#', width: 48, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    {
      title: 'Payload',
      dataIndex: 'payload',
      key: 'payload',
      ellipsis: true,
      render: (v: string) => (
        <Typography.Text style={{ fontFamily: MONO_STACK, fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 80, render: (v: number) => statusTag(v) },
    { title: 'Length', dataIndex: 'length', key: 'length', width: 80 },
    { title: 'Time', dataIndex: 'elapsedMs', key: 'elapsedMs', width: 80, render: (v: number) => `${v}ms` },
    {
      title: 'Diff',
      dataIndex: 'diffCount',
      key: 'diffCount',
      width: 80,
      render: (v: number) =>
        v > 0 ? <Tag color="volcano">+{v}</Tag> : <Tag color="default">0</Tag>,
    },
    {
      title: 'Match',
      key: 'grepMatch',
      width: 80,
      render: (_: unknown, r: FuzzResultItem) => {
        if (!r.grepMatches || Object.keys(r.grepMatches).length === 0) return '—';
        const isMatched = Object.values(r.grepMatches).some(Boolean);
        return isMatched ? <Tag color="error">MATCH</Tag> : <Tag color="default">no</Tag>;
      },
    },
    {
      title: 'Extract',
      key: 'grepExtract',
      ellipsis: true,
      render: (_: unknown, r: FuzzResultItem) => {
        if (!r.grepExtracts) return '—';
        const vals = Object.values(r.grepExtracts).flat();
        if (vals.length === 0) return '—';
        return (
          <Typography.Text style={{ fontFamily: MONO_STACK, fontSize: 11 }} ellipsis>
            {vals.join(', ')}
          </Typography.Text>
        );
      },
    },
  ];

  const selectedRequest = selectedResult
    ? requests.find((r) => r.id === selectedResult.id)
    : undefined;

  const reflectionParts = selectedResult
    ? splitReflectionHighlight(selectedResult.responseBody, selectedResult.payload)
    : [];

  return (
    <div style={PANEL_STYLE} className="pk-studio-fuzz-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          Фаззинг (Burp Intruder-killer)
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          режимы атаки, мульти-позиции и словари пейлоадов
        </Typography.Text>
      </div>

      <div style={CONTROL_ROW}>
        <Select
          style={{ minWidth: 360 }}
          placeholder="Цель (RequestTemplate / URL из ServiceMap)"
          value={selectedKey}
          options={targets.map((t) => ({ value: t.key, label: t.label }))}
          onChange={(k) => {
            setSelectedKey(k);
            setPositionKeys([]);
            setResults([]);
          }}
          notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет целей" />}
        />
        <Select
          mode="multiple"
          style={{ minWidth: 260 }}
          placeholder="Позиции / параметры"
          value={positionKeys}
          disabled={!selectedTarget}
          options={positions.map((p) => ({
            value: positionKeyOf(p),
            label: positionLabel(p),
          }))}
          onChange={setPositionKeys}
          allowClear
        />
      </div>

      <div style={CONTROL_ROW}>
        <Select<AttackMode>
          style={{ minWidth: 240 }}
          value={mode}
          options={ATTACK_MODES.map((m) => ({
            value: m.value,
            label: `${m.emoji} ${m.label}`,
          }))}
          onChange={setMode}
        />
        {selectedModeMeta ? (
          <Tooltip title={selectedModeMeta.hint}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {selectedModeMeta.hint}
            </Typography.Text>
          </Tooltip>
        ) : null}
        <Tag
          color={totalRequests > 0 ? 'blue' : 'default'}
          style={{ fontFamily: MONO_STACK, fontSize: 12 }}
        >
          запросов: {totalRequests}
        </Tag>
        <Button
          type="primary"
          loading={running}
          disabled={!canRun}
          onClick={() => {
            void runFuzz();
          }}
        >
          Запустить пачку
        </Button>
      </div>

      {multiSet ? (
        <Tabs
          size="small"
          activeKey={String(activeSetIndex)}
          onChange={(k) => setActiveSetIndex(Number(k))}
          items={payloadSetsArr.map((text, i) => ({
            key: String(i),
            label: `Payload Set ${i + 1}${
              activePositions[i] ? ` · ${positionLabel(activePositions[i]!)}` : ''
            }`,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <Space wrap size={4}>
                  {PAYLOAD_PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      size="small"
                      onClick={() => loadPreset(i, preset.payloads)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </Space>
                <Input.TextArea
                  rows={4}
                  value={text}
                  onChange={(e) => updateSetText(i, e.target.value)}
                  placeholder={`Пейлоады набора ${i + 1} — по одному на строку`}
                  style={{ fontFamily: MONO_STACK, fontSize: 12 }}
                />
              </Space>
            ),
          }))}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          <Space wrap size={4}>
            {PAYLOAD_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                size="small"
                onClick={() => loadPreset(0, preset.payloads)}
              >
                {preset.label}
              </Button>
            ))}
          </Space>
          <Input.TextArea
            rows={4}
            value={payloadSetsArr[0] ?? ''}
            onChange={(e) => updateSetText(0, e.target.value)}
            placeholder="Пейлоады — по одному на строку"
            style={{ fontFamily: MONO_STACK, fontSize: 12 }}
          />
        </Space>
      )}

      <div style={CONTROL_ROW}>
        <Input
          size="small"
          style={{ minWidth: 200, maxWidth: 280, fontFamily: MONO_STACK, fontSize: 12 }}
          placeholder="Grep Match (подстрока / regex)"
          value={grepMatchPattern}
          onChange={(e) => setGrepMatchPattern(e.target.value)}
          allowClear
        />
        <Input
          size="small"
          style={{ minWidth: 240, maxWidth: 320, fontFamily: MONO_STACK, fontSize: 12 }}
          placeholder="Grep Extract regex (e.g. token=([a-z0-9]+))"
          value={grepExtractPattern}
          onChange={(e) => setGrepExtractPattern(e.target.value)}
          allowClear
        />
      </div>

      {results.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          <Space wrap size={12}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Фильтры:
            </Typography.Text>
            <Checkbox checked={filter5xx} onChange={(e) => setFilter5xx(e.target.checked)}>
              Только 5xx / Аномалии
            </Checkbox>
            <Checkbox checked={filterDiff} onChange={(e) => setFilterDiff(e.target.checked)}>
              Только изменения длины (Diff &gt; 0)
            </Checkbox>
            <Checkbox checked={filterSlow} onChange={(e) => setFilterSlow(e.target.checked)}>
              Только медленные (&gt; 1s)
            </Checkbox>
          </Space>
          <Table<FuzzResultItem>
            size="small"
            rowKey="id"
            dataSource={filteredResults}
            columns={columns}
            pagination={false}
            scroll={{ y: 220 }}
            onRow={(record) => ({
              onClick: () => setSelectedResult(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Space>
      ) : null}

      {selectedResult && selectedRequest ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text strong style={{ fontSize: 12 }}>
            Raw Request / Response
          </Typography.Text>
          <pre style={PRE_STYLE}>
            {selectedRequest.method} {selectedRequest.url}
            {selectedRequest.body ? `\n\n${selectedRequest.body}` : ''}
          </pre>
          <pre style={PRE_STYLE}>
            {selectedResult.error
              ? `ERROR: ${selectedResult.error}`
              : `HTTP ${selectedResult.status} · ${selectedResult.length} bytes · ${selectedResult.elapsedMs}ms\n\n`}
            {selectedResult.error
              ? null
              : reflectionParts.map((part, i) =>
                  part.match ? (
                    <mark key={i} className="pk-fuzz-reflection-mark">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
          </pre>
        </Space>
      ) : null}

      {selectedTarget && positionKeys.length === 0 && positions.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Для этой цели не найдено позиций для мутации (нет query-параметров и тела).
        </Typography.Text>
      ) : null}
    </div>
  );
}
