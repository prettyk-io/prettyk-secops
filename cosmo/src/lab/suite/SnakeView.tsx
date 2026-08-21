import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Progress, Space, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  StopOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useLabSession } from '../LabSessionProvider';
import {
  fetchLabDetail,
  fetchLabResults,
  startLabIntruder,
  stopLabIntruder,
  type LabResultItem,
} from '../labApi';
import { ResultsTable } from '../components/ResultsTable';
import { ResultsInspector } from '../components/ResultsInspector';
import { SuiteResults } from './SuiteResults';
import type { LabDetailItem } from '../labApi';

const { Text } = Typography;

const SNAKE_CELL = 10;
const SNAKE_GAP = 2;
const SNAKE_COLS = 40;

type CellState = 'empty' | 'ok' | 'err4' | 'err5' | 'match' | 'current';

interface AttackRunState {
  attackIndex: number;
  attackId: string;
  results: LabResultItem[];
  completed: number;
  total: number;
  isRunning: boolean;
  done: boolean;
}

function cellClass(state: CellState): string {
  switch (state) {
    case 'ok': return '#22C55E';
    case 'err4': return '#EAB308';
    case 'err5': return '#EF4444';
    case 'match': return '#9333EA';
    case 'current': return '#38BDF8';
    default: return '#1E293B';
  }
}

export interface SnakeViewProps {
  onDone: () => void;
  onStop: () => void;
}

