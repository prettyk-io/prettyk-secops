// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocatorHealStrip } from './LocatorHealStrip';
import { LocatorLabelStrip } from './LocatorLabelStrip';

describe('Locator strips', () => {
  it('HEAL: idle meta silent; keyed empty; miss / ok', () => {
    const { container, rerender } = render(
      <LocatorHealStrip meta={{ status: 'waiting' }} />,
    );
    expect(container.childElementCount).toBe(0);

    rerender(<LocatorHealStrip meta={{ locator_heal_last: null }} />);
    expect(screen.getByTestId('results-locator-heal-empty').textContent).toContain(
      'нет предложения',
    );

    rerender(
      <LocatorHealStrip
        meta={{
          locator_heal_last: {
            status: 'miss',
            old_type: 'id',
            old_value: 'x',
            reason: 'no pick',
          },
        }}
      />,
    );
    expect(screen.getByTestId('results-locator-heal').textContent).toContain('MISS');

    rerender(
      <LocatorHealStrip
        meta={{
          locator_heal_last: {
            status: 'ok',
            old_type: 'id',
            old_value: 'a',
            new_type: 'css',
            new_value: 'b',
          },
        }}
      />,
    );
    expect(screen.getByTestId('results-locator-heal').textContent).toContain(
      'Копировать',
    );
    expect(screen.getByTestId('results-locator-heal').textContent).toContain(
      'в Studio — принять в конструктор',
    );
  });

  it('LABEL: idle silent; keyed empty; miss', () => {
    const { container, rerender } = render(
      <LocatorLabelStrip meta={{ status: 'waiting' }} />,
    );
    expect(container.childElementCount).toBe(0);

    rerender(<LocatorLabelStrip meta={{ locator_label_last: null }} />);
    expect(screen.getByTestId('results-locator-label-empty').textContent).toContain(
      'LABEL',
    );

    rerender(
      <LocatorLabelStrip
        meta={{
          locator_label_last: {
            status: 'miss',
            label: 'Войти',
            reason: 'no matches',
          },
        }}
      />,
    );
    expect(screen.getByTestId('results-locator-label').textContent).toContain('MISS');
  });

  it('null meta → nothing', () => {
    const { container } = render(<LocatorHealStrip meta={null} />);
    expect(container.childElementCount).toBe(0);
  });
});
