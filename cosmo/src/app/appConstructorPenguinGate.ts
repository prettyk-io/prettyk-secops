/**
 * Constructor batch gate → penguin drawer payload (S3776).
 */
import {
  formatPenguinFailSample,
  validateConstructorsBatch,
} from '../api/editorValidate';
import type { KeywordCatalog } from '../keywords/catalog';
import { collectConstructorFields } from '../keywords/constructor';
import type { ValidationFeedback } from '../components/ConstructorNoPenguin';
import {
  collectClientConstructorFails,
  mergeConstructorFails,
} from './appConstructorGate';
import { collectFuzzerRefFails } from './appConstructorFuzzRefs';

export async function runConstructorPenguinGate(
  data: unknown,
  catalog: KeywordCatalog,
  onFail: (drawer: ValidationFeedback) => void,
): Promise<boolean> {
  const fields = collectConstructorFields(data);
  const clientFails = [
    ...collectClientConstructorFails(fields, data, catalog),
    ...collectFuzzerRefFails(fields, data),
  ];
  const beFails = await validateConstructorsBatch(fields, data);
  const fails = mergeConstructorFails(beFails, clientFails);
  if (fails.length === 0) {
    return true;
  }
  onFail({
    title: 'Конструктор не ок — JSON не отдаём',
    description: 'Проверка нашла ошибки в конструкторе.',
    errorCount: fails.length,
    samples: fails.map((fail) => formatPenguinFailSample(fail)),
    samplesHint: 'id · строка:столбец — сообщение',
    fails,
  });
  return false;
}
