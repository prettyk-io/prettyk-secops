import { describe, expect, it } from 'vitest';
import {
  addFuzzer,
  CORPUS_AUTO,
  corpusOptions,
  emptyFuzzer,
  fuzzerIdError,
  INTENT_CORPUS_PRESETS,
  migrateLegacyFuzzerModules,
  normalizeFuzzer,
  PRESET_ATTACK_TEMPLATES,
  removeFuzzer,
  renameFuzzer,
  updateFuzzer,
  validateFuzzerFields,
} from './studioFuzzers';

describe('studioFuzzers', () => {
  it('создаёт fuzzer с Juice defaults', () => {
    const added = addFuzzer({}, 'juice_search_q')!;
    const fuzzers = (added.data as { test_suites: { fuzzers: unknown[] } }).test_suites
      .fuzzers;
    expect(fuzzers).toHaveLength(1);
    const fields = normalizeFuzzer(fuzzers[0]);
    expect(fields.id).toBe('juice_search_q');
    expect(fields.location.name).toBe('q');
    expect(fields.corpus).toBe(CORPUS_AUTO);
    expect(fields.algorithm).toBe('sniper');
    expect(fields.session_replay).toBe(false);
    expect(fields.message.url).toContain('juice-shop');
    expect(emptyFuzzer('x').message).toMatchObject({ source: 'template', method: 'GET' });
  });

  it('отклоняет кириллицу и дубликаты', () => {
    expect(fuzzerIdError('')).toBeTruthy();
    expect(fuzzerIdError('фаза')).toBeTruthy();
    expect(fuzzerIdError('juice_q')).toBeUndefined();
    const a = addFuzzer({}, 'a')!;
    expect(addFuzzer(a.data, 'a')).toBeUndefined();
  });

  it('rename / update / remove', () => {
    const a = addFuzzer({}, 'one')!;
    const renamed = renameFuzzer(a.data, 0, 'two') as {
      test_suites: { fuzzers: unknown[] };
    };
    expect(normalizeFuzzer(renamed.test_suites.fuzzers[0]).id).toBe('two');
    const patched = updateFuzzer(renamed, 0, {
      corpus: 'intent_sqli_smoke',
      location: { kind: 'query_param', name: 'q' },
    }) as { test_suites: { fuzzers: unknown[] } };
    expect(normalizeFuzzer(patched.test_suites.fuzzers[0]).corpus).toBe('intent_sqli_smoke');
    const removed = removeFuzzer(patched, 0) as { test_suites: { fuzzers: unknown[] } };
    expect(removed.test_suites.fuzzers).toEqual([]);
  });

  it('validate: битый corpus краснеет', () => {
    const fields = normalizeFuzzer(emptyFuzzer('ok'));
    fields.corpus = 'missing_stream';
    fields.targets[0]!.corpus = 'missing_stream';
    const issues = validateFuzzerFields(fields, {});
    expect(issues.some((i) => i.field === 'corpus' || i.field.startsWith('targets['))).toBe(
      true,
    );
  });

  it('corpus=auto и pack presets в select', () => {
    const fields = normalizeFuzzer(emptyFuzzer('ok'));
    expect(validateFuzzerFields(fields, {}).filter((i) => i.field.includes('corpus'))).toEqual(
      [],
    );
    fields.corpus = 'auto';
    fields.targets[0]!.corpus = 'auto';
    expect(validateFuzzerFields(fields, {}).filter((i) => i.field.includes('corpus'))).toEqual(
      [],
    );
    const opts = corpusOptions({});
    expect(opts[0]?.value).toBe(CORPUS_AUTO);
    expect(INTENT_CORPUS_PRESETS).toContain('intent_path_smoke');
    expect(INTENT_CORPUS_PRESETS).toContain('intent_ssti_smoke');
    expect(opts.some((o) => o.value === 'intent_path_smoke')).toBe(true);
  });

  it('validate: corpus a,b и triples→sniper; pitchfork нужен ≥2 цели', () => {
    const fields = normalizeFuzzer(emptyFuzzer('ok'));
    fields.corpus = 'intent_lab_a,intent_lab_b';
    fields.targets[0]!.corpus = 'intent_lab_a,intent_lab_b';
    fields.algorithm = 'triples';
    expect(validateFuzzerFields(fields, {}).filter((i) => i.field === 'corpus')).toEqual([]);
    fields.algorithm = 'pitchfork';
    const issues = validateFuzzerFields(fields, {});
    expect(issues.some((i) => i.message.includes('≥2 цели'))).toBe(true);
  });

  it('soft-migrate legacy Фаззер → fuzzers[]', () => {
    const next = migrateLegacyFuzzerModules({
      test_suites: {
        test_data_constructor: [
          {
            id: 'legacy_q',
            module_type: 'Фаззер',
            fuzzing_fields: {
              request: { url: 'http://x/search', method: 'GET' },
              injection: { query_param: 'q', corpus: 'intent_boundary' },
            },
          },
        ],
      },
    }) as { test_suites: { fuzzers: unknown[]; test_data_constructor: unknown[] } };
    expect(next.test_suites.fuzzers).toHaveLength(1);
    expect(normalizeFuzzer(next.test_suites.fuzzers[0]).id).toBe('legacy_q');
    expect(next.test_suites.test_data_constructor).toHaveLength(1);
  });

  it('содержит галерею пресетов атак PRESET_ATTACK_TEMPLATES', () => {
    const templates = Object.values(PRESET_ATTACK_TEMPLATES);
    expect(templates.length).toBeGreaterThanOrEqual(5);
    const sqli = PRESET_ATTACK_TEMPLATES.json_sqli_injection;
    expect(sqli).toBeDefined();
    if (sqli && sqli.targets[0]) {
      expect(sqli.targets[0].method).toBe('POST');
      expect(sqli.targets[0].body).toContain('{MASK_1}');
    }
  });
});
