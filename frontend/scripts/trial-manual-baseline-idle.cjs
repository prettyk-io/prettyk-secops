/**
 * Field trial: seed manual check → click «Запустить Baseline» → Webswing up → idle kill ~5m.
 *
 *   cd frontend && node scripts/trial-manual-baseline-idle.cjs
 *
 * Env: KDT_IDLE_WAIT_MS (default 390000 ≈ 6.5m), KDT_EDITOR_URL, EDGE_PATH
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9343;
const EDITOR = process.env.KDT_EDITOR_URL || 'http://localhost:5173/';
const PLAY = 'http://127.0.0.1:8765';
const LIVE = 'http://127.0.0.1:8767';
const WEBSWING_API = 'http://127.0.0.1:8090/JSON/core/view/version/';
const WAIT_MS = Number(process.env.KDT_IDLE_WAIT_MS || 390000);
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'reports', 'trials', `manual-baseline-idle-${Date.now()}.json`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function msgData(raw) {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const d = raw.data;
    if (typeof d === 'string') return d;
    if (Buffer.isBuffer(d)) return d.toString('utf8');
  }
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  return String(raw);
}

function cdp(ws, method, params = {}) {
  const id = (cdp._id = (cdp._id || 0) + 1);
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      let msg;
      try {
        msg = JSON.parse(msgData(raw));
      } catch {
        return;
      }
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMsg);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function httpJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  }
}

async function main() {
  if (!fs.existsSync(EDGE)) throw new Error(`Edge not found: ${EDGE}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const evidence = {
    started_at: new Date().toISOString(),
    steps: [],
  };
  const note = (step, data) => {
    const row = { t: new Date().toISOString(), step, ...data };
    evidence.steps.push(row);
    console.log(JSON.stringify(row));
  };

  for (let i = 0; i < 120; i++) {
    const st = await httpJson(`${PLAY}/api/run/status`);
    if (st.json?.phase !== 'running' && st.json?.phase !== 'starting') break;
    await sleep(1000);
  }
  const statusBefore = await httpJson(`${PLAY}/api/run/status`);
  const prevRunId = statusBefore.json?.run_id || null;
  note('status_before', { prevRunId, phase: statusBefore.json?.phase });

  const checkId = 'trial-manual-idle-' + Date.now().toString(36);
  const now = new Date().toISOString();
  const manifest = {
    meta: {
      assessment_purpose: 'manual',
      project_id: 'trial-manual-idle',
      initiator_name: 'trial@local',
      app_leader: 'lead@local',
      generate_act: false,
    },
    infrastructure: {
      webswing_session_timeout_min: 30,
      idle_timeout_min: 5,
      debug_mode: false,
    },
  };

  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'kdt_trial_manual_idle');
  fs.mkdirSync(userDataDir, { recursive: true });
  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--window-size=1600,900',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    await sleep(2500);
    const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const tab = tabs.find((t) => t.type === 'page') || tabs[0];
    if (!tab?.webSocketDebuggerUrl) throw new Error('no CDP tab');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Runtime.enable');

    const evalJson = async (expression) => {
      const r = await cdp(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) {
        throw new Error(JSON.stringify(r.exceptionDetails));
      }
      return r.result?.value;
    };

    await cdp(ws, 'Page.navigate', { url: EDITOR });
    await sleep(2000);

    const seed = {
      version: 1,
      items: [
        {
          check_id: checkId,
          title: 'manual-baseline-idle',
          status: 'draft',
          created_at: now,
          updated_at: now,
          last_opened_at: now,
          view: 'form',
          manifest,
          resource_contents: {},
          runs: [],
        },
      ],
    };

    await evalJson(`(() => {
      sessionStorage.setItem('kdt.auth.user', 'admin');
      localStorage.setItem('kdt.checks.v1', ${JSON.stringify(JSON.stringify(seed))});
      localStorage.setItem('kdt.checks.active', ${JSON.stringify(checkId)});
      location.hash = ${JSON.stringify('#/checks/' + checkId + '/form')};
      location.reload();
      return true;
    })()`);
    await sleep(6500);

    const pre = await evalJson(`(() => {
      const btn = document.querySelector('[data-testid="form-launch-baseline"]');
      const purpose = [...document.querySelectorAll('.ant-select-selection-item')]
        .map((el) => (el.textContent || '').trim())
        .find((t) => /проверк/i.test(t) || /ZAP/i.test(t));
      return {
        href: location.href,
        hasBtn: !!btn,
        disabled: btn ? !!btn.disabled : null,
        purpose: purpose || null,
        idleLabel: !!document.body.innerText.includes('Таймаут бездействия'),
      };
    })()`);
    note('pre_click', { pre, checkId });

    const click = await evalJson(`(() => {
      const btn = document.querySelector('[data-testid="form-launch-baseline"]');
      if (!btn) return { ok: false, err: 'no form-launch-baseline' };
      if (btn.disabled) return { ok: false, err: 'baseline disabled' };
      btn.click();
      return { ok: true };
    })()`);
    note('click', { click });
    if (!click?.ok) throw new Error(`click failed: ${JSON.stringify(click)}`);

    const uiAfter = await evalJson(`(() => {
      const msg = [...document.querySelectorAll('.ant-message-notice')].map((el) =>
        (el.textContent || '').trim(),
      );
      const penguin = document.querySelector('.kdt-no-penguin, [class*="penguin"]');
      return { messages: msg, penguin: penguin ? (penguin.textContent || '').slice(0, 240) : null };
    })()`);
    note('ui_after_click', { uiAfter });

    let webswingUpAt = null;
    let runId = null;
    const bootDeadline = Date.now() + 180000;
    while (Date.now() < bootDeadline) {
      const st = await httpJson(`${PLAY}/api/run/status`);
      const wsApi = await httpJson(WEBSWING_API);
      const rid = st.json?.run_id || null;
      const fresh = rid && rid !== prevRunId;
      if (fresh) runId = rid;
      if (fresh && (st.json?.phase === 'running' || st.json?.phase === 'starting') && wsApi.ok && !webswingUpAt) {
        webswingUpAt = new Date().toISOString();
        note('webswing_api_up', { version: wsApi.json, run: st.json });
        break;
      }
      if (fresh && (st.json?.phase === 'failed' || st.json?.phase === 'error' || st.json?.phase === 'finished')) {
        note('run_failed_early', { status: st.json });
        break;
      }
      await sleep(2000);
    }
    if (!webswingUpAt) {
      note('webswing_missing', { play: await httpJson(`${PLAY}/api/run/status`) });
    }

    const waitStart = Date.now();
    let idleKill = null;
    while (Date.now() - waitStart < WAIT_MS) {
      const st = await httpJson(`${PLAY}/api/run/status`);
      const meta = await httpJson(`${LIVE}/api/meta`);
      const phase = st.json?.phase;
      if (phase && phase !== 'running' && phase !== 'starting') {
        idleKill = {
          at: new Date().toISOString(),
          elapsed_ms: Date.now() - waitStart,
          status: st.json,
          meta: meta.json,
        };
        note('run_ended', idleKill);
        break;
      }
      if ((Date.now() - waitStart) % 60000 < 2500) {
        note('heartbeat', {
          elapsed_ms: Date.now() - waitStart,
          phase,
          webswing: (await httpJson(WEBSWING_API)).ok,
        });
      }
      await sleep(2000);
    }

    if (!idleKill) {
      note('idle_not_killed_in_window', {
        waited_ms: WAIT_MS,
        status: await httpJson(`${PLAY}/api/run/status`),
        webswing: await httpJson(WEBSWING_API),
      });
      evidence.verdict = 'FAIL_NO_IDLE_KILL';
    } else {
      const elapsedMin = idleKill.elapsed_ms / 60000;
      evidence.verdict =
        webswingUpAt && elapsedMin >= 4.5 && elapsedMin <= 7
          ? 'PASS'
          : webswingUpAt
            ? 'PASS_WEBSWING_TIMING_ODD'
            : 'FAIL_NO_WEBSWING';
    }

    evidence.finished_at = new Date().toISOString();
    evidence.webswing_up_at = webswingUpAt;
    evidence.run_id = runId;
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(JSON.stringify({ out: OUT, verdict: evidence.verdict }));
    if (!String(evidence.verdict).startsWith('PASS')) process.exitCode = 1;
  } finally {
    try {
      edge.kill();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
