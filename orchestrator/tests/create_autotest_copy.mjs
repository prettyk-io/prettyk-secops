// Создать копию референс-проверки в localStorage
import { readFileSync, writeFileSync } from 'fs';

// Подключаемся к CDP и читаем
const harness = 'D:\\Buddy\\Flow\\Current\\blitz-auth\\cdp';
const lib = await import(`file://${harness}/lib.mjs`);

const page = lib.page;

const result = await page.evaluate(() => {
  const raw = localStorage.getItem('pk.checks.v1');
  if (!raw) return { error: 'NO_CHECKS' };
  
  const snap = JSON.parse(raw);
  const ref = snap.items.find(i => i.check_id === '114a306c-4ce5-4e43-88f4-65490947f7ef');
  if (!ref) return { error: 'NO_REF' };
  
  // uuid v4
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  
  const now = new Date().toISOString();
  const title = 'Juice Shop AutoTest — ' + now.slice(0, 16).replace('T', ' ');
  
  const copy = {
    check_id: id,
    title: title,
    status: 'draft',
    created_at: now,
    updated_at: now,
    wired: JSON.parse(JSON.stringify(ref.wired)),
  };
  
  copy.wired.meta.assessment_purpose = 'scheduled';
  copy.wired.meta.project_id = 'autotest-' + id.slice(0, 8);
  
  snap.items.push(copy);
  localStorage.setItem('pk.checks.v1', JSON.stringify(snap));
  
  return { id, title, scenario_count: ref.wired.test_suites.scenarios.length };
});

console.log(JSON.stringify(result, null, 2));

// Сохраняем ID для дальнейшего использования
writeFileSync('D:\\prettyk-secops\\orchestrator\\tests\\autotest_check_id.txt', result.id);
console.log('Saved check_id:', result.id);