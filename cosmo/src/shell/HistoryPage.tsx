/**
 * История проверок — тёмный реестр + поиск (cmdk) + виртуальный список.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Layout, Modal, Tag, Typography } from 'antd';
import { Command } from 'cmdk';
import { useVirtualizer } from '../ui/virtualRows';
import { pullChecksFromServer } from '../checks/checksRemote';
import { deleteCheck, listChecks } from '../checks/checksStore';
import { markPendingReplay } from '../checks/replayCheck';
import { diffLatestRuns } from '../checks/runDiff';
import type { CheckInstance, CheckRunStatus, CheckStatus } from '../checks/types';
import { LIVE_BASE } from '../api/apiBase';
import { ShellChrome } from './ShellChrome';

const STATUS_LABEL: Record<CheckStatus, string> = {
  draft: 'Черновик',
  ready: 'Подготовлен',
  running: 'Идёт',
  completed: 'Завершена',
  failed: 'Ошибка',
  archived: 'Архив',
};

const STATUS_TONE: Record<CheckStatus, string> = {
  draft: 'muted',
  ready: 'ok',
  running: 'run',
  completed: 'ok',
  failed: 'bad',
  archived: 'muted',
};

const RUN_STATUS_LABEL: Record<CheckRunStatus, string> = {
  idle: 'idle',
  running: 'идёт',
  success: 'ok',
  failed: 'fail',
  unknown: '?',
};

function formatTs(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
}

function formatRunsCell(item: CheckInstance): string {
  const n = item.runs.length;
  if (!n) {
    return '0';
  }
  const last = item.runs[0];
  const statusPart = last?.status
    ? RUN_STATUS_LABEL[last.status] ?? last.status
    : '';
  const verdict = (last?.ci_verdict || '').trim();
  const diff = diffLatestRuns(item.runs);
  const diffBit = diff?.changed ? 'Δ' : diff ? '=' : '';
  const tail = [statusPart, verdict, diffBit].filter(Boolean).join(' · ');
  return tail ? `${n} · ${tail}` : String(n);
}

function matchesQuery(item: CheckInstance, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    item.title.toLowerCase().includes(q) ||
    item.check_id.toLowerCase().includes(q) ||
    (STATUS_LABEL[item.status] ?? item.status).toLowerCase().includes(q)
  );
}

export type HistoryPageProps = {
  onBackHome: () => void;
  onOpenCheck: (checkId: string) => void;
  /** EPIC-REPLAY-DIFF: open check + auto pipeline start. */
  onReplayCheck?: (checkId: string) => void;
  onLogout?: () => void;
};

