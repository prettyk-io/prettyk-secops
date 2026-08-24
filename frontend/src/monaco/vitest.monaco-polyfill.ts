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
