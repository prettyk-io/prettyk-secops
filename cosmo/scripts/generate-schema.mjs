/**
 * Копирует docs/manifest.json в src/generated/manifest.schema.json.
 *
 * Схема — единственный источник правды для формы, но импортировать её напрямую из ../docs
 * нельзя: сборка должна быть самодостаточной (airgap-контур, отсутствие server.fs.allow).
 * Поэтому файл копируется в дерево исходников перед dev и build.
 *
 * Запуск: npm run generate:schema
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(FRONTEND_ROOT, '..');

const SOURCE = resolve(REPO_ROOT, 'docs/manifest.json');
const TARGET = resolve(FRONTEND_ROOT, 'src/generated/manifest.schema.json');

const BANNER =
  'СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не редактировать вручную. ' +
  'Источник: docs/manifest.json, генератор: frontend/scripts/generate-schema.mjs. ' +
  'Обновить: npm run generate:schema';

const raw = await readFile(SOURCE, 'utf8');

let schema;
try {
  schema = JSON.parse(raw);
} catch (error) {
  console.error(`generate-schema: ${SOURCE} не является валидным JSON`);
  throw error;
}

if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
  throw new Error(`generate-schema: ожидался JSON-объект в ${SOURCE}`);
}

// $comment — часть JSON Schema, поэтому шапка не ломает валидатор и остаётся видимой в файле.
const decorated = { $comment: BANNER, ...schema };

await mkdir(dirname(TARGET), { recursive: true });
await writeFile(TARGET, `${JSON.stringify(decorated, null, 2)}\n`, 'utf8');

const propertyCount = Object.keys(schema.properties ?? {}).length;
const conditionCount = Array.isArray(schema.allOf) ? schema.allOf.length : 0;
console.log(
  `generate-schema: docs/manifest.json -> src/generated/manifest.schema.json ` +
    `(${propertyCount} корневых свойств, ${conditionCount} условий allOf)`,
);
