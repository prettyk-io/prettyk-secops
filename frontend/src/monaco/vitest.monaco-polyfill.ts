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
type Canvas2dStub = CanvasRenderingContext2D & { canvas: HTMLCanvasElement };

/**
 * Минимальный 2D-контекст для jsdom: без пакета `canvas` `getContext('2d')`
 * возвращает null, и @antv/g-canvas падает на `context.setLineDash is not a function`.
 * Рисуем «в никуда»: все методы — no-op, метрики текста — нулевые.
 */
function createCanvas2dStub(canvas: HTMLCanvasElement): Canvas2dStub {
  const noop = (): void => undefined;
  const gradient = { addColorStop: noop } as unknown as CanvasGradient;
  const metrics = {
    width: 0,
    actualBoundingBoxAscent: 0,
    actualBoundingBoxDescent: 0,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: 0,
    fontBoundingBoxAscent: 0,
    fontBoundingBoxDescent: 0,
  } as unknown as TextMetrics;
  const stub: Record<string, unknown> = {
    canvas,
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    strokeText: noop,
    drawImage: noop,
    putImageData: noop,
    setLineDash: noop,
    getLineDash: () => [] as number[],
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    measureText: () => metrics,
    createImageData: () => ({ data: [], width: 0, height: 0 }),
    getImageData: () => ({ data: [], width: 0, height: 0 }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  return stub as unknown as Canvas2dStub;
}

const canvas2dStubs = new WeakMap<HTMLCanvasElement, Canvas2dStub>();

try {
  if (typeof HTMLCanvasElement !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const orig = HTMLCanvasElement.prototype.getContext;
    if (orig) {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        let context: unknown = null;
        try {
          context = orig.apply(this, arguments as unknown as Parameters<typeof orig>);
        } catch {
          context = null;
        }
        if (!context && arguments[0] === '2d') {
          let stub = canvas2dStubs.get(this);
          if (!stub) {
            stub = createCanvas2dStub(this);
            canvas2dStubs.set(this, stub);
          }
          context = stub;
        }
        return context;
      } as typeof HTMLCanvasElement.prototype.getContext;
    }
  }
} catch { /* HTMLCanvasElement may not exist */ }
