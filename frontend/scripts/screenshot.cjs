/**
 * Screenshotter — Playwright (connectOverCDP/headless).
 * Captures Editor UI to screenshot_latest.png (repo root).
 * Contract kept: expand ant-tree, save PNG at frontend/../screenshot_latest.png.
 */
const fs = require('fs');
const path = require('path');

// Playwright: prefer prettyk-secops local; fallback to buddy harness (one engine).
let pw;
try {
  pw = require('playwright');
} catch {
  const harness = 'C:\\cursor-buddy\\Flow\\Current\\blitz-auth\\cdp\\node_modules\\playwright';
  pw = require(harness);
}
const { chromium } = pw;

const PORT = 9222;
const URL = 'http://localhost:5173/?view=studio';

async function takeSnapshot() {
  let browser;
  try {
    // Prefer a live Chrome with CDP (dev box); else fall back to headless.
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    } catch {
      browser = await chromium.launch({ headless: true });
      await browser.newContext().then(async (ctx) => {
        const page = await ctx.newPage();
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        await page.evaluate(() => {
          document.querySelectorAll('.ant-tree-switcher').forEach((el) => el.click());
        });
        await page.waitForTimeout(600);
        const out = path.resolve(__dirname, '../../screenshot_latest.png');
        await page.screenshot({ path: out, fullPage: false });
        console.log(`[Shotter] Screenshot saved: ${out}`);
      });
      await browser.close();
      return;
    }

    const pages = browser.contexts().flatMap((c) => c.pages());
    const page =
      pages.find((p) => /5173/.test(String(p.url() || ''))) || pages[0];
    if (!page) throw new Error('No live page found on :9222');

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      document.querySelectorAll('.ant-tree-switcher').forEach((el) => el.click());
    });
    await page.waitForTimeout(600);
    const out = path.resolve(__dirname, '../../screenshot_latest.png');
    await page.screenshot({ path: out, fullPage: false });
    console.log(`[Shotter] Screenshot saved: ${out}`);
  } catch (err) {
    console.error('[Shotter Error]:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

takeSnapshot();
