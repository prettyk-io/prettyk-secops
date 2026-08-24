/**
 * UI smoke: python-id в дереве/вкладке; PrettyK без @-хедеров.
 */
import { chromium } from 'playwright';

const BASE = process.env.KDT_UI || 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.kdt-view-segmented').getByText('Форма', { exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить форму' }).click({ timeout: 20_000 });
  await page.waitForTimeout(500);

  await page.locator('.kdt-view-segmented').getByText('Редактор', { exact: true }).click();
  await page.waitForTimeout(500);

  if ((await page.locator('.kdt-studio-tree').count()) === 0) {
    throw new Error('Редактор off — нет дерева');
  }

  await page
    .locator('.kdt-studio-tree-group', { hasText: 'Модели данных' })
    .locator('button.kdt-studio-tree-add')
    .click();
  await page.waitForTimeout(400);
  const pageInput = page.locator('.ant-tree-title input.kdt-studio-name-input');
  if (!(await pageInput.isVisible().catch(() => false))) {
    await page.screenshot({ path: 'smoke-studio-python-id-fail.png', fullPage: true });
    throw new Error('Нет инпута именования');
  }
  await pageInput.fill('login_page');
  await pageInput.press('Enter');
  await page.waitForTimeout(500);

  if (!(await page.locator('.kdt-studio-tree-page', { hasText: 'login_page' }).count())) {
    await page.screenshot({ path: 'smoke-studio-python-id-fail.png', fullPage: true });
    throw new Error('python-id не в дереве');
  }
  if (!(await page.locator('.kdt-studio-tabs').getByText('login_page').count())) {
    throw new Error('Вкладка должна быть login_page');
  }

  const penguinClose = page.locator('.ant-modal-wrap .ant-modal-close');
  if (await penguinClose.isVisible().catch(() => false)) {
    await penguinClose.click();
    await page.waitForTimeout(200);
  }

  const editor = page.locator('.kdt-studio-pane-prettyk .monaco-editor [role="textbox"]');
  await editor.click({ force: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Элемент x = css .a');
  await page.waitForTimeout(500);

  if (!(await page.locator('.kdt-studio-tree-page', { hasText: 'login_page' }).count())) {
    throw new Error('После правки PrettyK дерево потеряло id');
  }

  if (errors.length) {
    throw new Error(`pageerrors: ${errors.join(' | ')}`);
  }
  console.log('OK: python-id tree, no at-headers');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
