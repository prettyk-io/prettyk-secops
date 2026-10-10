// @vitest-environment jsdom
/**
 * MONITOR-DEEPLINK-FRESH + MONITOR-DEEPLINK-LIVE-CLIENT + MONITOR-ENTRY-LINK-TRUTH:
 * выбор рана для ссылки.
 * Никаких «первых из массива»: свежий running → свежий терминальный → Live home;
 * устаревшие («вечные running»-зомби), чужие и unscoped (без штампа check_id)
 * раны не выбираются — принадлежность проверке должна быть доказана.
 * MONITOR-ENTRY-LINK-TRUTH: среди терминалов выбирается ран с подтверждёнными
 * артефактами (журнал/запись по Live API статусов); вычищенный не становится
 * тупиком — ссылка ведёт на живой/артефактный ран или на Live home.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIVE_HOME } from '../api/apiBase';
import type { CheckRunRef } from '../checks/types';
import {
  __resetChecksStoreForTests,
  createCheck,
  upsertCheckRun,
} from '../checks/checksStore';
import {
  RUN_FRESH_MINUTES,
  buildMonitorUrl,
  fetchRunArtifacts,
  hasViewableArtifacts,
  pickMonitorRun,
  pickMonitorRunWithArtifacts,
  resolveMonitorTarget,
  resolveMonitorUrl,
  type RunArtifacts,
} from './monitorLink';

const MIN = 60_000;
const NOW = Date.parse('2026-09-25T22:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

function run(over: Partial<CheckRunRef>): CheckRunRef {
  return { run_id: 'run-x', status: 'running', check_id: 'chk-1', ...over };
}

afterEach(() => {
  __resetChecksStoreForTests();
});

describe('pickMonitorRun', () => {
  it('свежий running выигрывает у старого running и терминалов', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'stale', started_at: ago(3 * 24 * 60 * MIN) }),
        run({ run_id: 'fresh', started_at: ago(2 * MIN) }),
        run({ run_id: 'done', status: 'success', ended_at: ago(5 * MIN) }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('fresh');
  });

  it('старый running игнорируется — берём последний терминальный по свежести', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'zombie', started_at: ago(5 * 24 * 60 * MIN) }),
        run({ run_id: 'old-pass', status: 'success', ended_at: ago(3 * 24 * 60 * MIN) }),
        run({ run_id: 'new-fail', status: 'failed', ended_at: ago(30 * MIN) }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('new-fail');
  });

  it('running без старта свежим не считается', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'no-ts' }),
        run({ run_id: 'done', status: 'success', ended_at: ago(10 * MIN) }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('done');
  });

  it('чужой свежий running не выбирается (штамп check_id не совпал)', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'foreign', started_at: ago(1 * MIN), check_id: 'other-chk' }),
        run({ run_id: 'own-done', status: 'success', ended_at: ago(20 * MIN), check_id: 'chk-1' }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('own-done');
  });

  it('только чужой свежий running → пусто (Live home)', () => {
    const picked = pickMonitorRun(
      [run({ run_id: 'foreign', started_at: ago(1 * MIN), check_id: 'other-chk' })],
      'chk-1',
      NOW,
    );
    expect(picked).toBeUndefined();
  });

  it('чужой терминальный ран не выбирается', () => {
    const picked = pickMonitorRun(
      [run({ run_id: 'foreign-done', status: 'success', ended_at: ago(1 * MIN), check_id: 'other-chk' })],
      'chk-1',
      NOW,
    );
    expect(picked).toBeUndefined();
  });

  it('свежий running со штампом своего чека выигрывает', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'own-live', started_at: ago(1 * MIN), check_id: 'chk-1' }),
        run({ run_id: 'done', status: 'success', ended_at: ago(2 * MIN) }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('own-live');
  });

  it('граница свежести: ровно N минут ещё живой, N+1 — уже нет', () => {
    const live = pickMonitorRun(
      [run({ run_id: 'edge', started_at: ago(RUN_FRESH_MINUTES * MIN) })],
      'chk-1',
      NOW,
    );
    expect(live?.run_id).toBe('edge');
    const dead = pickMonitorRun(
      [run({ run_id: 'edge', started_at: ago(RUN_FRESH_MINUTES * MIN + 1) })],
      'chk-1',
      NOW,
    );
    expect(dead).toBeUndefined();
  });

  it('legacy-терминал без таймстампов используется как последний шанс', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'unknown-old', status: 'unknown' }),
        run({ run_id: 'legacy-pass', status: 'success' }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('legacy-pass');
  });

  it('unscoped раны (без штампа check_id) не выбираются — даже свежий running', () => {
    const picked = pickMonitorRun(
      [run({ run_id: 'unscoped-live', started_at: ago(1 * MIN), check_id: undefined })],
      'chk-1',
      NOW,
    );
    expect(picked).toBeUndefined();
  });

  it('unscoped свежий running не вытесняет свой терминальный ран', () => {
    const picked = pickMonitorRun(
      [
        run({ run_id: 'unscoped-live', started_at: ago(1 * MIN), check_id: undefined }),
        run({ run_id: 'own-done', status: 'success', ended_at: ago(20 * MIN), check_id: 'chk-1' }),
      ],
      'chk-1',
      NOW,
    );
    expect(picked?.run_id).toBe('own-done');
  });

  it('unscoped терминал не выбирается как run проверки', () => {
    const picked = pickMonitorRun(
      [run({ run_id: 'unscoped-done', status: 'success', ended_at: ago(10 * MIN), check_id: undefined })],
      'chk-1',
      NOW,
    );
    expect(picked).toBeUndefined();
  });
});

describe('buildMonitorUrl', () => {
  it('пустые runs → Live home', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    expect(buildMonitorUrl(item.check_id)).toBe(LIVE_HOME);
  });

  it('свежий running → ?run_id=&check_id=', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'run-fresh',
      status: 'running',
      started_at: new Date().toISOString(),
      check_id: item.check_id,
    });
    expect(buildMonitorUrl(item.check_id)).toBe(
      `${LIVE_HOME}?run_id=run-fresh&check_id=${item.check_id}`,
    );
  });

  it('зомби-running + свежий терминал → ссылка на терминал, не на зомби', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'run-zombie',
      status: 'running',
      started_at: '2026-09-19T10:00:00.000Z',
      check_id: item.check_id,
    });
    upsertCheckRun(item.check_id, {
      run_id: 'run-done',
      status: 'success',
      ended_at: new Date().toISOString(),
      check_id: item.check_id,
    });
    const url = buildMonitorUrl(item.check_id);
    expect(url).toContain('run_id=run-done');
    expect(url).not.toContain('run-zombie');
  });

  it('только чужой свежий running → Live home', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'run-foreign',
      status: 'running',
      started_at: new Date().toISOString(),
      check_id: 'foreign-check',
    });
    expect(buildMonitorUrl(item.check_id)).toBe(LIVE_HOME);
  });

  it('unscoped running не даёт ссылку — Live home (принадлежность не доказана)', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'run-unscoped',
      status: 'running',
      started_at: new Date().toISOString(),
      // check_id отсутствует: «активный чек вкладки» не делает ран своим
    });
    expect(buildMonitorUrl(item.check_id)).toBe(LIVE_HOME);
  });
});

// ── MONITOR-ENTRY-LINK-TRUTH ─────────────────────────────────────────────

const NO_ARTIFACTS: RunArtifacts = { journalEvents: 0, recordingReady: false };
const journal = (n: number): RunArtifacts => ({ journalEvents: n, recordingReady: false });
const recordingOnly: RunArtifacts = { journalEvents: 0, recordingReady: true };

describe('pickMonitorRunWithArtifacts', () => {
  it('канон-кейс: свежий терминал пуст (вычищен) → берём более старый с журналом', () => {
    const runs = [
      run({ run_id: 'run-ca2ec2bfeba1', status: 'success', ended_at: ago(5 * MIN) }),
      run({ run_id: 'run-733048e82c72', status: 'success', ended_at: ago(60 * MIN) }),
    ];
    const availability = new Map<string, RunArtifacts | null>([
      ['run-ca2ec2bfeba1', NO_ARTIFACTS],
      ['run-733048e82c72', { journalEvents: 70, recordingReady: true }],
    ]);
    const picked = pickMonitorRunWithArtifacts(runs, 'chk-1', availability, NOW);
    expect(picked?.run_id).toBe('run-733048e82c72');
  });

  it('запись без журнала тоже считается артефактом', () => {
    const runs = [run({ run_id: 'with-webm', status: 'success', ended_at: ago(MIN) })];
    const picked = pickMonitorRunWithArtifacts(
      runs,
      'chk-1',
      new Map([['with-webm', recordingOnly]]),
      NOW,
    );
    expect(picked?.run_id).toBe('with-webm');
  });

  it('все терминалы пусты → undefined (Live home)', () => {
    const runs = [
      run({ run_id: 'empty-1', status: 'success', ended_at: ago(MIN) }),
      run({ run_id: 'empty-2', status: 'failed', ended_at: ago(2 * MIN) }),
    ];
    const picked = pickMonitorRunWithArtifacts(runs, 'chk-1', new Map(), NOW);
    expect(picked).toBeUndefined();
  });

  it('живой ран приоритетнее терминалов с артефактами', () => {
    const runs = [
      run({ run_id: 'live', status: 'running', started_at: ago(2 * MIN) }),
      run({ run_id: 'archived', status: 'success', ended_at: ago(30 * MIN) }),
    ];
    const picked = pickMonitorRunWithArtifacts(
      runs,
      'chk-1',
      new Map([['archived', journal(70)]]),
      NOW,
    );
    expect(picked?.run_id).toBe('live');
  });

  it('чужой ран с артефактами не выбирается', () => {
    const runs = [
      run({ run_id: 'foreign', status: 'success', ended_at: ago(MIN), check_id: 'other-chk' }),
    ];
    const picked = pickMonitorRunWithArtifacts(
      runs,
      'chk-1',
      new Map([['foreign', journal(100)]]),
      NOW,
    );
    expect(picked).toBeUndefined();
  });

  it('legacy-терминал без таймстампа проверяется и выбирается при артефактах', () => {
    const runs = [
      run({ run_id: 'legacy-empty', status: 'success' }),
      run({ run_id: 'legacy-with', status: 'failed' }),
    ];
    const picked = pickMonitorRunWithArtifacts(
      runs,
      'chk-1',
      new Map([['legacy-with', journal(3)]]),
      NOW,
    );
    expect(picked?.run_id).toBe('legacy-with');
  });
});

describe('resolveMonitorTarget', () => {
  it('живой ран: ссылка на него, пробы артефактов не нужны', async () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'run-live',
      status: 'running',
      started_at: new Date().toISOString(),
      check_id: item.check_id,
    });
    const probed: string[] = [];
    const target = await resolveMonitorTarget(item.check_id, async (rid) => {
      probed.push(rid);
      return NO_ARTIFACTS;
    });
    expect(target.reason).toBe('live');
    expect(target.run?.run_id).toBe('run-live');
    expect(target.url).toContain('run_id=run-live');
    expect(probed).toEqual([]);
  });

  it('пропускает пустой терминал и берёт следующий с артефактами (пробы по свежести)', async () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'newer-empty',
      status: 'success',
      ended_at: new Date(Date.now() - MIN).toISOString(),
      check_id: item.check_id,
    });
    upsertCheckRun(item.check_id, {
      run_id: 'older-with',
      status: 'success',
      ended_at: new Date(Date.now() - 30 * MIN).toISOString(),
      check_id: item.check_id,
    });
    const probed: string[] = [];
    const target = await resolveMonitorTarget(item.check_id, async (rid) => {
      probed.push(rid);
      return rid === 'older-with' ? journal(70) : NO_ARTIFACTS;
    });
    expect(target.reason).toBe('artifacts');
    expect(target.run?.run_id).toBe('older-with');
    expect(target.url).toContain('run_id=older-with');
    expect(probed).toEqual(['newer-empty', 'older-with']);
  });

  it('ошибка пробы = пропуск кандидата, не выбор наугад', async () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'flaky',
      status: 'success',
      ended_at: new Date(Date.now() - MIN).toISOString(),
      check_id: item.check_id,
    });
    upsertCheckRun(item.check_id, {
      run_id: 'solid',
      status: 'success',
      ended_at: new Date(Date.now() - 20 * MIN).toISOString(),
      check_id: item.check_id,
    });
    const target = await resolveMonitorTarget(item.check_id, async (rid) => {
      if (rid === 'flaky') throw new Error('live down');
      return recordingOnly;
    });
    expect(target.run?.run_id).toBe('solid');
  });

  it('ни живого, ни артефактных терминалов → Live home (reason none)', async () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    upsertCheckRun(item.check_id, {
      run_id: 'cleaned',
      status: 'success',
      ended_at: new Date(Date.now() - MIN).toISOString(),
      check_id: item.check_id,
    });
    const target = await resolveMonitorTarget(item.check_id, async () => NO_ARTIFACTS);
    expect(target.reason).toBe('none');
    expect(target.run).toBeUndefined();
    expect(target.url).toBe(LIVE_HOME);

    const url = await resolveMonitorUrl(item.check_id, async () => NO_ARTIFACTS);
    expect(url).toBe(LIVE_HOME);
  });

  it('пустой чек → Live home', async () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    const target = await resolveMonitorTarget(item.check_id, async () => journal(5));
    expect(target.reason).toBe('none');
    expect(target.url).toBe(LIVE_HOME);
  });
});

describe('fetchRunArtifacts / hasViewableArtifacts', () => {
  it('парсит journal events_total и recording ready', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/api/journal')) {
        return { ok: true, json: async () => ({ events_total: 70 }) } as unknown as Response;
      }
      if (url.includes('/api/recording/status')) {
        return { ok: true, json: async () => ({ ready: true }) } as unknown as Response;
      }
      return { ok: false, json: async () => ({}) } as unknown as Response;
    });
    const artifacts = await fetchRunArtifacts('run-1', fetchImpl as unknown as typeof fetch);
    expect(artifacts).toEqual({ journalEvents: 70, recordingReady: true });
  });

  it('недоступность/не-ok API → нули (нет подтверждения); пустой runId → null', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    });
    const artifacts = await fetchRunArtifacts('run-1', failing as unknown as typeof fetch);
    expect(artifacts).toEqual({ journalEvents: 0, recordingReady: false });
    expect(await fetchRunArtifacts('', failing as unknown as typeof fetch)).toBeNull();
  });

  it('hasViewableArtifacts: журнал или запись', () => {
    expect(hasViewableArtifacts(journal(1))).toBe(true);
    expect(hasViewableArtifacts(recordingOnly)).toBe(true);
    expect(hasViewableArtifacts(NO_ARTIFACTS)).toBe(false);
    expect(hasViewableArtifacts(null)).toBe(false);
  });
});
