// save_full_wired.mjs — extract full wired from CDP localStorage and save to file
import { writeFileSync } from 'fs';
import { createRequire } from 'module';

const cdphome = 'D:\\Buddy\\Flow\\Current\\blitz-auth\\cdp';
const require = createRequire(import.meta.url);

// Use Playwright to connect to CDP and extract
const { chromium } = await import('playwright');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
const page = contexts[0].pages()[0];

// Read the check from localStorage
const check = await page.evaluate(() => {
  const raw = localStorage.getItem('pk.checks.v1');
  const snap = JSON.parse(raw);
  return snap.items.find(i => i.check_id === '114a306c-4ce5-4e43-88f4-65490947f7ef');
});

if (!check) {
  console.error('Reference check not found');
  process.exit(1);
}

const wired = check.wired;

// Modify for autotest
wired.infrastructure.browser_type = 'chrome-headless';
wired.infrastructure.scanner_work_timeout_min = 60;
wired.infrastructure.idle_timeout_min = 30;
wired.meta.project_id = 'autotest-js-20260822';
wired.meta.assessment_purpose = 'emergency';

const path = 'D:\\prettyk-dev\\orchestrator\\wired\\autotest\\wired_full.json';
writeFileSync(path, JSON.stringify(wired, null, 2), 'utf-8');
console.log('Saved', JSON.stringify(wired).length, 'bytes to', path);

await browser.close();