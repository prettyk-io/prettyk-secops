/**
 * HDO-F1 / VP-F1 · BBA-2: Вычисление координат клика во viewport.
 *
 * Координаты ``page.mouse`` живут в CSS-пикселях вьюпорта (deviceWidth ×
 * deviceHeight), поэтому на выходе всегда CSS-pixel точка. Letterboxing
 * (object-contain с панками слева/сверху) учитывается через
 * ``computeFittedContentRect``: клик вне содержимого → null, внутри —
 * масштаб от содержимого, а не от внешнего rect.
 */

export interface ViewportPoint {
  x: number;
  y: number;
}

/** Прямоугольник отрисованного контента внутри контейнера (после letterbox). */
export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * object-contain: вписать контент (contentW×contentH) в контейнер
 * (containerW×containerH) с сохранением пропорции, по центру.
 *
 * Возвращает null при нулевых размерах. Если пропорции совпадают —
 * содержимое занимает весь контейнер (left=top=0), то есть letterbox нет.
 */
export function computeFittedContentRect(
  containerW: number,
  containerH: number,
  contentW: number,
  contentH: number,
): ContentRect | null {
  if (!containerW || !containerH || !contentW || !contentH) return null;
  const scale = Math.min(containerW / contentW, containerH / contentH);
  const width = contentW * scale;
  const height = contentH * scale;
  const left = (containerW - width) / 2;
  const top = (containerH - height) / 2;
  return { left, top, width, height };
}

/**
 * VP-F1 / BBA-2: canvas клик → viewport CSS-pixel точка.
 *
 * ``frameWidth``/``frameHeight`` — логические размеры вьюпорта браузера в
 * CSS-пикселях (совпадают с ``deviceWidth``/``deviceHeight`` из CDP screencast).
 * ``deviceScaleFactor`` — информационный DPR; на mouse-координаты не влияет,
 * т.к. они уже в CSS-пикселях, но принимается для будущих device-pixel кадров.
 */
export function computeCanvasClickToViewport(
  canvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  clickX: number,
  clickY: number,
  _deviceScaleFactor: number = 1,
): ViewportPoint | null {
  const rect = canvas.getBoundingClientRect();
  const canvasW = rect.width;
  const canvasH = rect.height;
  if (!canvasW || !canvasH || !frameWidth || !frameHeight) return null;

  const localX = clickX - rect.left;
  const localY = clickY - rect.top;
  if (localX < 0 || localX > canvasW || localY < 0 || localY > canvasH) return null;

  // Letterbox-aware: если canvas вписан с сохранением пропорции, масштабируем
  // от фактического содержимого. При отсутствии letterbox fitted занимает
  // весь rect → вырождается в прежнюю линейную формулу.
  const fitted = computeFittedContentRect(canvasW, canvasH, frameWidth, frameHeight);
  if (fitted) {
    const fx = localX - fitted.left;
    const fy = localY - fitted.top;
    if (fx < 0 || fx > fitted.width || fy < 0 || fy > fitted.height) return null;
    const scaleX = frameWidth / fitted.width;
    const scaleY = frameHeight / fitted.height;
    return {
      x: Math.round(fx * scaleX),
      y: Math.round(fy * scaleY),
    };
  }

  // Fallback (не должен достигаться): линейный масштаб по полному rect.
  const scaleX = frameWidth / canvasW;
  const scaleY = frameHeight / canvasH;
  return {
    x: Math.round(localX * scaleX),
    y: Math.round(localY * scaleY),
  };
}