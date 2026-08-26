/**
 * Live-автотест геометрии «Регламент».
 * Контракт: form ≈ 50% ширины scroll, centered, gutter ≥ 20%.
 * Keep in sync with frontend/src/form/portalFormGeometry.ts
 *
 *   cd frontend && node scripts/portal-layout-geometry.cjs
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 9340;
const EDGE_PATH =
  process.env.PK_EDGE_PATH ||
  process.env.PK_EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.PK_EDITOR_URL || process.env.PK_EDITOR_URL || 'http://localhost:5173/';
const USER_DATA = path.join(process.env.TEMP || 'C:\\Temp', 'pk_portal_layout_geom');

const PORTAL_FORM_WIDTH_RATIO = 0.5;
const PORTAL_FORM_WIDTH_RATIO_TOLERANCE = 0.04;
const PORTAL_ASYMMETRY_MAX_PX = 16;
const PORTAL_GUTTER_MIN_RATIO = 0.2;

function analyze(metrics) {
  const { scrollWidth, leftGutterPx, rightGutterPx, formWidthPx } = metrics;
  const reasons = [];
  if (!(scrollWidth > 0)) {
    return { ok: false, leftRatio: 0, rightRatio: 0, contentRatio: 0, reasons: ['scrollWidth≤0'] };
  }
  const leftRatio = leftGutterPx / scrollWidth;
  const rightRatio = rightGutterPx / scrollWidth;
  const contentRatio = formWidthPx / scrollWidth;
  const gutterMinPx = PORTAL_GUTTER_MIN_RATIO * scrollWidth;
  if (Math.abs(contentRatio - PORTAL_FORM_WIDTH_RATIO) > PORTAL_FORM_WIDTH_RATIO_TOLERANCE) {
    reasons.push(
      `contentRatio ${contentRatio.toFixed(3)} want ${PORTAL_FORM_WIDTH_RATIO}±${PORTAL_FORM_WIDTH_RATIO_TOLERANCE}`,
    );
  }
  if (Math.abs(leftGutterPx - rightGutterPx) > PORTAL_ASYMMETRY_MAX_PX) {
    reasons.push(
      `asymmetry ${Math.round(Math.abs(leftGutterPx - rightGutterPx))} > ${PORTAL_ASYMMETRY_MAX_PX}`,
    );
  }
  if (leftGutterPx < gutterMinPx) {
    reasons.push(`left gutter ${Math.round(leftGutterPx)} < ${Math.round(gutterMinPx)}`);
  }
  if (rightGutterPx < gutterMinPx) {
    reasons.push(`right gutter ${Math.round(rightGutterPx)} < ${Math.round(gutterMinPx)}`);
  }
  return { ok: reasons.length === 0, leftRatio, rightRatio, contentRatio, reasons };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--headless',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1600,900',
    `--user-data-dir=${USER_DATA}`,
    BASE,
  ]);

  let exitCode = 1;
  try {
    await sleep(4500);
    const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const tab = tabs.find((t) => String(t.url || '').includes('5173')) || tabs[0];
    if (!tab?.webSocketDebuggerUrl) {
      throw new Error('No CDP tab — is Vite up on :5173?');
    }

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let nextId = 1;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const onmsg = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener('message', onmsg);
            resolve(msg);
          }
        };
        ws.addEventListener('message', onmsg);
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => reject(new Error(`timeout ${method}`)), 20000);
      });

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    await send('Runtime.enable');

    const nav = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const setNative = (el, v) => {
          const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          proto.set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        return new Promise(async (resolve) => {
          const u = document.querySelector('[data-testid="login-username"]');
          const p = document.querySelector('[data-testid="login-password"]');
          if (u && p) {
            setNative(u, 'admin');
            setNative(p, 'verysecure');
            document.querySelector('[data-testid="login-submit"]')?.click();
            await new Promise((r) => setTimeout(r, 900));
          }
          document.querySelector('[data-testid="home-initiate"]')?.click();
          await new Promise((r) => setTimeout(r, 400));
          document.querySelector('[data-testid="home-start-check"]')?.click();
          await new Promise((r) => setTimeout(r, 1600));

          const scroll = document.querySelector('.pk-form-scroll');
          const form = document.querySelector(
            '.pk-form-scroll > form, .pk-form-scroll > .ant-form, .pk-form-scroll > .rjsf',
          );
          if (!scroll || !form) {
            resolve({ error: 'missing .pk-form-scroll or form.rjsf' });
            return;
          }
          const sr = scroll.getBoundingClientRect();
          const fr = form.getBoundingClientRect();
          resolve({
            scrollWidth: sr.width,
            leftGutterPx: fr.left - sr.left,
            rightGutterPx: sr.right - fr.right,
            formWidthPx: fr.width,
            padL: getComputedStyle(scroll).paddingLeft,
            padR: getComputedStyle(scroll).paddingRight,
            formMaxW: getComputedStyle(form).maxWidth,
            formClass: form.className,
            href: location.href,
            actions: [...document.querySelectorAll('.pk-form-actions .ant-btn')].map((b) =>
              (b.textContent || '').trim(),
            ),
          });
        });
      })()`,
    });

    const raw = nav.result?.result?.value;
    if (!raw || raw.error) {
      console.error('NAV_FAIL', raw || nav);
      exitCode = 1;
    } else {
      const verdict = analyze(raw);
      const report = {
        href: raw.href,
        formClass: raw.formClass,
        formMaxW: raw.formMaxW,
        padL: raw.padL,
        padR: raw.padR,
        scrollWidth: Math.round(raw.scrollWidth),
        formWidthPx: Math.round(raw.formWidthPx),
        leftGutterPx: Math.round(raw.leftGutterPx),
        rightGutterPx: Math.round(raw.rightGutterPx),
        leftRatio: +verdict.leftRatio.toFixed(3),
        rightRatio: +verdict.rightRatio.toFixed(3),
        contentRatio: +verdict.contentRatio.toFixed(3),
        actions: raw.actions,
        want: {
          formRatio: PORTAL_FORM_WIDTH_RATIO,
          formTol: PORTAL_FORM_WIDTH_RATIO_TOLERANCE,
          asymmetryMax: PORTAL_ASYMMETRY_MAX_PX,
          gutterMinRatio: PORTAL_GUTTER_MIN_RATIO,
        },
        ok: verdict.ok,
        reasons: verdict.reasons,
      };
      console.log(JSON.stringify(report, null, 2));
      exitCode = verdict.ok ? 0 : 1;
      if (!verdict.ok) {
        console.error('\nFAIL: portal form ≠ 50% centered. See docs/internal/portal-layout-autotests.md');
      } else {
        console.log('\nOK: portal form geometry within tolerance');
      }
    }
    ws.close();
  } catch (err) {
    console.error(err);
    exitCode = 1;
  } finally {
    edge.kill();
  }
  process.exit(exitCode);
}

main();
