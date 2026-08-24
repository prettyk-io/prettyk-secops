/**
 * PURE default wired for checksStore.
 * Every new check starts with an empty canvas — no demo artifacts.
 * LEGACY-REGULATION fields (scan_policy, auth_type, assessment_purpose etc.) omitted.
 */
import type { WiredData } from './types';

export function defaultWired(): WiredData {
  return {
    meta: {
      project_id: '',
      initiator_name: '',
      app_leader: '',
      assessment_purpose: 'scheduled',
      scheduled_info: '',
      generate_act: false,
    },
    infrastructure: {
      base_url_override: '',
      allowed_extra_domains: '',
      blocked_urls_list: [],
      zap_mode: 'demon',
      zap_work_timeout_min: 30,
      browser_type: 'chrome',
      debug_mode: false,
      idle_timeout_min: 10,
    },
    test_suites: {
      test_data_constructor: [],
      imports: [],
      pages: {},
      scenarios: [],
      fuzzers: [],
      folders: {},
    },
  };
}