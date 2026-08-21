import { test, expect } from '@playwright/test';

// Разовый probe: доходим до шага выбора адреса в Juice Shop и дампим DOM,
// чтобы взять актуальные селекторы вместо устаревшего mat-radio-button.
test('probe juice shop address selection DOM', async ({ page }) => {
  const base = 'http://localhost:3000';
  const email = `probe-${Date.now()}@example.com`;

  // 1. register
  await page.goto(`${base}/#/register`);
  await page.locator('#emailControl').fill(email);
  await page.locator('#passwordControl').fill('kdt_password');
  await page.locator('#repeatPasswordControl').fill('kdt_password');
  await page.locator('#securityAnswerControl').fill('kdt');
  // выбрать секретный вопрос (иначе registerButton disabled)
  await page.locator("mat-select[aria-label='Selection list for the security question']").click();
  await page.waitForTimeout(500);
  await page.locator('.cdk-overlay-pane mat-option').first().click();
  await page.waitForTimeout(500);
  await page.locator('#registerButton').click();
  await page.waitForTimeout(2000);

  // 2. login
  await page.goto(`${base}/#/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('kdt_password');
  await page.locator('#loginButton').click();
  await page.waitForTimeout(1500);

  // 3. add first product to basket
  await page.goto(`${base}/#/`);
  await page.waitForTimeout(1000);
  const product = page.locator("mat-card section[aria-label='Click for more information about the product']").first();
  await product.click();
  await page.waitForTimeout(800);
  await page.locator("button[aria-label='Close Dialog']").click();
  await page.waitForTimeout(400);
  await page.locator("button[aria-label='Add to Basket']").click();
  await page.waitForTimeout(800);
  await page.locator("button[aria-label='Show the shopping cart']").click();
  await page.waitForTimeout(1000);

  // 4. checkout -> add new address
  await page.locator('#checkoutButton').click();
  await page.waitForTimeout(1000);
  await page.locator("button[aria-label='Add a new address']").click();
  await page.waitForTimeout(1000);
  await page.locator("input[placeholder='Please provide a country.']").fill('Russia');
  await page.locator("input[placeholder='Please provide a name.']").fill('KDT Smoke');
  await page.locator("input[placeholder='Please provide a mobile number.']").fill('9990001122');
  await page.locator("input[placeholder='Please provide a ZIP code.']").fill('123456');
  await page.locator('#address').fill('Lenina 1');
  await page.locator("input[placeholder='Please provide a city.']").fill('Moscow');
  await page.locator("input[placeholder='Please provide a state.']").fill('Moscow');
  await page.locator('#submitButton').click();
  await page.waitForTimeout(2000);

  // 5. dump the address selection DOM
  console.log('=== URL ===', page.url());
  const radios = await page.locator('mat-radio-button').count();
  const mdcRadios = await page.locator('.mat-mdc-radio-button').count();
  const matRows = await page.locator('mat-row').count();
  const tableRows = await page.locator('table tr').count();
  console.log('=== COUNTS: mat-radio-button=', radios, ' .mat-mdc-radio-button=', mdcRadios, ' mat-row=', matRows, ' table tr=', tableRows);

  // dump interactive elements
  const elems = await page.evaluate(() => {
    const out: Array<{tag: string; id: string; aria: string; cls: string; text: string}> = [];
    document.querySelectorAll('mat-radio-button, .mat-mdc-radio-button, mat-row, button, input[type=radio], mat-card').forEach((el) => {
      const h = el as HTMLElement;
      out.push({
        tag: h.tagName.toLowerCase(),
        id: h.id || '',
        aria: h.getAttribute('aria-label') || '',
        cls: (h.className || '').toString().slice(0, 120),
        text: (h.textContent || '').trim().slice(0, 80),
      });
    });
    return out;
  });
  for (const e of elems) {
    console.log('ELEM', JSON.stringify(e));
  }

  expect(true).toBe(true);
});
