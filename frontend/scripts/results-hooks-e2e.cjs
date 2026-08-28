/**
 * E2E (Edge CDP): seed check → Results → Запустить → hooks clear → Allure+Dojo ready.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const EDITOR = process.env.PK_EDITOR_URL || process.env.PK_EDITOR_URL || 'http://localhost:5173/';
const LIVE = 'http://127.0.0.1:8767';
const PLAY = 'http://127.0.0.1:8765';
const RUN_TIMEOUT_MS = Number(process.env.PK_E2E_RUN_MS || process.env.PK_E2E_RUN_MS || 180000);
const ROOT = path.resolve(__dirname, '../..');

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

async function waitHooks(pred, label, ms) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    const r = await fetch(`${LIVE}/api/results/hooks?t=${Date.now()}`, {
      cache: 'no-store',
    });
    last = await r.json();
    if (pred(last)) return last;
    await sleep(800);
  }
  throw new Error(`${label}: last=${JSON.stringify(last)}`);
}

function loadE2eWired() {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'orchestrator/fixtures/validate_ok.json'),
      'utf8',
    ),
  );
  raw.infrastructure = raw.infrastructure || {};
  raw.infrastructure.base_url_override =
    raw.infrastructure.base_url_override || 'http://juice-shop:3000';
  raw.infrastructure.allowed_extra_domains =
    raw.infrastructure.allowed_extra_domains ?? '';
  return raw;
}

async function main() {
  if (!fs.existsSync(EDGE)) {
    throw new Error(`Edge not found: ${EDGE}`);
  }
  const wired = loadE2eWired();
  const checkId = 'e2e-hooks-' + Date.now().toString(36);

  await fetch(`${LIVE}/api/results/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allure_report_url: 'http://127.0.0.1:5050/?stale=e2e',
      dojo_report_url: 'http://127.0.0.1:8081/engagement/999',
    }),
  });

  for (let i = 0; i < 40; i++) {
    const st = await (await fetch(`${PLAY}/api/run/status`)).json();
    if (st.phase !== 'running') break;
    await sleep(500);
  }

  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'pk_results_hooks_e2e');
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

    const now = new Date().toISOString();
    const seed = {
      version: 1,
      items: [
        {
          check_id: checkId,
          title: 'e2e-hooks',
          status: 'draft',
          created_at: now,
          updated_at: now,
          opened_at: now,
          view: 'results',
          wired,
          resource_contents: {},
        },
      ],
    };

    await evalJson(`(() => {
      sessionStorage.setItem('pk.auth.user', 'admin');
      localStorage.setItem('pk.checks.v1', ${JSON.stringify(JSON.stringify(seed))});
      localStorage.setItem('pk.checks.active', ${JSON.stringify(checkId)});
      location.hash = ${JSON.stringify('#/checks/' + checkId + '/results')};
      location.reload();
      return true;
    })()`);
    await sleep(4500);

    const ui = await evalJson(`(() => {
      const btn = document.querySelector('[data-testid="results-card-launch"]');
      const tiles = [...document.querySelectorAll('.pk-results-tile')].map((el) => ({
        label: el.getAttribute('aria-label'),
        tone: el.getAttribute('data-tone'),
        href: el.getAttribute('href'),
      }));
      const act = document.querySelector('[data-testid="results-download-act"]');
      return {
        href: location.href,
        hasBtn: !!btn,
        disabled: btn ? !!btn.disabled : null,
        tiles,
        actDisabled: act ? act.getAttribute('aria-disabled') : null,
      };
    })()`);
    console.log(JSON.stringify({ step: 'pre_click', ui }));

    const launch = await evalJson(`(() => {
      const btn = document.querySelector('[data-testid="results-card-launch"]');
      if (!btn) return { ok: false, err: 'no results-card-launch' };
      if (btn.disabled) return { ok: false, err: 'launch disabled' };
      btn.click();
      return { ok: true };
    })()`);
    if (!launch?.ok) {
      throw new Error(`click launch failed: ${JSON.stringify(launch)}`);
    }
    console.log(JSON.stringify({ step: 'clicked_launch' }));

    await waitHooks(
      (h) => !h?.allure?.report_url && !h?.dojo?.report_url,
      'hooks-cleared',
      20000,
    );
    console.log(JSON.stringify({ step: 'hooks_cleared' }));

    // UI: grey tiles + locked act (poll FE a few times).
    let greyOk = false;
    for (let i = 0; i < 15; i++) {
      const snap = await evalJson(`(() => {
        const tiles = [...document.querySelectorAll('.pk-results-tile')].map((el) => ({
          label: el.getAttribute('aria-label'),
          tone: el.getAttribute('data-tone'),
          href: el.getAttribute('href'),
        }));
        const act = document.querySelector('[data-testid="results-download-act"]');
        const pack = document.querySelector('[data-testid="results-save-package"]');
        return {
          tiles,
          actDisabled: act ? act.getAttribute('aria-disabled') : null,
          packDisabled: pack ? pack.getAttribute('aria-disabled') : null,
        };
      })()`);
      const allure = snap.tiles.find((t) => t.label === 'Allure');
      const dojo = snap.tiles.find((t) => /DefectDojo/i.test(t.label || ''));
      if (
        allure?.tone === 'pending' &&
        dojo?.tone === 'pending' &&
        snap.actDisabled === 'true'
      ) {
        greyOk = true;
        console.log(JSON.stringify({ step: 'ui_grey_locked', snap }));
        break;
      }
      await sleep(500);
    }
    if (!greyOk) {
      throw new Error('UI did not go grey/locked after clear');
    }

    const fresh = await waitHooks(
      (h) =>
        typeof h?.allure?.report_url === 'string' &&
        h.allure.report_url.startsWith('http://127.0.0.1:5050') &&
        !String(h.allure.report_url).includes('stale=') &&
        typeof h?.dojo?.report_url === 'string' &&
        h.dojo.report_url.startsWith('http://127.0.0.1:8081/') &&
        !String(h.dojo.report_url).includes('/engagement/999'),
      'hooks-ready',
      RUN_TIMEOUT_MS,
    );

    // Wait FE poll to paint green + unlock.
    let greenOk = false;
    for (let i = 0; i < 40; i++) {
      const snap = await evalJson(`(() => {
        const tiles = [...document.querySelectorAll('.pk-results-tile')].map((el) => ({
          label: el.getAttribute('aria-label'),
          tone: el.getAttribute('data-tone'),
          href: el.getAttribute('href'),
        }));
        const act = document.querySelector('[data-testid="results-download-act"]');
        return {
          tiles,
          actDisabled: act ? act.getAttribute('aria-disabled') : null,
        };
      })()`);
      const allure = snap.tiles.find((t) => t.label === 'Allure');
      const dojo = snap.tiles.find((t) => /DefectDojo/i.test(t.label || ''));
      if (
        allure?.tone === 'ready' &&
        dojo?.tone === 'ready' &&
        allure.href &&
        dojo.href &&
        snap.actDisabled === 'false'
      ) {
        greenOk = true;
        console.log(
          JSON.stringify({
            ok: true,
            step: 'ui_green_unlocked',
            allure: allure.href,
            dojo: dojo.href,
            hooks: {
              allure: fresh.allure.report_url,
              dojo: fresh.dojo.report_url,
            },
          }),
        );
        break;
      }
      await sleep(500);
    }
    if (!greenOk) {
      throw new Error('UI did not turn green/unlock after hooks');
    }
    ws.close();
  } finally {
    try {
      edge.kill();
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(err && err.message ? err.message : err),
    }),
  );
  process.exit(1);
});
