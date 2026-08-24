/**
 * Форма: locked-текст вместо disabled; scan_policy/auth вырезаны из поверхности.
 */
import { chromium } from 'playwright';

const BASE = process.env.KDT_UI || 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Сбросить форму' }).click({ timeout: 20_000 });
  await page.locator('.kdt-view-segmented').getByText('Форма', { exact: true }).click();
  await page.waitForTimeout(700);

  const dump = await page.evaluate(() => {
    const root = document.querySelector('.kdt-form-scroll');
    const labels = [...root.querySelectorAll('label')].map((l) => l.textContent.trim());
    return {
      locked: [...root.querySelectorAll('.kdt-field-locked')].map(
        (el) => el.id || el.textContent.slice(0, 40),
      ),
      disabledControls: root.querySelectorAll(
        'input.ant-input-disabled, .ant-select-disabled, textarea.ant-input-disabled',
      ).length,
      hasPolicyLabel: labels.some((t) => /Политика сканирования/.test(t)),
      hasAuthLabel: labels.some((t) => /Тип авторизации/.test(t)),
      hasWebswingLabel: labels.some((t) => /Webswing/i.test(t)),
      hasArchLabel: labels.some((t) => /архитектур/i.test(t)),
    };
  });

  await page.locator('#root_meta_scheduled_info').fill('works');
  const typed = await page.locator('#root_meta_scheduled_info').inputValue();

  const report = { errors, dump, typed };
  console.log(JSON.stringify(report, null, 2));

  if (
    errors.length ||
    dump.locked.length < 1 ||
    dump.disabledControls > 0 ||
    dump.hasPolicyLabel ||
    dump.hasAuthLabel ||
    dump.hasWebswingLabel ||
    dump.hasArchLabel ||
    typed !== 'works'
  ) {
    throw new Error('form surface verify failed');
  }
  console.log('OK form surface: 4 fields removed, locked text ok');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
