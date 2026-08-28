/**
 * RK-FORM-3: импорт/экспорт манифеста (замена exportWired.ts).
 * download, loadFromFile, resetToDefault.
 */

import type { Wired } from './types';
import { redactWiredSecrets } from '../form/redactSecrets';

const MANIFEST_FILENAME = 'wired.json';

/** Скачать манифест как JSON-файл (секреты замаскированы). */
export function downloadWired(wired: Wired): void {
  const safe = redactWiredSecrets(wired);
  const json = JSON.stringify(safe, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = MANIFEST_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}

/** Прочитать манифест из загруженного файла */
export function loadWiredFromFile(file: File): Promise<Wired> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        resolve(json as Wired);
      } catch (e) {
        reject(new Error('Невалидный JSON: ' + (e instanceof Error ? e.message : String(e))));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file);
  });
}

/** Дефолтный манифест (коробка secops-lab-pure) */
export function defaultWired(): Wired {
  return {
    regulation: {
      meta: {
        project_id: 'owasp-scanner-tests',
        initiator_name: '',
        app_leader: '',
        assessment_purpose: 'scheduled',
        generate_act: false,
      },
      infrastructure: {
        base_url_override: 'http://runner01.dev.spaceport.ru:8080',
        allowed_extra_domains: '',
        scanner_mode: 'demon',
        browser_type: 'chrome',
        debug_mode: false,
      },
      security_configuration: {
        scan_policy: 'custom_policy',
        auth_type: 'Без авторизации',
        auth_details: {},
        active_auth_module: '',
      },
    },
    editor: {
      imports: [],
      pages: [],
      scenarios: [],
      modules: {
        auth: [],
        openapi: [],
        graphql: [],
        grpc: [],
        chain: [],
        data: [],
        connectors: [],
        fuzzers: [],
      },
      fuzzer_targets: [],
    },
  };
}

/** Сбросить манифест к дефолту — вызывается по кнопке "Сбросить" */
export function resetToDefault(): Wired {
  return defaultWired();
}
