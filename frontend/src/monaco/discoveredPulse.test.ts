import { describe, it, expect, vi, afterEach } from 'vitest';
import { flashDiscoveredLine, DISCOVERED_PULSE_MS } from './discoveredPulse';

function fakeEditor(lineCount: number) {
  const ed = {
    getModel: () => ({ getLineCount: () => lineCount }),
    deltaDecorations: vi.fn((_old: unknown[], decos: unknown[]) =>
      decos.map((_, i) => `deco-${i}`),
    ),
    revealLineInCenter: vi.fn(),
  };
  return ed;
}

describe('flashDiscoveredLine (POC-CDP-4 «✨ Discovered»)', () => {
  afterEach(() => vi.useRealTimers());

  it('ставит неоновую line + glyph декорацию на строку и снимает через пульс', () => {
    vi.useFakeTimers();
    const ed = fakeEditor(5) as any;
    flashDiscoveredLine(ed, 3);

    expect(ed.deltaDecorations).toHaveBeenCalledTimes(1);
    const [oldDecos, newDecos] = ed.deltaDecorations.mock.calls[0];
    expect(oldDecos).toEqual([]);
    expect(newDecos).toHaveLength(1);
    expect(newDecos[0].range.startLineNumber).toBe(3);
    expect(newDecos[0].range.endLineNumber).toBe(3);
    expect(newDecos[0].options.isWholeLine).toBe(true);
    expect(newDecos[0].options.className).toBe('pk-discovered-line');
    expect(newDecos[0].options.glyphMarginClassName).toBe('pk-discovered-gutter');
    expect(ed.revealLineInCenter).toHaveBeenCalledWith(3);

    vi.advanceTimersByTime(DISCOVERED_PULSE_MS);
    expect(ed.deltaDecorations).toHaveBeenCalledTimes(2);
    // second call очищает декорацию
    expect(ed.deltaDecorations.mock.calls[1][1]).toEqual([]);
  });

  it('не трогает строку вне границ модели', () => {
    const ed = fakeEditor(3) as any;
    flashDiscoveredLine(ed, 99);
    flashDiscoveredLine(ed, 0);
    expect(ed.deltaDecorations).not.toHaveBeenCalled();
  });
});