export function HistoryPage({
  onBackHome,
  onOpenCheck,
  onReplayCheck,
  onLogout,
}: HistoryPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<CheckInstance | null>(null);
  const [purgeArtifacts, setPurgeArtifacts] = useState(false);
  const [artifactChecks, setArtifactChecks] = useState<Record<string, boolean>>({});
  const [holdChecks, setHoldChecks] = useState<Record<string, boolean>>({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLines, setAuditLines] = useState<string[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const LIVE_PURGE_URL = `${LIVE_BASE}/api/artifacts/purge`;
  const pendingHeld = pendingDelete
    ? Boolean(holdChecks[pendingDelete.check_id])
    : false;

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 2500);
    void pullChecksFromServer().then((changed) => {
      if (!cancelled && changed) {
        setTick((n) => n + 1);
      }
    });
    void fetch(`${LIVE_BASE}/api/artifacts/index`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          body: {
            checks?: Record<
              string,
              { has_artifacts?: boolean; legal_hold?: boolean }
            >;
          } | null,
        ) => {
          if (cancelled || !body?.checks) {
            return;
          }
          const arts: Record<string, boolean> = {};
          const holds: Record<string, boolean> = {};
          for (const [id, meta] of Object.entries(body.checks)) {
            if (meta?.has_artifacts) {
              arts[id] = true;
            }
            if (meta?.legal_hold) {
              holds[id] = true;
            }
          }
          setArtifactChecks(arts);
          setHoldChecks(holds);
        },
      )
      .catch(() => {
        /* Live down — badges optional */
      });
    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const openAudit = () => {
    setAuditOpen(true);
    setAuditBusy(true);
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 2500);
    void fetch(`${LIVE_BASE}/api/artifacts/audit?limit=40`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { events?: Array<Record<string, unknown>> } | null) => {
        const events = body?.events ?? [];
        setAuditLines(
          events.map((ev) => {
            const ts = typeof ev.ts === 'string' ? ev.ts : '';
            const action = typeof ev.action === 'string' ? ev.action : '?';
            const cid = typeof ev.check_id === 'string' ? ev.check_id : '';
            return [ts, action, cid].filter(Boolean).join(' · ');
          }),
        );
      })
      .catch(() => {
        setAuditLines(['Live недоступен — аудит не прочитан']);
      })
      .finally(() => {
        window.clearTimeout(timer);
        setAuditBusy(false);
      });
  };

  const allChecks = useMemo(() => (tick >= 0 ? listChecks() : []), [tick]);
  const items = useMemo(() => {
    return allChecks.filter((item) => matchesQuery(item, query));
  }, [allChecks, query]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
    initialRect: { width: 1024, height: 640 },
  });

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const checkId = pendingDelete.check_id;
    const wantPurge = purgeArtifacts && !holdChecks[checkId];
    deleteCheck(checkId);
    setPendingDelete(null);
    setPurgeArtifacts(false);
    setTick((n) => n + 1);
    if (wantPurge) {
      void fetch(LIVE_PURGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: checkId, include_dojo: true }),
      }).catch(() => {
        /* Live down — registry already unlinked; purge is opt-in best-effort */
      });
    }
  };

  return (
    <Layout className="pk-layout pk-shell-layout pk-history-page">
      <ShellChrome
        onTitleClick={onBackHome}
        onLogout={onLogout}
        showThemeToggle={false}
      />
      <Layout.Content className="pk-history-body">
        <div className="pk-history-scroll-host" ref={parentRef}>
        <div className="pk-history-stage">
          <nav className="pk-history-crumb" aria-label="Навигация">
            <button type="button" className="pk-history-crumb-link" onClick={onBackHome}>
              Главная
            </button>
            <span className="pk-history-crumb-sep" aria-hidden>
              /
            </span>
            <span className="pk-history-crumb-here">История</span>
            <Button
              type="text"
              size="small"
              className="pk-history-back"
              onClick={onBackHome}
              data-testid="history-back"
            >
              ← Назад
            </Button>
          </nav>

          <header className="pk-history-hero">
            <Typography.Title level={2} className="pk-history-title">
              Реестр проверок
            </Typography.Title>
            <Button
              type="text"
              size="small"
              className="pk-history-audit-btn"
              onClick={openAudit}
              data-testid="history-artifacts-audit"
            >
              Аудит очистки
            </Button>
          </header>

          <Command className="pk-history-cmdk" shouldFilter={false}>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Поиск по названию, статусу, id…"
              data-testid="history-search"
            />
          </Command>

          <div className="pk-history-table-head" role="row">
            <span>Создано</span>
            <span>Обновлено</span>
            <span>Статус</span>
            <span>Название</span>
            <span>Запусков</span>
            <span className="pk-history-col-actions" />
          </div>

          <div
            className="pk-history-scroll"
            data-testid="history-grid"
          >
            {items.length === 0 ? (
              <div className="pk-history-empty" data-testid="history-empty">
                {query.trim()
                  ? 'Ничего не найдено'
                  : 'Нет записей — инициируйте проверку на главной'}
              </div>
            ) : (
              <div
                className="pk-history-virtual"
                style={{ height: `${String(virtualizer.getTotalSize())}px` }}
              >
                {virtualizer.getVirtualItems().map((row) => {
                  const item = items[row.index];
                  if (!item) {
                    return null;
                  }
                  const tone = STATUS_TONE[item.status] ?? 'muted';
                  return (
                    <div
                      key={item.check_id}
                      className="pk-history-row"
                      role="button"
                      tabIndex={0}
                      data-testid={`history-row-${item.check_id}`}
                      style={{
                        transform: `translateY(${String(row.start)}px)`,
                      }}
                      onClick={() => onOpenCheck(item.check_id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenCheck(item.check_id);
                        }
                      }}
                    >
                      <span className="pk-history-mono">{formatTs(item.created_at)}</span>
                      <span className="pk-history-mono">{formatTs(item.updated_at)}</span>
                      <span>
                        <Tag className={`pk-history-tag pk-history-tag--${tone}`}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </Tag>
                      </span>
                      <span className="pk-history-name">
                        {item.title}
                        {artifactChecks[item.check_id] ? (
                          <Tag
                            className="pk-history-art-badge"
                            data-testid={`history-art-badge-${item.check_id}`}
                          >
                            арт.
                          </Tag>
                        ) : null}
                        {holdChecks[item.check_id] ? (
                          <Tag
                            className="pk-history-hold-badge"
                            data-testid={`history-hold-badge-${item.check_id}`}
                          >
                            hold
                          </Tag>
                        ) : null}
                      </span>
                      <span
                        className="pk-history-mono pk-history-runs"
                        title={diffLatestRuns(item.runs)?.summary || undefined}
                        data-testid={`history-runs-${item.check_id}`}
                      >
                        {formatRunsCell(item)}
                      </span>
                      <span className="pk-history-col-actions">
                        {onReplayCheck ? (
                          <Button
                            type="text"
                            size="small"
                            className="pk-history-replay"
                            data-testid={`history-replay-${item.check_id}`}
                            title={
                              diffLatestRuns(item.runs)?.summary ||
                              'Перегнать сохранённый манифест'
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              markPendingReplay(item.check_id);
                              onReplayCheck(item.check_id);
                            }}
                          >
                            ▶
                          </Button>
                        ) : null}
                        <Button
                          type="text"
                          danger
                          size="small"
                          className="pk-history-delete"
                          data-testid={`history-delete-${item.check_id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDelete(item);
                          }}
                        >
                          Удалить
                        </Button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </Layout.Content>

      <Modal
        open={pendingDelete !== null}
        title="Удалить проверку?"
        okText="Удалить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
        onOk={confirmDelete}
        onCancel={() => {
          setPendingDelete(null);
          setPurgeArtifacts(false);
        }}
        destroyOnHidden
      >
        <p>
          {pendingDelete
            ? `«${pendingDelete.title}» будет удалена из реестра. Это нельзя отменить.`
            : null}
        </p>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          Отчёты на диске, Allure и DefectDojo по умолчанию не удаляются (только
          запись в Истории).
        </p>
        <Checkbox
          checked={purgeArtifacts && !pendingHeld}
          disabled={pendingHeld}
          onChange={(e) => setPurgeArtifacts(e.target.checked)}
          style={{ marginTop: 12 }}
          data-testid="history-purge-artifacts"
        >
          Также удалить артефакты запуска (диск / owned Dojo test)
        </Checkbox>
        {pendingHeld ? (
          <p
            style={{ opacity: 0.75, marginTop: 8 }}
            data-testid="history-purge-hold-note"
          >
            Legal hold: purge артефактов заблокирован (карточка из реестра
            удалится).
          </p>
        ) : null}
      </Modal>

      <Modal
        open={auditOpen}
        title="Аудит очистки артефактов"
        footer={null}
        onCancel={() => setAuditOpen(false)}
        destroyOnHidden
        data-testid="history-artifacts-audit-modal"
      >
        {auditBusy ? (
          <p style={{ opacity: 0.6 }}>Загрузка…</p>
        ) : auditLines.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Пока пусто — purge ещё не писали в audit.</p>
        ) : (
          <ul className="pk-history-audit-list" data-testid="history-artifacts-audit-list">
            {auditLines.map((line) => (
              <li key={line} className="pk-history-mono">
                {line}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </Layout>
  );
}
