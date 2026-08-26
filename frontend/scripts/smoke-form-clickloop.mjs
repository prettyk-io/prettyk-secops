/**
 * Дебаг Формы: клики + elementFromPoint + pageerror/console.
 * Печатает, что реально под курсором, если клик «не берётся».
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PK_UI || process.env.PK_UI || 'http://localhost:5173';

async function underPoint(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) {
        return null;
      }
      const chain = [];
      let cur = el;
      for (let i = 0; i < 8 && cur; i += 1) {
        const id = cur.id ? `#${cur.id}` : '';
        const cls =
          typeof cur.className === 'string' && cur.className
            ? `.${cur.className.trim().split(/\s+/).slice(0, 3).join('.')}`
            : '';
        chain.push(`${cur.tagName.toLowerCase()}${id}${cls}`);
        cur = cur.parentElement;
      }
      const pe = getComputedStyle(el).pointerEvents;
      const z = getComputedStyle(el).zIndex;
      return { tag: el.tagName, pe, z, chain, text: (el.textContent || '').slice(0, 80) };
    },
    { x, y },
  );
}

async function clickProbe(page, locator, label) {
  const box = await locator.boundingBox();
  if (!box) {
    return { label, ok: false, reason: 'no boundingBox' };
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const before = await underPoint(page, x, y);
  try {
    await locator.click({ timeout: 4000, force: false });
    return { label, ok: true, before, x, y };
  } catch (err) {
    return {
      label,
      ok: false,
      reason: String(err.message || err).split('\n')[0],
      before,
      x,
      y,
      forceWouldHit: before,
    };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: 'Сбросить форму' }).click({ timeout: 20_000 });
  await page.waitForTimeout(500);

  // явно Форма
  await page.locator('.pk-view-segmented').getByText('Форма', { exact: true }).click();
  await page.waitForSelector('.pk-form-scroll', { timeout: 15_000 });
  await page.waitForTimeout(400);

  const probes = [];

  // segmented Редактор / Форма
  probes.push(
    await clickProbe(
      page,
      page.locator('.pk-view-segmented').getByText('Редактор', { exact: true }),
      'tab-Редактор',
    ),
  );
  await page.waitForTimeout(300);
  probes.push(
    await clickProbe(
      page,
      page.locator('.pk-view-segmented').getByText('Форма', { exact: true }),
      'tab-Форма',
    ),
  );
  await page.waitForTimeout(400);

  // nav rail
  const navLink = page.locator('.pk-section-nav .ant-anchor-link-title').first();
  probes.push(await clickProbe(page, navLink, 'nav-first-section'));

  // scan_policy select (часто первый Select)
  const firstSelect = page.locator('.pk-form-scroll .ant-select').first();
  probes.push(await clickProbe(page, firstSelect, 'first-select'));
  await page.waitForTimeout(300);
  const dropdownOpen = await page.locator('.ant-select-dropdown:visible').count();
  probes.push({ label: 'select-dropdown-open', ok: dropdownOpen > 0, count: dropdownOpen });
  if (dropdownOpen > 0) {
    await page.keyboard.press('Escape');
  }

  // любой input
  const firstInput = page.locator('.pk-form-scroll input:not([type="hidden"])').first();
  probes.push(await clickProbe(page, firstInput, 'first-input'));
  if (probes.at(-1).ok) {
    await firstInput.fill('clickprobe');
    const val = await firstInput.inputValue().catch(() => '');
    probes.push({ label: 'first-input-typed', ok: val.includes('clickprobe'), val });
  }

  // toolbar
  probes.push(
    await clickProbe(page, page.getByRole('button', { name: 'Копировать JSON' }), 'toolbar-copy'),
  );

  // theme switch
  probes.push(await clickProbe(page, page.locator('.pk-theme-toggle .ant-switch'), 'theme-switch'));

  // element covering center of form scroll?
  const formBox = await page.locator('.pk-form-scroll').boundingBox();
  let centerCover = null;
  if (formBox) {
    centerCover = await underPoint(
      page,
      formBox.x + formBox.width / 2,
      formBox.y + Math.min(120, formBox.height / 3),
    );
  }

  const report = {
    pageErrors,
    consoleErrors: consoleErrors.filter((t) => !t.includes('Download the React DevTools')),
    probes,
    centerCover,
    url: page.url(),
  };
  fs.writeFileSync('smoke-form-clickloop-report.json', JSON.stringify(report, null, 2));

  const failed = probes.filter((p) => p.ok === false);
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length || failed.length) {
    console.error(`FAIL: pageErrors=${pageErrors.length} failedClicks=${failed.length}`);
    process.exit(1);
  }
  console.log('OK: form clickloop');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
