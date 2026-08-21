// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellAmbientVideo } from './ShellAmbientVideo';

afterEach(() => {
  cleanup();
});

describe('ShellAmbientVideo media', () => {
  it('uses poster + webm then mp4 sources, preload none', () => {
    HTMLMediaElement.prototype.load = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    const { container } = render(<ShellAmbientVideo />);
    const video = container.querySelector('video.pk-shell-bg-video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('poster')).toMatch(/media\/login-bg-poster\.webp$/);
    expect(video?.getAttribute('preload')).toBe('none');

    const sources = Array.from(container.querySelectorAll('video source')).map((el) => ({
      src: el.getAttribute('src') ?? '',
      type: el.getAttribute('type') ?? '',
    }));
    expect(sources).toHaveLength(2);
    expect(sources[0]?.src).toMatch(/media\/login-bg\.webm$/);
    expect(sources[0]?.type).toBe('video/webm');
    expect(sources[1]?.src).toMatch(/media\/login-bg\.mp4$/);
    expect(sources[1]?.type).toBe('video/mp4');
  });
});
