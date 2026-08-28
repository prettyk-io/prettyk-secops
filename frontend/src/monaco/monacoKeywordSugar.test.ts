// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DSL_SUGAR_ALIASES,
  resolveSugarAlias,
  matchingSugarAliases,
  filterNonSugarCanonicals,
  isSugarAlias,
} from './monacoKeywordSugar';

describe('DSL-F1: sugar aliases', () => {
  it('10 сахарных пар', () => {
    expect(DSL_SUGAR_ALIASES).toHaveLength(10);
  });

  it('resolveSugarAlias: Клик → Нажать', () => {
    expect(resolveSugarAlias('Клик')).toBe('Нажать');
  });

  it('resolveSugarAlias: Вставить → ВставитьЗначение', () => {
    expect(resolveSugarAlias('Вставить')).toBe('ВставитьЗначение');
  });

  it('resolveSugarAlias: Ждать → ЖдатьЭлемент', () => {
    expect(resolveSugarAlias('Ждать')).toBe('ЖдатьЭлемент');
  });

  it('resolveSugarAlias: Скрин → Скриншот', () => {
    expect(resolveSugarAlias('Скрин')).toBe('Скриншот');
  });

  it('resolveSugarAlias: Текст → ПолучитьТекст', () => {
    expect(resolveSugarAlias('Текст')).toBe('ПолучитьТекст');
  });

  it('resolveSugarAlias: Значение → ПолучитьЗначение', () => {
    expect(resolveSugarAlias('Значение')).toBe('ПолучитьЗначение');
  });

  it('resolveSugarAlias: Атрибут → ПолучитьАтрибут', () => {
    expect(resolveSugarAlias('Атрибут')).toBe('ПолучитьАтрибут');
  });

  it('resolveSugarAlias: Дописать → ДописатьТекст', () => {
    expect(resolveSugarAlias('Дописать')).toBe('ДописатьТекст');
  });

  it('resolveSugarAlias: Очистить → ОчиститьЗначение', () => {
    expect(resolveSugarAlias('Очистить')).toBe('ОчиститьЗначение');
  });

  it('resolveSugarAlias: Выбрать → ВыбратьПоТексту', () => {
    expect(resolveSugarAlias('Выбрать')).toBe('ВыбратьПоТексту');
  });

  it('resolveSugarAlias: неизвестный → undefined', () => {
    expect(resolveSugarAlias('НеСахар')).toBeUndefined();
  });

  it('matchingSugarAliases: фильтрует только совпадающие canonical', () => {
    const names = ['Нажать', 'ВставитьЗначение', 'НовыйТаб'];
    const hits = matchingSugarAliases(names);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.label)).toEqual(['Клик', 'Вставить']);
  });

  it('matchingSugarAliases: пустой список → пустой результат', () => {
    expect(matchingSugarAliases([])).toEqual([]);
  });

  it('matchingSugarAliases: нет совпадений → пусто', () => {
    expect(matchingSugarAliases(['НовыйТаб', 'ПрочитатьФайл'])).toEqual([]);
  });

  it('filterNonSugarCanonicals: убирает Нажать, оставляет неродственные', () => {
    const names = ['Нажать', 'НовыйТаб', 'ВставитьЗначение', 'Скриншот'];
    const filtered = filterNonSugarCanonicals(names);
    expect(filtered).toEqual(['НовыйТаб']);
  });

  it('isSugarAlias: true для Клик, false для Нажать', () => {
    expect(isSugarAlias('Клик')).toBe(true);
    expect(isSugarAlias('Нажать')).toBe(false);
    expect(isSugarAlias('Вставить')).toBe(true);
    expect(isSugarAlias('НеСахар')).toBe(false);
  });

  it('все алиасы уникальны (нет дубликатов labels)', () => {
    const labels = DSL_SUGAR_ALIASES.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('все canonical уникальны', () => {
    const canonicals = DSL_SUGAR_ALIASES.map((a) => a.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });
});