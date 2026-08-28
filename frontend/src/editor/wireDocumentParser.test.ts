import { describe, expect, it } from 'vitest';
import {
  documentToScenarioDecks,
  fastContentHash,
  parseWireDocument,
} from './wireDocumentParser';

describe('wireDocumentParser (WIRE-SYNC-B1)', () => {
  it('1. parses empty document into empty nodes with valid hash', () => {
    const doc = parseWireDocument('');
    expect(doc.nodes).toHaveLength(0);
    expect(doc.scenarioFailsafe).toBe(false);
    expect(doc.meta.title).toBeUndefined();
    expect(doc.contentHash).toBeTruthy();

    const decks = documentToScenarioDecks(doc);
    expect(decks).toHaveLength(1);
    expect(decks[0]!.steps).toHaveLength(0);
    expect(decks[0]!.title).toBe('Сценарий');
  });

  it('2. parses whitespace and comments without generating action steps', () => {
    const text = '   \n# Это комментарий\n// Еще комментарий\n\n';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(5);
    expect(doc.nodes[0]!.kind).toBe('empty_line');
    expect(doc.nodes[1]!.kind).toBe('comment');
    expect(doc.nodes[2]!.kind).toBe('comment');
    expect(doc.nodes[3]!.kind).toBe('empty_line');
    expect(doc.nodes[4]!.kind).toBe('empty_line');

    const decks = documentToScenarioDecks(doc);
    expect(decks[0]!.steps).toHaveLength(0);
  });

  it('3. parses basic Sugar DSL actions (Click, Type, Open, Wait)', () => {
    const text = [
      'Открыть /dashboard',
      'Клик .btn-login',
      'Вставить #username "admin"',
      'Ждать 1000',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(4);

    expect(doc.nodes[0]!.kind).toBe('action');
    expect(doc.nodes[0]!.stepModel?.action).toBe('Open');
    expect(doc.nodes[0]!.stepModel?.payload).toBe('/dashboard');

    expect(doc.nodes[1]!.kind).toBe('action');
    expect(doc.nodes[1]!.stepModel?.action).toBe('Click');
    expect(doc.nodes[1]!.stepModel?.strategy).toBe('css');
    expect(doc.nodes[1]!.stepModel?.strategyValue).toBe('.btn-login');

    expect(doc.nodes[2]!.kind).toBe('action');
    expect(doc.nodes[2]!.stepModel?.action).toBe('Type');
    expect(doc.nodes[2]!.stepModel?.strategy).toBe('test_id');
    expect(doc.nodes[2]!.stepModel?.strategyValue).toBe('username');
    expect(doc.nodes[2]!.stepModel?.payload).toBe('admin');

    expect(doc.nodes[3]!.kind).toBe('action');
    expect(doc.nodes[3]!.stepModel?.action).toBe('Wait');
    expect(doc.nodes[3]!.stepModel?.payload).toBe('1000');

    const decks = documentToScenarioDecks(doc);
    expect(decks[0]!.steps).toHaveLength(4);
  });

  it('4. parses canonical MethodIds (Нажать, ВставитьЗначение, ОткрытьПоURL)', () => {
    const text = [
      'ОткрытьПоURL "https://prettyk.io/app"',
      'ВставитьЗначение css "#login" "user@corp.ru"',
      'Нажать role button "Войти"',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(3);

    expect(doc.nodes[0]!.stepModel?.action).toBe('Open');
    expect(doc.nodes[0]!.stepModel?.payload).toBe('https://prettyk.io/app');

    expect(doc.nodes[1]!.stepModel?.action).toBe('Type');
    expect(doc.nodes[1]!.stepModel?.strategy).toBe('css');
    expect(doc.nodes[1]!.stepModel?.strategyValue).toBe('#login');
    expect(doc.nodes[1]!.stepModel?.payload).toBe('user@corp.ru');

    expect(doc.nodes[2]!.stepModel?.action).toBe('Click');
    expect(doc.nodes[2]!.stepModel?.strategy).toBe('role');
    expect(doc.nodes[2]!.stepModel?.strategyValue).toBe('button');
    expect(doc.nodes[2]!.stepModel?.payload).toBe('Войти');
  });

  it('5. parses wire format lines (webdriver|click|css|.btn)', () => {
    const text = [
      'webdriver|open|/auth',
      'webdriver|send_keys|css|#pass|secret123',
      'webdriver|click|xpath|//button[@type="submit"]',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(3);

    expect(doc.nodes[0]!.stepModel?.action).toBe('Open');
    expect(doc.nodes[0]!.stepModel?.payload).toBe('/auth');

    expect(doc.nodes[1]!.stepModel?.action).toBe('Type');
    expect(doc.nodes[1]!.stepModel?.strategy).toBe('css');
    expect(doc.nodes[1]!.stepModel?.strategyValue).toBe('#pass');
    expect(doc.nodes[1]!.stepModel?.payload).toBe('secret123');

    expect(doc.nodes[2]!.stepModel?.action).toBe('Click');
    expect(doc.nodes[2]!.stepModel?.strategy).toBe('xpath');
    expect(doc.nodes[2]!.stepModel?.strategyValue).toBe('//button[@type="submit"]');
  });

  it('6. extracts metadata (@ Title, @ Description, @ Tag)', () => {
    const text = [
      '@ Title: Сценарий авторизации',
      '@ Description: Проверка входа с валидным паролем',
      '@ Tag: smoke, regression',
      'Открыть /login',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.meta.title).toBe('Сценарий авторизации');
    expect(doc.meta.description).toBe('Проверка входа с валидным паролем');
    expect(doc.meta.tags).toEqual(['smoke', 'regression']);

    const decks = documentToScenarioDecks(doc);
    expect(decks[0]!.title).toBe('Сценарий авторизации');
    expect(decks[0]!.description).toBe('Проверка входа с валидным паролем');
    expect(decks[0]!.steps).toHaveLength(1);
  });

  it('7. extracts scenario-level failsafe marker <!>', () => {
    const text = ['<!>', 'Открыть /login', 'Клик .btn'].join('\n');
    const doc = parseWireDocument(text);
    expect(doc.scenarioFailsafe).toBe(true);

    const decks = documentToScenarioDecks(doc);
    expect(decks[0]!.continueOnError).toBe(true);
    expect(decks[0]!.steps).toHaveLength(2);
  });

  it('8. extracts variable declarations (Пусть, Секрет)', () => {
    const text = [
      'Пусть $username = "admin"',
      'Секрет $password = "sec123"',
      'Вставить #u $username',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(3);

    const letNode = doc.nodes[0]!;
    expect(letNode.kind).toBe('declaration');
    expect(letNode.declaration?.kind).toBe('let');
    expect(letNode.declaration?.name).toBe('username');
    expect(letNode.declaration?.value).toBe('admin');

    const secNode = doc.nodes[1]!;
    expect(secNode.kind).toBe('declaration');
    expect(secNode.declaration?.kind).toBe('secret');
    expect(secNode.declaration?.name).toBe('password');
    expect(secNode.declaration?.value).toBe('sec123');
  });

  it('9. parses soft step modifier >?', () => {
    const text = 'Клик .promo-modal-close >?';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);

    const node = doc.nodes[0]!;
    expect(node.kind).toBe('action');
    expect(node.stepModel?.action).toBe('Click');
    expect(node.stepModel?.continueOnError).toBe(true);
    expect(node.annotation?.soft).toBe(true);

    const decks = documentToScenarioDecks(doc);
    expect(decks[0]!.steps[0]!.continueOnError).toBe(true);
  });

  it('10. parses data pipe modifier -> $var', () => {
    const text = 'Текст .account-balance -> $balance';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);

    const node = doc.nodes[0]!;
    expect(node.stepModel?.action).toBe('Check');
    expect(node.annotation?.saveAs).toBe('$balance');
  });

  it('11. parses self-healing hint ># hint', () => {
    const text = 'Клик css ".submit-v2" ># Кнопка входа';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);

    const node = doc.nodes[0]!;
    expect(node.stepModel?.action).toBe('Click');
    expect(node.stepModel?.strategyValue).toBe('.submit-v2');
    expect(node.annotation?.hint).toBe('Кнопка входа');
  });

  it('12. parses single-line >@ { recover } block', () => {
    const text = 'Нажать css .pay-btn >@ { Нажать css .confirm-modal-btn }';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);

    const node = doc.nodes[0]!;
    expect(node.kind).toBe('action');
    expect(node.stepModel?.action).toBe('Click');
    expect(node.stepModel?.strategyValue).toBe('.pay-btn');

    expect(node.annotation?.recover).toBeDefined();
    expect(node.annotation?.recover?.retryPrimary).toBe(1);
    expect(node.annotation?.recover?.rawBody).toBe('Нажать css .confirm-modal-btn');
    expect(node.annotation?.recover?.steps).toHaveLength(1);
    expect(node.annotation?.recover?.steps[0]!.action).toBe('Click');
    expect(node.annotation?.recover?.steps[0]!.strategyValue).toBe('.confirm-modal-btn');
  });

  it('13. parses multi-line >@ { recover } block with multiple steps', () => {
    const text = [
      'Нажать css .pay-btn >@ {',
      '  Нажать css .confirm-modal-btn',
      '  Ждать 500',
      '}',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);

    const node = doc.nodes[0]!;
    expect(node.kind).toBe('action');
    expect(node.stepModel?.action).toBe('Click');
    expect(node.stepModel?.strategyValue).toBe('.pay-btn');

    expect(node.annotation?.recover?.steps).toHaveLength(2);
    expect(node.annotation?.recover?.steps[0]!.action).toBe('Click');
    expect(node.annotation?.recover?.steps[0]!.strategyValue).toBe('.confirm-modal-btn');
    expect(node.annotation?.recover?.steps[1]!.action).toBe('Wait');
    expect(node.annotation?.recover?.steps[1]!.payload).toBe('500');

    expect(node.span.startLine).toBe(1);
    expect(node.span.endLine).toBe(4);
  });

  it('14. calculates exact SourceSpan for lines', () => {
    const line1 = 'Открыть /home';
    const line2 = 'Клик .btn';
    const text = `${line1}\n${line2}`;

    const doc = parseWireDocument(text);
    expect(doc.nodes[0]!.span).toEqual({
      startOffset: 0,
      endOffset: line1.length,
      startLine: 1,
      endLine: 1,
    });

    expect(doc.nodes[1]!.span).toEqual({
      startOffset: line1.length + 1,
      endOffset: text.length,
      startLine: 2,
      endLine: 2,
    });
  });

  it('15. parses control-flow blocks (try / catch / finally)', () => {
    const text = [
      'try {',
      '  Клик .btn-risky',
      '}',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.kind).toBe('control_block');
    expect(doc.nodes[0]!.controlHeader).toBe('try');
    expect(doc.nodes[0]!.span.startLine).toBe(1);
    expect(doc.nodes[0]!.span.endLine).toBe(3);
  });

  it('15b. parses catch and finally blocks', () => {
    const text = [
      'catch {',
      '  Клик .recover-btn',
      '}',
    ].join('\n');

    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.kind).toBe('control_block');
    expect(doc.nodes[0]!.controlHeader).toBe('catch');
  });

  it('16. combines multiple modifiers (-> $var + ># hint + >?)', () => {
    const text = 'Текст .order-id ># НомерЗаказа -> $orderId >?';
    const doc = parseWireDocument(text);
    const node = doc.nodes[0]!;

    expect(node.stepModel?.action).toBe('Check');
    expect(node.annotation?.hint).toBe('НомерЗаказа');
    expect(node.annotation?.saveAs).toBe('$orderId');
    expect(node.annotation?.soft).toBe(true);
  });

  it('17. parses complete GWT-1 acceptance scenario cleanly into 4 steps', () => {
    const scenarioText = [
      '@ Title: Оплата заказа',
      'Открыть /checkout',
      'Вставить #card "4111222233334444"',
      'Нажать css .pay-btn >@ {',
      '  Нажать css .confirm-modal-btn',
      '  Ждать 500',
      '}',
      'Клик .promo-banner-close >?',
    ].join('\n');

    const doc = parseWireDocument(scenarioText);
    expect(doc.meta.title).toBe('Оплата заказа');

    const decks = documentToScenarioDecks(doc);
    expect(decks).toHaveLength(1);
    const deck = decks[0]!;

    expect(deck.title).toBe('Оплата заказа');
    expect(deck.steps).toHaveLength(4);

    expect(deck.steps[0]!.action).toBe('Open');
    expect(deck.steps[0]!.payload).toBe('/checkout');

    expect(deck.steps[1]!.action).toBe('Type');
    expect(deck.steps[1]!.strategy).toBe('test_id');
    expect(deck.steps[1]!.strategyValue).toBe('card');
    expect(deck.steps[1]!.payload).toBe('4111222233334444');

    expect(deck.steps[2]!.action).toBe('Click');
    expect(deck.steps[2]!.strategy).toBe('css');
    expect(deck.steps[2]!.strategyValue).toBe('.pay-btn');

    expect(deck.steps[3]!.action).toBe('Click');
    expect(deck.steps[3]!.strategy).toBe('css');
    expect(deck.steps[3]!.strategyValue).toBe('.promo-banner-close');
    expect(deck.steps[3]!.continueOnError).toBe(true);
  });

  it('18. generates stable and deterministic node IDs', () => {
    const text = 'Клик .btn\nВставить #input "text"';
    const doc1 = parseWireDocument(text);
    const doc2 = parseWireDocument(text);

    expect(doc1.nodes[0]!.id).toBe(doc2.nodes[0]!.id);
    expect(doc1.nodes[1]!.id).toBe(doc2.nodes[1]!.id);
  });

  it('19. fastContentHash returns consistent 8-char hex string', () => {
    const h1 = fastContentHash('hello world');
    const h2 = fastContentHash('hello world');
    const h3 = fastContentHash('hello world 2');

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(8);
  });

  it('20. preserves opaque lines without crashing parser', () => {
    const text = 'SOME_COMPLEX_UNRECOGNIZED_COMMAND arg1 arg2';
    const doc = parseWireDocument(text);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.kind).toBe('opaque');
    expect(doc.nodes[0]!.raw).toBe(text);
  });
});
