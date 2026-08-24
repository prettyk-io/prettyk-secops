import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntdApp, Button, Modal, Progress, Space, Tag, Typography } from 'antd';
import {
  CaretRightOutlined,
  DownloadOutlined,
  PauseOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useLabSession, type PayloadSetConfig, type AttackMode } from '../LabSessionProvider';
import { startLabIntruder, stopLabIntruder, type LabGrepRule, type LabResultItem } from '../labApi';
import { ResultsTable } from '../components/ResultsTable';
import { ResultsInspector } from '../components/ResultsInspector';
import type { LabDetailItem } from '../labApi';
import { fetchLabDetail } from '../labApi';

const { Text, Title } = Typography;

function buildPayloadSets(configs: PayloadSetConfig[]): string[][] {
  return configs.map((ps) => {
    if (ps.kind === 'preset') {
      const presets: Record<string, string[]> = {
        sqli: ["' OR '1'='1", "' UNION SELECT NULL--", "' OR 1=1#", "admin'--", "'; DROP TABLE users--"],
        xss: ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'-alert(1)-'", '<svg onload=alert(1)>'],
        ssrf: ['http://169.254.169.254/', 'http://localhost/', 'http://127.0.0.1/', 'http://0.0.0.0/', 'file:///etc/passwd'],
        auth: ['admin:admin', 'admin:password', 'root:root', 'user:pass', 'test:test'],
        boundary: ['%00', '%0d%0a', '..%2f', '../../etc/passwd', 'A'.repeat(5000)],
      };
      return presets[ps.presetKey ?? ''] ?? [];
    }
    if (ps.kind === 'custom') return ps.customItems;
    if (ps.kind === 'numbers') {
      const items: string[] = [];
      for (let v = ps.numberStart; v <= ps.numberStop; v += ps.numberStep) items.push(String(v));
      return items;
    }
    if (ps.kind === 'bruteforce') {
      const items: string[] = [];
      const chars = ps.bruteCharset.split('');
      for (let len = ps.bruteMinLen; len <= ps.bruteMaxLen && items.length < 200; len++) {
        const indices = new Array(len).fill(0);
        let done = false;
        while (!done && items.length < 200) {
          items.push(indices.map((i) => chars[i]).join(''));
          let carry = 1;
          for (let p = len - 1; p >= 0; p--) {
            indices[p] += carry;
            if (indices[p] >= chars.length) { indices[p] = 0; carry = 1; } else { carry = 0; break; }
          }
          if (carry) done = true;
        }
      }
      return items;
    }
    return [];
  });
}

export interface Step5ExecuteProps {
  valid: boolean;
  onValidChange: (v: boolean) => void;
}

