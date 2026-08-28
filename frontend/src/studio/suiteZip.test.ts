import { describe, expect, it } from 'vitest';
import { exportWiredJson } from '../utils/exportWired';
import {
  buildSuiteZipFiles,
  buildZipBlob,
  extractSuiteFromZipFiles,
  readStoreZipTextFiles,
} from './suiteZip';

describe('suiteZip', () => {
  it('собирает и читает store-zip suite', async () => {
    const files = buildSuiteZipFiles('{"meta":{}}\n', {
      urls: 'https://a\nhttps://b\n',
    });
    expect(files['wired.json']).toContain('meta');
    expect(files['resources/urls.txt']).toContain('https://a');

    const blob = buildZipBlob(files);
    const buffer = await blob.arrayBuffer();
    const roundtrip = readStoreZipTextFiles(buffer);
    expect(roundtrip).toBeDefined();
    const extracted = extractSuiteFromZipFiles(roundtrip!);
    expect(extracted.wiredJson).toContain('meta');
    expect(extracted.resourceContents.urls).toContain('https://b');
  });

  it('G-12: authoring export A + resources → zip → extract сохраняет as', async () => {
    const formData = {
      meta: {
        project_id: 'zip-rt',
        initiator_name: 'a@example.test',
        app_leader: 'b@example.test',
        assessment_purpose: 'emergency',
        emergency_reason: 'g12',
        release_domain: 'lab',
        compliance_requirements: '',
        release_manager: 'c@example.test',
      },
      infrastructure: {
        scanner_mode: 'demon',
        browser_type: 'chrome',
        additional_local_server_port: 8085,
        scanner_work_timeout_min: 10,
        idle_timeout_min: 5,
        webswing_session_timeout_min: 60,
      },
      security_configuration: {
        base_url_override: 'http://juice-shop:3000',
        allowed_extra_domains: '',
        scan_policy: 'custom_policy',
        auth_type: 'Без авторизации',
      },
      test_suites: {
        imports: [{ path: 'resources/urls.txt', kind: 'data_file', as: 'urls' }],
        pages: {},
        scenarios: [],
        test_data_constructor: [],
      },
    };
    const wiredJson = exportWiredJson(formData, 'authoring');
    const files = buildSuiteZipFiles(wiredJson, {
      urls: 'http://juice-shop:3000/#/\n',
    });
    const extracted = extractSuiteFromZipFiles(
      readStoreZipTextFiles(await buildZipBlob(files).arrayBuffer())!,
    );
    expect(extracted.resourceContents.urls).toContain('juice-shop');
    expect(extracted.wiredJson).toContain('"as": "urls"');
    expect(extracted.wiredJson).not.toContain('***');
  });
});
