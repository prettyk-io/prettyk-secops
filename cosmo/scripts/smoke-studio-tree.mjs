/**
 * UI smoke: Редактор → «+» у группы → инпут в строке дерева.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.KDT_UI || 'http://localhost:5173';

async function createViaPlus(page, groupLabel) {
  const group = page.locator('.kdt-studio-tree-group', { hasText: groupLabel });
  await group.locator('button.kdt-studio-tree-add').click();
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
  await page.waitForTimeout(500);

  const off = await page.getByText(/Редактор для custom_policy|Студия для custom_policy/).count();
  const treeCount = await page.locator('.kdt-studio-tree').count();
  console.log('editorOffHint=', off, 'tree=', treeCount);

  if (off > 0 || treeCount === 0) {
    await page.screenshot({ path: 'smoke-studio-off.png', fullPage: true });
    throw new Error('Редактор off — нет дерева');
  }
  if (await page.locator('.kdt-studio-naming-bar').count()) {
    throw new Error('legacy naming-bar again');
  }
  if (!(await page.locator('button.kdt-studio-tree-add').count())) {
    throw new Error('+ buttons should be present on groups');
  }
  // В Редакторе тулбар формы не показываем.
  if (await page.getByRole('button', { name: 'Скачать пакет' }).count()) {
    throw new Error('form toolbar should be hidden in Editor');
  }
  if (!(await page.locator('.kdt-header-download').count())) {
    throw new Error('download should live in header');
  }

  await createViaPlus(page, 'Модели данных');
  await page.waitForTimeout(400);

  let pageInput = page.locator('.ant-tree-title input.kdt-studio-name-input');
  let visible = await pageInput.isVisible().catch(() => false);
  console.log('after pages create input visible=', visible);

  if (!visible) {
    const html = await page.locator('.kdt-studio-tree').innerHTML();
    fs.writeFileSync('smoke-tree.html', html);
    await page.screenshot({ path: 'smoke-studio-fail.png', fullPage: true });
    throw new Error('После + у моделей нет инпута именования в строке дерева');
  }

  await pageInput.fill('login_page');
  await pageInput.press('Enter');
  await page.waitForTimeout(400);

  if (!(await page.locator('.kdt-studio-tree-page', { hasText: 'login_page' }).count())) {
    await page.screenshot({ path: 'smoke-studio-fail.png', fullPage: true });
    throw new Error('Модель login_page не появилась в дереве');
  }
  console.log('page ok');

  await createViaPlus(page, 'Сценарии');
  await page.waitForTimeout(400);
  pageInput = page.locator('.ant-tree-title input.kdt-studio-name-input');
  if (!(await pageInput.isVisible().catch(() => false))) {
    await page.screenshot({ path: 'smoke-studio-fail.png', fullPage: true });
    throw new Error('После + у сценариев нет инпута именования');
  }
  await pageInput.fill('s1_data');
  await pageInput.press('Enter');
  await page.waitForTimeout(400);

  if (!(await page.locator('.kdt-studio-tree-scenario', { hasText: 's1_data' }).count())) {
    throw new Error('Сценарий s1_data не появился в дереве');
  }
  if (await page.locator('.kdt-studio-tree-step').count()) {
    throw new Error('Шаги не должны показываться в дереве');
  }
  const scenarioTab = page.locator('.kdt-studio-tabs').getByText('s1_data');
  if (!(await scenarioTab.count())) {
    throw new Error('Вкладка сценария s1_data не открылась');
  }

  await createViaPlus(page, 'Модели данных');
  await page.waitForTimeout(300);
  if (!(await page.locator('.ant-tree-title input.kdt-studio-name-input').isVisible().catch(() => false))) {
    throw new Error('Повторный create у моделей не открыл инпут');
  }
  await page.locator('.ant-tree-title input.kdt-studio-name-input').press('Escape');

  if (errors.length) {
    throw new Error(`pageerrors: ${errors.join(' | ')}`);
  }
  console.log('OK: create page + scenario via +; header download; no form toolbar in Editor');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
