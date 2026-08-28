import { describe, expect, it } from 'vitest';
import { parseWireDocument } from './wireDocumentParser';
import { applyCanvasStepPatch, formatPrimaryAction } from './wireDocumentSerializer';

describe('wireDocumentSerializer (WIRE-SYNC-B2)', () => {
  it('1. formats primary actions correctly for Sugar DSL', () => {
    const s1 = {
      id: '1',
      action: 'Click' as const,
      strategy: 'css' as const,
      strategyValue: '.btn-submit',
      payload: '',
      continueOnError: false,
      led: 'queued' as const,
    };
    expect(formatPrimaryAction(s1, 'Клик .btn-old')).toBe('Клик .btn-submit');

    const s2 = {
      id: '2',
      action: 'Type' as const,
      strategy: 'test_id' as const,
      strategyValue: 'username',
      payload: 'admin',
      continueOnError: false,
      led: 'queued' as const,
    };
    expect(formatPrimaryAction(s2, 'Вставить #user "old"')).toBe('Вставить #username admin');
  });

  it('2. formats primary actions correctly for Wire format', () => {
    const s1 = {
      id: '1',
      action: 'Click' as const,
      strategy: 'css' as const,
      strategyValue: '.btn-submit',
      payload: '',
      continueOnError: false,
      led: 'queued' as const,
    };
    expect(formatPrimaryAction(s1, 'webdriver|click|css|.btn-old')).toBe(
      'webdriver|click|css|.btn-submit',
    );
  });

  it('3. GWT-2 acceptance test: patches primary selector while preserving single-line >@ { recover }', () => {
    const originalText = [
      '# Сценарий оплаты',
      '@ Title: Оплата',
      'Открыть /checkout',
      'Нажать css .pay-btn >@ { Нажать css .confirm-modal-btn }',
      'Клик .close-banner',
    ].join('\n');

    const doc = parseWireDocument(originalText);
    const payStepNode = doc.nodes[3]!;
    expect(payStepNode.stepModel?.strategyValue).toBe('.pay-btn');
    expect(payStepNode.annotation?.recover).toBeDefined();

    const { newText, newDoc } = applyCanvasStepPatch(doc, payStepNode.id, {
      strategyValue: '#submit-pay',
      strategy: 'test_id',
    });

    const expectedText = [
      '# Сценарий оплаты',
      '@ Title: Оплата',
      'Открыть /checkout',
      'Нажать #submit-pay >@ { Нажать css .confirm-modal-btn }',
      'Клик .close-banner',
    ].join('\n');

    expect(newText).toBe(expectedText);
    expect(newDoc.meta.title).toBe('Оплата');
    expect(newDoc.nodes).toHaveLength(5);
  });

  it('4. preserves multi-line >@ { recover } block when patching primary step', () => {
    const originalText = [
      '@ Title: Заказ',
      'Нажать css .pay-btn >@ {',
      '  Нажать css .confirm-modal-btn',
      '  Ждать 500',
      '}',
      'Клик .done',
    ].join('\n');

    const doc = parseWireDocument(originalText);
    const stepId = doc.nodes[1]!.id;

    const { newText } = applyCanvasStepPatch(doc, stepId, {
      strategyValue: '.new-pay-btn',
    });

    const expectedText = [
      '@ Title: Заказ',
      'Нажать .new-pay-btn >@ {',
      '  Нажать css .confirm-modal-btn',
      '  Ждать 500',
      '}',
      'Клик .done',
    ].join('\n');

    expect(newText).toBe(expectedText);
  });

  it('5. preserves soft modifier >? when updating primary step', () => {
    const originalText = [
      'Открыть /login',
      'Клик .promo-banner >?',
      'Вставить #user "admin"',
    ].join('\n');

    const doc = parseWireDocument(originalText);
    const bannerStepId = doc.nodes[1]!.id;

    const { newText } = applyCanvasStepPatch(doc, bannerStepId, {
      strategyValue: '.promo-banner-v2',
    });

    expect(newText).toBe([
      'Открыть /login',
      'Клик .promo-banner-v2 >?',
      'Вставить #user "admin"',
    ].join('\n'));
  });

  it('6. toggles soft modifier >? when continueOnError is explicitly changed', () => {
    const originalText = 'Клик .btn >?';
    const doc = parseWireDocument(originalText);
    const stepId = doc.nodes[0]!.id;

    // Turn off continueOnError
    const res1 = applyCanvasStepPatch(doc, stepId, { continueOnError: false });
    expect(res1.newText).toBe('Клик .btn');

    // Turn on continueOnError
    const res2 = applyCanvasStepPatch(res1.newDoc, res1.newDoc.nodes[0]!.id, {
      continueOnError: true,
    });
    expect(res2.newText).toBe('Клик .btn >?');
  });

  it('7. preserves data pipe -> $var when updating step', () => {
    const originalText = 'Текст .balance -> $oldBalance';
    const doc = parseWireDocument(originalText);
    const stepId = doc.nodes[0]!.id;

    const { newText } = applyCanvasStepPatch(doc, stepId, {
      strategyValue: '.account-balance-v2',
    });

    expect(newText).toBe('Проверить css .account-balance-v2 -> $oldBalance');
  });

  it('8. preserves hint ># hint when updating step', () => {
    const originalText = 'Клик .submit ># КнопкаВхода';
    const doc = parseWireDocument(originalText);
    const stepId = doc.nodes[0]!.id;

    const { newText } = applyCanvasStepPatch(doc, stepId, {
      strategyValue: '#new-submit',
      strategy: 'test_id',
    });

    expect(newText).toBe('Клик #new-submit ># КнопкаВхода');
  });

  it('9. preserves surrounding comments, blank lines, and indentation byte-for-byte', () => {
    const originalText = [
      '# Секция 1: Аутентификация',
      '  ',
      '@ Title: Smoke Auth',
      '  # Вход оператора',
      '  Открыть /login',
      '  Вставить #user "admin"',
      '  ',
      '# Конец',
    ].join('\n');

    const doc = parseWireDocument(originalText);
    const userInputNode = doc.nodes[5]!;

    const { newText } = applyCanvasStepPatch(doc, userInputNode.id, {
      payload: 'super-admin',
    });

    const expectedText = [
      '# Секция 1: Аутентификация',
      '  ',
      '@ Title: Smoke Auth',
      '  # Вход оператора',
      '  Открыть /login',
      '  Вставить #user super-admin',
      '  ',
      '# Конец',
    ].join('\n');

    expect(newText).toBe(expectedText);
  });

  it('10. handles sequential patches cleanly across different steps', () => {
    const originalText = [
      'Открыть /initial',
      'Вставить #login "guest"',
      'Клик .submit-btn',
    ].join('\n');

    const doc1 = parseWireDocument(originalText);
    const step1Id = doc1.nodes[0]!.id;

    // Patch 1: Open /dashboard
    const res1 = applyCanvasStepPatch(doc1, step1Id, { payload: '/dashboard' });
    expect(res1.newText).toBe([
      'Открыть /dashboard',
      'Вставить #login "guest"',
      'Клик .submit-btn',
    ].join('\n'));

    // Patch 2: Type user "admin"
    const step2Id = res1.newDoc.nodes[1]!.id;
    const res2 = applyCanvasStepPatch(res1.newDoc, step2Id, { payload: 'admin' });
    expect(res2.newText).toBe([
      'Открыть /dashboard',
      'Вставить #login admin',
      'Клик .submit-btn',
    ].join('\n'));

    // Patch 3: Click #confirm
    const step3Id = res2.newDoc.nodes[2]!.id;
    const res3 = applyCanvasStepPatch(res2.newDoc, step3Id, {
      strategy: 'test_id',
      strategyValue: 'confirm',
    });
    expect(res3.newText).toBe([
      'Открыть /dashboard',
      'Вставить #login admin',
      'Клик #confirm',
    ].join('\n'));
  });

  it('11. returns unchanged document if stepId is not found', () => {
    const text = 'Открыть /home\nКлик .btn';
    const doc = parseWireDocument(text);
    const { newText, patchedNode } = applyCanvasStepPatch(doc, 'non-existent-id', {
      payload: '123',
    });

    expect(newText).toBe(text);
    expect(patchedNode).toBeNull();
  });
});
