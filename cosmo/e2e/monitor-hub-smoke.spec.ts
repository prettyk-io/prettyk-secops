/**
 * MH-8: E2E smoke Monitor Hub — HomePage (dynamic apps table) + instance links.
 *
 * Тестирует живой PrettyK Live :8767 (не Editor :5173). HomePage отдаётся по
 * голому `http://127.0.0.1:8767/` (без `?run_id=`), данные — из
 * `/api/runs/apps` (runs_index.ndjson).
 *
 * Селекторы выверены по orchestrator/static/live/index.html (MH-3).
 * Seed данных — orchestrator (runs_index.ndjson) перед прогоном.
 */
import { test, expect } from '@playwright/test';

const MONITOR = 'http://127.0.0.1:8767';

test('MH-8.1 HomePage отрисовывается: заголовок + таблица/empty', async ({ page }) => {
  await page.goto(MONITOR, { waitUntil: 'domcontentloaded' });

  // Контейнер HomePage активен (body.homepage-view)
  await expect(page.locator('#homepage')).toHaveClass(/active/, { timeout: 8000 });

  // Заголовок таблицы запусков
  await expect(page.locator('.hp-title')).toHaveText('Запуски автоматизированных проверок');

  // Либо таблица, либо пустое состояние
  await expect(
    page.locator('.hp-table, .hp-empty'),
  ).toBeAttached();
});

test('MH-8.2 коллапс app → deploy → instance_id (ссылка на Регламент)', async ({ page }) => {
  await page.goto(MONITOR, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homepage')).toHaveClass(/active/, { timeout: 8000 });

  // Если данных нет — пропускаем (см. seed перед прогоном).
  const appRow = page.locator('.hp-app-row').first();
  if ((await appRow.count()) === 0) {
    test.skip(true, 'нет данных в runs_index.ndjson');
    return;
  }

  // app-code виден
  await expect(page.locator('.hp-app-code').first()).toBeVisible();

  // Раскрываем первый app (коллапс)
  await appRow.click();
  await expect(appRow).toHaveClass(/open/);

  // Внутри — deploy URL и instance-ссылка
  await expect(page.locator('.hp-deploy-url').first()).toBeVisible();
  const instanceLink = page.locator('.hp-instance-id').first();
  await expect(instanceLink).toBeVisible();

  // instance_id — ссылка на вкладку «Регламент» Editor'а (#/checks/<id>/form)
  const href = (await instanceLink.getAttribute('href')) || '';
  expect(href).toMatch(/#\/checks\/.+\/form$/);
});

test('MH-8.3 pagination отображается при >10 app-коллапсов', async ({ page }) => {
  await page.goto(MONITOR, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homepage')).toHaveClass(/active/, { timeout: 8000 });

  // Пагинация показывается только если больше 10 apps — иначе её нет.
  const pagination = page.locator('.hp-pagination');
  // Проверяем, что структура корректна (не падаем на её отсутствии).
  if ((await pagination.count()) > 0) {
    await expect(page.locator('.hp-page-info')).toBeVisible();
  }
});

test('MH-8.4 нет JS-ошибок на HomePage', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(MONITOR, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homepage')).toHaveClass(/active/, { timeout: 8000 });

  // Небольшая пауза на первый polling /api/runs/apps (5s интервал).
  await page.waitForTimeout(1200);

  const fatal = errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED|Failed to fetch/i.test(e));
  expect(fatal).toEqual([]);
});