export function SnakeView({ onDone, onStop }: SnakeViewProps) {
  const { session, setRunning, setProgress, setResults } = useLabSession();
  const { suiteAttacks } = session;

  const [runs, setRuns] = useState<AttackRunState[]>(() =>
    suiteAttacks.map((_, i) => ({
      attackIndex: i,
      attackId: '',
      results: [],
      completed: 0,
      total: 0,
      isRunning: false,
      done: false,
    }))
  );
  const [activeRunIdx, setActiveRunIdx] = useState(0);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<LabDetailItem | null>(null);
  const [allDone, setAllDone] = useState(false);
  const startedRef = useRef(false);

  // Start attacks sequentially
  useEffect(() => {
    if (startedRef.current) return;
    if (suiteAttacks.length === 0) return;
    startedRef.current = true;

    const startNext = async (idx: number) => {
      if (idx >= suiteAttacks.length) {
        setAllDone(true);
        return;
      }

      const attack = suiteAttacks[idx];
      if (!attack) { startNext(idx + 1); return; }
      const attackId = `suite_${Date.now()}_${idx}`;

      setRuns((prev) => prev.map((r, i) =>
        i === idx ? { ...r, attackId, isRunning: true } : r
      ));
      setActiveRunIdx(idx);

      const matchRules = attack.grepMatchPattern
        .split('|').filter(Boolean)
        .map((p, mi) => ({ key: `m_${mi}`, pattern: p.trim(), is_regex: false }));

      const extractRules = attack.grepExtractPattern
        ? [{ key: 'token', pattern: attack.grepExtractPattern, is_regex: true, group: 1 }]
        : [];

      const payloadSets = attack.payloadSets.map((ps) => ps.customItems);

      await startLabIntruder({
        attack_id: attackId,
        raw_http: attack.rawHttp,
        attack_mode: attack.attackMode,
        payload_sets: payloadSets.length > 0 ? payloadSets : [['test']],
         grep_match_rules: matchRules,
         grep_extract_rules: extractRules,
         encoders: attack.payloadSets[0]?.encoders,
         prefix: attack.payloadSets[0]?.prefix,
         suffix: attack.payloadSets[0]?.suffix,
       });

      // Poll until done
      const poll = setInterval(async () => {
        const data = await fetchLabResults(attackId, 0, 500);
        if (data.ok) {
          setRuns((prev) => prev.map((r, i) => {
            if (i !== idx) return r;
            const running = data.is_running && data.completed < data.total;
            return {
              ...r,
              results: data.results,
              completed: data.completed,
              total: data.total,
              isRunning: running,
              done: !running && data.total > 0,
            };
          }));
          if (!data.is_running && data.completed >= data.total && data.total > 0) {
            clearInterval(poll);
            startNext(idx + 1);
          }
        }
      }, 600);
    };

    startNext(0);
  }, []);

  const handleStop = useCallback(async () => {
    const currentRun = runs[activeRunIdx];
    if (currentRun?.attackId) {
      await stopLabIntruder(currentRun.attackId);
    }
    setRuns((prev) => prev.map((r, i) =>
      i === activeRunIdx ? { ...r, isRunning: false, done: true } : r
    ));
    setAllDone(true);
  }, [runs, activeRunIdx]);

  const handleSelectResult = useCallback(async (id: number) => {
    setSelectedResultId(id);
    const currentRun = runs[activeRunIdx];
    if (!currentRun?.attackId) return;
    const res = await fetchLabDetail(currentRun.attackId, id);
    if (res.ok && res.detail) setSelectedDetail(res.detail);
  }, [runs, activeRunIdx]);

  // Total progress
  const totalAll = runs.reduce((s, r) => s + r.total, 0);
  const doneAll = runs.reduce((s, r) => s + r.completed, 0);

  const attackSummaries = useMemo(() => runs.map((run, i) => ({
    attackIndex: i,
    attackId: run.attackId,
    mode: suiteAttacks[i]?.attackMode || 'sniper',
    completed: run.completed,
    total: run.total,
    results: run.results,
  })), [runs, suiteAttacks]);

  // Results data for SuiteResults
  const allResults = useMemo(() => runs.flatMap((r) => r.results), [runs]);
  const matchCount = useMemo(() =>
    allResults.filter((r) => Object.values(r.grep_matches || {}).some(Boolean)).length,
    [allResults]);

  const handleRepeat = useCallback(() => {
    startedRef.current = false;
    setAllDone(false);
    setRuns(suiteAttacks.map((_, i) => ({
      attackIndex: i, attackId: '', results: [],
      completed: 0, total: 0, isRunning: false, done: false,
    })));
    setActiveRunIdx(0);
  }, [suiteAttacks]);

  const handleNew = useCallback(() => {
    onStop();
  }, [onStop]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <Text strong style={{ color: '#F8FAFC', fontSize: 15 }}>
            Suite Execution — Змейка
          </Text>
          {!allDone && (
            <Text style={{ color: '#38BDF8', fontSize: 12, marginLeft: 8 }}>
              Атака {activeRunIdx + 1}/{suiteAttacks.length}
            </Text>
          )}
        </div>
        <Space>
          {allDone ? (
            <>
              <Button icon={<DownloadOutlined />}
                style={{ borderRadius: 5 }}>
                Save Results & Evidence
              </Button>
              <Button icon={<ReloadOutlined />}
                style={{ borderRadius: 5 }}>
                Repeat Suite
              </Button>
            </>
          ) : (
            <Button danger icon={<StopOutlined />} onClick={handleStop}
              style={{ borderRadius: 5 }}>
              Остановить
            </Button>
          )}
        </Space>
      </div>

      {/* Overall progress */}
      {totalAll > 0 && (
        <div style={{ padding: '8px 24px' }}>
          <Progress
            percent={Math.round((doneAll / Math.max(totalAll, 1)) * 100)}
            size="small"
            strokeColor={{ from: '#9333EA', to: '#38BDF8' }}
            format={() => `${doneAll}/${totalAll}`}
          />
        </div>
      )}

      {/* Snake grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {runs.map((run, ri) => {
            const attack = suiteAttacks[ri];
            if (!attack) return null;
            const cells = run.total > 0 ? Math.min(run.total, run.results.length || run.total) : 0;

            return (
              <Card
                key={ri}
                size="small"
                style={{
                  background: ri === activeRunIdx ? 'rgba(56,189,248,0.05)' : '#111827',
                  borderColor: ri === activeRunIdx ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  opacity: ri > activeRunIdx ? 0.5 : 1,
                }}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: run.done ? '#22C55E' : ri === activeRunIdx ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)',
                      color: run.done ? '#fff' : ri === activeRunIdx ? '#38BDF8' : '#64748B',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {run.done ? <CheckCircleFilled style={{ fontSize: 10 }} /> : ri + 1}
                    </span>
                    <Text style={{
                      color: ri > activeRunIdx ? '#64748B' : '#F8FAFC',
                      fontSize: 13, fontWeight: 600,
                    }}>
                      Атака {ri + 1}
                    </Text>
                    <Tag style={{
                      background: 'rgba(147,51,234,0.15)',
                      color: '#A78BFA', border: 'none', fontSize: 10, margin: 0,
                    }}>
                      {attack.attackMode}
                    </Tag>
                    {run.done && (
                      <Space size={4}>
                        <Text style={{ color: '#64748B', fontSize: 11 }}>
                          {run.completed} запр.
                        </Text>
                        <Text style={{ color: '#22C55E', fontSize: 11 }}>
                          {run.results.filter((r) => r.status >= 200 && r.status < 300).length} ✓
                        </Text>
                        <Text style={{ color: '#EAB308', fontSize: 11 }}>
                          {run.results.filter((r) => r.status >= 400 && r.status < 500).length} ✗
                        </Text>
                        <Text style={{ color: '#EF4444', fontSize: 11 }}>
                          {run.results.filter((r) => r.status >= 500 || r.error).length} ✕
                        </Text>
                        {Object.values(run.results).some((r) =>
                          Object.values(r.grep_matches || {}).some(Boolean)) && (
                          <Tag color="#9333EA" style={{ fontSize: 9, margin: 0 }}>
                            MATCH
                          </Tag>
                        )}
                      </Space>
                    )}
                  </div>
                }
                extra={
                  run.isRunning && (
                    <Text style={{ color: '#38BDF8', fontSize: 11 }}>
                      {run.completed}/{run.total} · ~{Math.ceil((run.total - run.completed) / 5)}с
                    </Text>
                  )
                }
              >
                {/* Progress inside bar */}
                {run.total > 0 && (
                  <Progress
                    percent={Math.round((run.completed / run.total) * 100)}
                    size="small"
                    strokeColor={run.done ? '#22C55E' : '#38BDF8'}
                    showInfo={false}
                    style={{ marginBottom: 6 }}
                  />
                )}

                {/* Snake cells grid */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: SNAKE_GAP,
                }}>
                  {Array.from({ length: Math.max(run.total, 0) }).map((_, ci) => {
                    const result = run.results[ci];
                    let state: CellState = 'empty';
                    if (result) {
                      if (Object.values(result.grep_matches || {}).some(Boolean)) state = 'match';
                      else if (result.status >= 500 || result.error) state = 'err5';
                      else if (result.status >= 400) state = 'err4';
                      else if (result.status >= 200 && result.status < 300) state = 'ok';
                    } else if (ci === run.completed && run.isRunning) {
                      state = 'current';
                    }

                    const isCurrentPulse = state === 'current';

                    return (
                      <div
                        key={ci}
                        title={result
                          ? `#${result.id} | ${result.method} ${result.url} | ${result.status} | ${result.elapsed_ms}ms`
                          : `Запрос ${ci + 1}`
                        }
                        style={{
                          width: SNAKE_CELL,
                          height: SNAKE_CELL,
                          backgroundColor: cellClass(state),
                          borderRadius: 2,
                          animation: isCurrentPulse ? 'pk-pulse 1s infinite' : undefined,
                          transition: 'background-color 0.2s',
                        }}
                      />
                    );
                  })}
                  {run.total === 0 && (
                    <Text style={{ color: '#64748B', fontSize: 11 }}>
                      Ожидание запуска...
                    </Text>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Results table for active/done attack */}
        {allDone && (
          <div style={{ marginTop: 16 }}>
            <SuiteResults
              allResults={allResults}
              totalRequests={totalAll}
              doneRequests={doneAll}
              attackSummaries={attackSummaries}
              onRepeat={handleRepeat}
              onNew={handleNew}
            />
          </div>
        )}
      </div>
    </div>
  );
}
