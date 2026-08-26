/**
 * Monaco в jsdom: clipboard + theme service.
 */
const doc = globalThis.document as Document | undefined;
if (doc) {
  const proto = Document.prototype as Document & {
    queryCommandSupported?: (cmd: string) => boolean;
  };
  if (typeof proto.queryCommandSupported !== 'function') {
    Object.defineProperty(proto, 'queryCommandSupported', {
      value: () => false,
      configurable: true,
    });
  }
}

const win = globalThis as typeof globalThis & {
  matchMedia?: (query: string) => MediaQueryList;
  ResizeObserver?: typeof ResizeObserver;
};
if (typeof win.matchMedia !== 'function') {
  win.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {
        /* legacy */
      },
      removeListener() {
        /* legacy */
      },
      addEventListener() {
        /* noop */
      },
      removeEventListener() {
        /* noop */
      },
      dispatchEvent() {
        return false;
      },
    }) as MediaQueryList;
}

// Monaco needs ResizeObserver in jsdom
if (typeof win.ResizeObserver !== 'function') {
  win.ResizeObserver = class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
  } as unknown as typeof ResizeObserver;
}

// Monaco needs Canvas context for rendering in jsdom.
// jsdom provides the property but throws on call; we override with a stub.
try {
  if (typeof HTMLCanvasElement !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const orig = HTMLCanvasElement.prototype.getContext;
    if (orig) {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        try { return orig.apply(this, arguments as unknown as Parameters<typeof orig>); } catch { return null; }
      } as typeof HTMLCanvasElement.prototype.getContext;
    }
  }
} catch { /* HTMLCanvasElement may not exist */ }