export function Step5Execute({ valid: _valid, onValidChange: _onValidChange }: Step5ExecuteProps) {
  const { message } = AntdApp.useApp();
  const {
    session,
    setRunning,
    setAttackId: setSessionAttackId,
    setProgress,
    setResults,
    addToSuite,
    resetAttack,
    updateAttack,
  } = useLabSession();
  const { isRunning, attackId, progress, results, singleAttack } = session;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<LabDetailItem | null>(null);
  const [reqRate, setReqRate] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const prevCompletedRef = useRef(0);
  const prevTimeRef = useRef(Date.now());

  const total = progress.total || 10;

  const summary = {
    total: results.length,
    ok2xx: results.filter((r) => r.status >= 200 && r.status < 300).length,
    err4xx: results.filter((r) => r.status >= 400 && r.status < 500).length,
    err5xx: results.filter((r) => r.status >= 500 || r.status === 0).length,
    grepMatch: results.filter((r) => Object.values(r.grep_matches || {}).some(Boolean)).length,
  };

  const handleStartClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmStart = async () => {
    setConfirmOpen(false);
    setRunning(true);
    setCompletedCount(0);
    setReqRate(0);
    prevCompletedRef.current = 0;
    prevTimeRef.current = Date.now();

    const modeMap: Record<AttackMode, 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb'> = {
      sniper: 'sniper',
      battering_ram: 'battering_ram',
      pitchfork: 'pitchfork',
      cluster_bomb: 'cluster_bomb',
    };

    const grepRules: LabGrepRule[] = [];
    if (singleAttack.grepMatchPattern) {
      const parts = singleAttack.grepMatchPattern.split('|').filter(Boolean);
      parts.forEach((p, i) => {
        grepRules.push({ key: `match_${i}`, pattern: p, is_regex: true, case_sensitive: false });
      });
    }
    if (singleAttack.grepExtractPattern) {
      grepRules.push({ key: 'extract', pattern: singleAttack.grepExtractPattern, is_regex: true, group: 1 });
    }

    const resp = await startLabIntruder({
      attack_id: singleAttack.attackId || undefined,
      raw_http: singleAttack.rawHttp,
      attack_mode: modeMap[singleAttack.attackMode],
      payload_sets: buildPayloadSets(singleAttack.payloadSets),
      grep_match_rules: grepRules.length > 0 ? grepRules : undefined,
      grep_extract_rules: singleAttack.grepExtractPattern ? [{ key: 'extract', pattern: singleAttack.grepExtractPattern, is_regex: true, group: 1 }] : undefined,
      encoders: singleAttack.payloadSets[0]?.encoders,
      prefix: singleAttack.payloadSets[0]?.prefix,
      suffix: singleAttack.payloadSets[0]?.suffix,
    });

    if (resp.ok) {
      setSessionAttackId(resp.attack_id);
      message.success(`Атака запущена: ${resp.attack_id}`);
    } else {
      setRunning(false);
      message.error(`Ошибка запуска: ${resp.error || 'неизвестная ошибка'}`);
    }
  };

  // Polling
  useEffect(() => {
    if (!attackId || !isRunning) return;
    const id = setInterval(async () => {
      const now = Date.now();
      const elapsed = (now - prevTimeRef.current) / 1000;
      if (elapsed >= 1) {
        const rate = Math.round((progress.completed - prevCompletedRef.current) / elapsed);
        setReqRate(rate);
        setCompletedCount(progress.completed);
        prevCompletedRef.current = progress.completed;
        prevTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [attackId, isRunning, progress.completed]);

  const handleSelectResult = useCallback(async (id: number) => {
    setSelectedResultId(id);
    if (!attackId) return;
    const res = await fetchLabDetail(attackId, id);
    if (res.ok && res.detail) setSelectedDetail(res.detail);
  }, [attackId]);

  const handleStop = async () => {
    if (!attackId) return;
    await stopLabIntruder(attackId);
    setRunning(false);
    message.info('Атака остановлена');
  };

  const handleSaveResults = () => {
    const data = JSON.stringify({ config: singleAttack, results }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attack_${attackId || 'result'}.json`; a.click();
    URL.revokeObjectURL(url);
    message.success('Результаты сохранены');
  };

  const handleAddToSuite = () => {
    addToSuite(singleAttack);
    message.success('Атака добавлена в Suite Builder');
  };

  const handleNewAttack = () => {
    resetAttack();
  };

  const eta = reqRate > 0 ? Math.max(0, Math.round((total - progress.completed) / reqRate)) : 0;

  return (
    <div>
      {!isRunning && !attackId && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Title level={3} style={{ color: '#F8FAFC' }}>Готово к запуску</Title>
          <Text style={{ color: '#94A3B8', fontSize: 14, display: 'block', marginBottom: 20 }}>
            Будет отправлено ~{total} запросов. Режим: {singleAttack.attackMode}. Маркеров: {singleAttack.markers.length}.
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<CaretRightOutlined />}
            onClick={handleStartClick}
            style={{
              borderRadius: 8, fontWeight: 700, padding: '8px 40px', height: 48,
              background: 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)', border: 'none',
            }}
          >
            Запустить атаку
          </Button>
        </div>
      )}

      {(isRunning || attackId) && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            padding: '10px 14px', background: '#111827', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Progress
              type="circle"
              percent={total > 0 ? Math.round((progress.completed / total) * 100) : 0}
              size={44}
              strokeColor="#9333EA"
            />
            <div style={{ flex: 1 }}>
              <Text strong style={{ color: '#F8FAFC', fontSize: 14 }}>
                {progress.completed} / {total} запросов
              </Text>
              {isRunning && (
                <div>
                  <Space size="small" style={{ marginTop: 2 }}>
                    <Tag color="#38BDF8">{reqRate} req/s</Tag>
                    {eta > 0 && <Tag color="#FB923C">ETA {eta}s</Tag>}
                  </Space>
                </div>
              )}
            </div>
            {isRunning && (
              <Button danger icon={<PauseOutlined />} onClick={handleStop}>
                Остановить
              </Button>
            )}
          </div>

          <ResultsTable
            results={results}
            progress={progress}
            selectedResultId={selectedResultId}
            onSelectResult={handleSelectResult}
            loading={isRunning && results.length === 0}
          />

          <div style={{
            marginTop: 10, background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12,
          }}>
            <ResultsInspector detail={selectedDetail} />
          </div>

          {!isRunning && results.length > 0 && (
            <div style={{
              marginTop: 14, padding: '14px',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(147,51,234,0.1) 100%)',
              border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
            }}>
              <Text strong style={{ color: '#F8FAFC', fontSize: 14, display: 'block', marginBottom: 10 }}>
                Атака завершена
              </Text>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#22C55E', fontSize: 20, fontWeight: 700 }}>{summary.ok2xx}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>2xx</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#FB923C', fontSize: 20, fontWeight: 700 }}>{summary.err4xx}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>4xx</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#EF4444', fontSize: 20, fontWeight: 700 }}>{summary.err5xx}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>5xx/ERR</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#9333EA', fontSize: 20, fontWeight: 700 }}>{summary.grepMatch}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>Grep Match</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#38BDF8', fontSize: 20, fontWeight: 700 }}>{summary.total}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, display: 'block' }}>Всего</Text>
                </div>
              </div>
              <Space>
                <Button icon={<DownloadOutlined />} onClick={handleSaveResults}
                  style={{ borderRadius: 5, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0' }}>
                  Сохранить результаты
                </Button>
                <Button icon={<PlusOutlined />} onClick={handleAddToSuite}
                  style={{ borderRadius: 5, background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0' }}>
                  Добавить в Suite
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleNewAttack}
                  style={{ borderRadius: 5, background: 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)', border: 'none', color: '#fff', fontWeight: 600 }}>
                  Новая атака
                </Button>
              </Space>
            </div>
          )}
        </div>
      )}

      <Modal
        title="Подтверждение запуска"
        open={confirmOpen}
        onOk={handleConfirmStart}
        onCancel={() => setConfirmOpen(false)}
        okText="Запустить"
        cancelText="Отмена"
        okButtonProps={{
          style: { background: 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)', border: 'none', fontWeight: 600 },
        }}
        styles={{ content: { background: '#111827' }, header: { background: '#111827', color: '#F8FAFC' } }}
      >
        <div style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.8 }}>
          <Text style={{ color: '#F8FAFC' }}>Будет отправлено {total} запросов</Text>
          <br />
          <Text style={{ color: '#CBD5E1' }}>на цель: </Text>
          <Text style={{ fontFamily: 'JetBrains Mono', color: '#38BDF8', fontSize: 12 }}>
            {singleAttack.parsedTarget?.url ?? singleAttack.rawHttp.substring(0, 60)}
          </Text>
          <br />
          <Text style={{ color: '#CBD5E1' }}>Режим: {singleAttack.attackMode} · Позиций: {singleAttack.markers.length} · ~{Math.round(total / 5)} сек</Text>
        </div>
      </Modal>
    </div>
  );
}
