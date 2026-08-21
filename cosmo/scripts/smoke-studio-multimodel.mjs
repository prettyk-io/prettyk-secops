/**
 * UI smoke: два таба PrettyK — свой текст после switch (monaco multi-model path).
 * Именование — инпут в строке дерева (не полоска сверху). Создание — ПКМ.
 */
import { chromium } from 'playwright';

const BASE = process.env.KDT_UI || 'http://localhost:5173';

async function dismissPenguin(page) {
  const close = page.locator('.ant-modal-wrap .ant-modal-close');
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(200);
  }
}

async function createPage(page, name) {
  await dismissPenguin(page);
  await page
    .locator('.kdt-studio-tree-group', { hasText: 'Модели данных' })
    .locator('button.kdt-studio-tree-add')
    .click();
  const nameInput = page.locator('.ant-tree-title input.kdt-studio-name-input');
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await page.waitForTimeout(500);
}

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
  await page.waitForSelector('.kdt-studio-tree', { timeout: 20_000 });

  if (await page.getByText('Редактор для custom_policy').count()) {
    throw new Error('Редактор off');
  }
  if (await page.locator('.kdt-studio-naming-bar').count()) {
    throw new Error('legacy naming-bar again');
  }

  await createPage(page, 'pageA');
  await createPage(page, 'pageB');

  const tabA = page.locator('.kdt-studio-tabs').getByText('pageA');
  const tabB = page.locator('.kdt-studio-tabs').getByText('pageB');
  if (!(await tabA.count()) || !(await tabB.count())) {
    throw new Error(
      `tabs missing: A=${await tabA.count()} B=${await tabB.count()} open=${await page.locator('.kdt-studio-tabs .ant-tabs-tab').count()}`,
    );
  }

  await tabA.click();
  await page.waitForSelector('.kdt-studio-pane-prettyk .monaco-editor', { timeout: 10_000 });
  const prettyEditor = page.locator(
    '.kdt-studio-pane-prettyk .monaco-editor [role="textbox"]',
  );
  const prettyLines = page.locator('.kdt-studio-pane-prettyk .view-lines');
  await prettyEditor.waitFor({ state: 'attached', timeout: 10_000 });
  await prettyEditor.click({ force: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('AlphaLine');
  await page.waitForTimeout(500);

  await tabB.click();
  await page.waitForTimeout(500);
  await prettyEditor.click({ force: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('BetaLine');
  await page.waitForTimeout(500);

  await tabA.click();
  await page.waitForTimeout(700);
  const textA = await prettyLines.innerText();
  if (!textA.includes('AlphaLine')) {
    throw new Error(`pageA lost text after switch, got: ${JSON.stringify(textA)}`);
  }

  await tabB.click();
  await page.waitForTimeout(500);
  const textB = await prettyLines.innerText();
  if (!textB.includes('BetaLine')) {
    throw new Error(`pageB lost text after switch, got: ${JSON.stringify(textB)}`);
  }

  await page.locator('.kdt-studio-tree-group', { hasText: 'Модели данных' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Создать модель данных' }).click();
  const nameInput = page.locator('.ant-tree-title input.kdt-studio-name-input');
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  if (await page.locator('.kdt-studio-naming-bar').count()) {
    throw new Error('naming-bar returned');
  }
  await nameInput.press('Escape');

  if (errors.length) {
    throw new Error(`pageerrors: ${errors.join(' | ')}`);
  }
  console.log('OK: multi-model tabs keep text; naming inline in tree');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
