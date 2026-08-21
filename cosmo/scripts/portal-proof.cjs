/**
 * Full-viewport proof shot: login → home. Writes repo-root PNGs + console JSON.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const ROOT = path.resolve(__dirname, '../..');
const OUT_LOGIN = path.join(ROOT, 'screenshot_latest.png');
const OUT_HOME = path.join(ROOT, 'screenshot_home_proof.png');
const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'kdt_portal_proof');

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

async function main() {
  if (!fs.existsSync(EDGE)) {
    throw new Error(`Edge not found: ${EDGE}`);
  }
  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--window-size=1600,900',
      '--force-device-scale-factor=1',
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
    await cdp(ws, 'Log.enable');
    const consoleBuf = [];
    ws.addEventListener('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(msgData(raw));
      } catch {
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params?.args || [])
          .map((a) => a.value ?? a.description ?? '')
          .join(' ');
        consoleBuf.push(`[${msg.params?.type}] ${text}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleBuf.push(`[exception] ${msg.params?.exceptionDetails?.text || ''}`);
      }
    });

    await cdp(ws, 'Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await sleep(4000);

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

    const loginInfo = await evalJson(`(() => ({
      href: location.href,
      title: document.title,
      hasLogin: !!document.querySelector('[data-testid="login-username"]'),
      hasHome: !!document.querySelector('[data-testid="home-panel"]'),
      rootLen: (document.querySelector('#root')?.innerHTML || '').length,
      bodyText: (document.body?.innerText || '').slice(0, 1200),
    }))()`);
    console.log('LOGIN_PAGE', JSON.stringify(loginInfo, null, 2));

    let shot = await cdp(ws, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    fs.writeFileSync(OUT_LOGIN, Buffer.from(shot.data, 'base64'));
    console.log('WROTE', OUT_LOGIN, fs.statSync(OUT_LOGIN).size);

    // React-controlled inputs: seed session + hard navigate to home (same as auth OK).
    await evalJson(`(() => {
      sessionStorage.setItem('kdt.auth.user', 'admin');
      location.hash = '#/home';
      location.reload();
      return true;
    })()`);
    await sleep(4000);

    const homeInfo = await evalJson(`(() => {
      const panel = document.querySelector('[data-testid="home-panel"]');
      const list = document.querySelector('.kdt-home-entry-list');
      const entries = [...document.querySelectorAll('.kdt-home-entry')];
      const icon = document.querySelector('.kdt-home-entry-icon');
      const title = document.querySelector('.kdt-home-title');
      const theme = document.querySelector('.kdt-theme-toggle, [data-testid="theme-toggle"]');
      if (!panel || !list || entries.length < 2) {
        return {
          href: location.href,
          hasHome: !!panel,
          hasVideo: !!document.querySelector('[data-testid="shell-ambient-video"]'),
          err: 'missing panel/list',
        };
      }
      const csPanel = getComputedStyle(panel);
      const csList = getComputedStyle(list);
      const pr = panel.getBoundingClientRect();
      const last = entries[entries.length - 1].getBoundingClientRect();
      const e0 = entries[0].getBoundingClientRect();
      const e1 = entries[1].getBoundingClientRect();
      return {
        href: location.href,
        hasHome: true,
        hasVideo: !!document.querySelector('[data-testid="shell-ambient-video"]'),
        hasThemeToggle: !!theme,
        titleInsidePanel: !!(title && panel.contains(title)),
        panel: {
          w: Math.round(pr.width),
          h: Math.round(pr.height),
          padTop: csPanel.paddingTop,
          padBottom: csPanel.paddingBottom,
          gap: csPanel.gap,
        },
        listGap: csList.gap,
        entryGapPx: Math.round(e1.top - e0.bottom),
        edgeToLastBottomPx: Math.round(pr.bottom - last.bottom),
        entry0H: Math.round(e0.height),
        icon: icon
          ? {
              w: Math.round(icon.getBoundingClientRect().width),
              h: Math.round(icon.getBoundingClientRect().height),
            }
          : null,
      };
    })()`);
    console.log('AFTER_LOGIN', JSON.stringify(homeInfo, null, 2));

    shot = await cdp(ws, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    fs.writeFileSync(OUT_HOME, Buffer.from(shot.data, 'base64'));
    console.log('WROTE', OUT_HOME, fs.statSync(OUT_HOME).size);

    if (consoleBuf.length) {
      console.log('CONSOLE', consoleBuf.slice(0, 40).join('\n'));
    }

    ws.close();
  } finally {
    edge.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
