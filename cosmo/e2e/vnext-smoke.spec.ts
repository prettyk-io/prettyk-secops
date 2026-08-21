/**
 * Ручной smoke Максима — полный проход по реальному UI vnext.
 * Покрытие: login → home → admin (4+ секций) → history → new check → studio → results → logout.
 * Все селекторы выверены по факту кода: AppShell, HomePage, AdminPage/AdminLayout,
 * HistoryPage, App (Editor), StudioWorkspace, ResultsWorkspace.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

async function login(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  // SecOpsMark на странице логина
  await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible();
  await page.locator('[data-testid="login-username"]').fill('admin');
  await page.locator('[data-testid="login-password"]').fill('verysecure');
  await page.locator('[data-testid="login-submit"]').click();
  // После логина — HomePage: панель с data-testid="home-panel"
  await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 8000 });
}

test.describe('Ручной smoke (реальный UI)', () => {
  test('1. Логин — неверный пароль', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible();
    await page.locator('[data-testid="login-username"]').fill('bad');
    await page.locator('[data-testid="login-password"]').fill('bad');
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  });

  test('2. Home → 3 карточки-входа', async ({ page }) => {
    await login(page);
    // Три кнопки в menu-режиме
    await expect(page.locator('[data-testid="home-initiate"]')).toBeVisible();
    await expect(page.locator('[data-testid="home-history"]')).toBeVisible();
    await expect(page.locator('[data-testid="home-policies"]')).toBeVisible();
    // Хедер с SecOpsMark + кнопка выхода
    await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible();
    await expect(page.locator('[data-testid="header-logout"]')).toBeVisible();
  });

  test('3. Admin → Обзор (KPI + чарты)', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    // ProLayout-based admin page
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    // По умолчанию открыт Обзор
    await expect(page.locator('[data-testid="admin-overview"]')).toBeVisible({ timeout: 5000 });
    // KPI-карточки
    await expect(page.locator('[data-testid="ov-runs"]')).toBeVisible();
    await expect(page.locator('[data-testid="ov-severity-total"]')).toBeVisible();
    await expect(page.locator('[data-testid="ov-critical"]')).toBeVisible();
    await expect(page.locator('[data-testid="ov-stand"]')).toBeVisible();
    // Чарты (могут быть с данными или empty)
    const chart = page.locator('[data-testid="ov-severity-chart"]');
    await expect(chart).toBeVisible();
    const bars = page.locator('[data-testid="ov-severity-bars-card"]');
    await expect(bars).toBeVisible();
    const trend = page.locator('[data-testid="ov-trend"]');
    await expect(trend).toBeVisible();
    const passrate = page.locator('[data-testid="ov-passrate"]');
    await expect(passrate).toBeVisible();
  });

  test('4. Admin → Интеграции', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    // Клик «Интеграции» в боковом меню ProLayout
    await page.getByText('Интеграции').first().click();
    await expect(page.locator('[data-testid="admin-integrations"]')).toBeVisible({ timeout: 5000 });
    // Airgap-секция
    await expect(page.locator('[data-testid="admin-integrations-airgap"]')).toBeVisible();
  });

  test('5. Admin → Прогоны', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    await page.getByText('Прогоны').first().click();
    await expect(page.locator('[data-testid="admin-runs"]')).toBeVisible({ timeout: 5000 });
    // Либо таблица, либо «Нет прогонов»
    await expect(
      page.locator('[data-testid="admin-runs"]').locator('.ant-table, [data-testid="admin-runs-empty"]'),
    ).toBeAttached();
  });

  test('6. Admin → Реестр', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    await page.getByText('Реестр').first().click();
    await expect(page.locator('[data-testid="admin-deploy-registry"]')).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="admin-deploy-registry"]').locator('.ant-table, [data-testid="admin-deploy-empty"]'),
    ).toBeAttached();
    // Кнопка «Обновить»
    await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible();
  });

  test('7. Admin → breadcrumb «Главная» назад', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    // Хлебные крошки: Главная / Admin / Обзор
    await expect(page.getByText('Главная')).toBeVisible();
    await page.getByText('Главная').click();
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 5000 });
  });

  test('8. Admin → logout из админки', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="admin-logout"]').click();
    // Вернулись на логин — ждём SecOpsMark
    await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible({ timeout: 5000 });
  });

  test('9. История (пустая / с записями)', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-history"]').click();
    // Ждём, что страница истории загрузилась: либо grid, либо empty
    await expect(
      page.locator('[data-testid="history-grid"]'),
    ).toBeVisible({ timeout: 8000 });
    // Кнопка «← Назад» возвращает на home
    await page.locator('[data-testid="history-back"]').click();
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 5000 });
  });

  test('10. Создать проверку → форма Регламента', async ({ page }) => {
    await login(page);
    // Нажать «Инициировать новую проверку» — перейти в step 'initiate'
    await page.locator('[data-testid="home-initiate"]').click();
    // Поле идентификатора проверки
    await expect(page.locator('[data-testid="home-check-title"]')).toBeVisible({ timeout: 5000 });
    // Ввести название
    await page.locator('[data-testid="home-check-title"]').fill('smoke-test');
    // Начать проверку
    await page.locator('[data-testid="home-start-check"]').click();
    // Ждём Editor UI: segmented вкладки «Регламент / Редактор / Результаты»
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTitle('Редактор')).toBeVisible();
    await expect(page.getByTitle('Результаты')).toBeVisible();
    // «Мониторинг» — отдельная кнопка с индикатором (не segmented item с title)
    await expect(page.locator('.pk-monitor-label')).toBeVisible();
  });

  test('11. Валидировать (default manifest)', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('smoke-validate');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    // entity-validate видна только в студии — переключаемся
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Редактор' }).click();
    await expect(page.locator('.pk-studio-workspace')).toBeVisible({ timeout: 8000 });
    // Жмём «Валидировать»
    await page.locator('[data-testid="entity-validate"]').click();
    // Должен появиться тост / иконка успеха
    await expect(page.locator('.ant-message-custom-content.ant-message-success')).toBeVisible({ timeout: 15000 });
  });

  test('12. Студия → workspace + дерево', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('smoke-studio');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    // Переключаемся на «Редактор» через Segmented
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Редактор' }).click();
    // Ждём studio workspace
    await expect(page.locator('.pk-studio-workspace')).toBeVisible({ timeout: 8000 });
    // Дерево слева
    await expect(page.locator('.pk-studio-workspace .ant-tree').first()).toBeVisible({ timeout: 5000 });
  });

  test('13. Студия → назад в Регламент через Segmented', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('smoke-studio-back');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    // В студию
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Редактор' }).click();
    await expect(page.locator('.pk-studio-workspace')).toBeVisible({ timeout: 8000 });
    // Обратно в Регламент
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Регламент' }).click();
    // Ждём, что Segmented снова показывает «Регламент» активным и форма видна
    await expect(page.locator('.pk-form-page.pk-view-pane:not([hidden])')).toBeVisible({ timeout: 5000 });
  });

  test('14. Результаты → Сводка / Журнал', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('smoke-results');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    // Переключаемся на «Результаты»
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Результаты' }).click();
    // Ждём контент результатов (заголовок + статус)
    await expect(page.locator('h3.pk-results-title')).toBeVisible({ timeout: 8000 });
    // Журнал (ResultsJournalPanel) рендерится всегда — заголовок «Журнал запуска»
    await expect(page.getByText('Журнал запуска')).toBeVisible();
    // Сводка рисков появляется только при наличии meta/stats; для пустого чека — Card «Статус запуска»
    await expect(page.getByText('Статус запуска')).toBeVisible();
  });

  test('15. Результаты → кнопки действий (экспорт)', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('smoke-export');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Результаты' }).click();
    await expect(page.getByText('Результаты проверки')).toBeVisible({ timeout: 8000 });
    // ResultsActionsBar — кнопки экспорта (data-testid)
    await expect(page.locator('[data-testid="results-save-package"]')).toBeVisible();
  });

  test('16. Home logout', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible();
    await page.locator('[data-testid="header-logout"]').click();
    await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible({ timeout: 5000 });
  });

  test('17. Полный цикл без ошибок консоли', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });

    await login(page);

    // Admin: все секции
    await page.locator('[data-testid="home-policies"]').click();
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 8000 });

    await page.getByText('Интеграции').first().click();
    await expect(page.locator('[data-testid="admin-integrations"]')).toBeVisible({ timeout: 5000 });

    await page.getByText('Прогоны').first().click();
    await expect(page.locator('[data-testid="admin-runs"]')).toBeVisible({ timeout: 5000 });

    await page.getByText('Реестр').first().click();
    await expect(page.locator('[data-testid="admin-deploy-registry"]')).toBeVisible({ timeout: 5000 });

    // Назад на home через breadcrumb
    await page.getByText('Главная').click();
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 5000 });

    // History
    await page.locator('[data-testid="home-history"]').click();
    await expect(
      page.locator('[data-testid="history-grid"]'),
    ).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="history-back"]').click();
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 5000 });

    // New check → validate → studio → results
    await page.locator('[data-testid="home-initiate"]').click();
    await page.locator('[data-testid="home-check-title"]').fill('full-cycle');
    await page.locator('[data-testid="home-start-check"]').click();
    await expect(page.getByTitle('Регламент')).toBeVisible({ timeout: 8000 });

    // Studio
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Редактор' }).click();
    await expect(page.locator('.pk-studio-workspace')).toBeVisible({ timeout: 8000 });

    // Validate (entity-validate видна только в студии)
    await page.locator('[data-testid="entity-validate"]').click();
    await expect(page.locator('.ant-message-custom-content.ant-message-success')).toBeVisible({ timeout: 15000 });

    // Back to form
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Регламент' }).click();
    await expect(page.locator('.pk-form-page.pk-view-pane:not([hidden])')).toBeVisible({ timeout: 5000 });

    // Results
    await page.locator('.pk-view-segmented .ant-segmented-item').filter({ hasText: 'Результаты' }).click();
    await expect(page.locator('h3.pk-results-title')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Статус запуска')).toBeVisible();
    await expect(page.getByText('Журнал запуска')).toBeVisible();

    // Закрыть проверку — клик по бренду (workspace-close-check) уводит на home
    await page.locator('[data-testid="workspace-close-check"]').click();
    await expect(page.locator('[data-testid="home-panel"]')).toBeVisible({ timeout: 5000 });

    // Logout
    await page.locator('[data-testid="header-logout"]').click();
    await expect(page.locator('[data-testid="secops-mark"]')).toBeVisible({ timeout: 5000 });

    expect(errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('Warning') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('ERR_FAILED') &&
      !e.includes('Failed to fetch'),
    )).toHaveLength(0);
  });
});