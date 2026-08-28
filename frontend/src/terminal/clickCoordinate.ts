/**
 * HDO-F1 / VP-F1: Вычисление координат клика во viewport.
 *
 * Два пути:
 * - canvas (VP-F1): масштабирование canvas→viewport по frame-размерам
 * - img (legacy): letterboxing object-contain убран
 */
export interface ViewportPoint {
  x: number;
  y: number;
}

/** VP-F1: canvas клик → viewport. scaleX = frameWidth / canvas.clientWidth */
export function computeCanvasClickToViewport(
  canvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  clickX: number,
  clickY: number,
): ViewportPoint | null {
  const rect = canvas.getBoundingClientRect();
  const canvasW = rect.width;
  const canvasH = rect.height;
  if (!canvasW || !canvasH || !frameWidth || !frameHeight) return null;

  const localX = clickX - rect.left;
  const localY = clickY - rect.top;
  if (localX < 0 || localX > canvasW || localY < 0 || localY > canvasH) return null;

  const scaleX = frameWidth / canvasW;
  const scaleY = frameHeight / canvasH;
  return {
    x: Math.round(localX * scaleX),
    y: Math.round(localY * scaleY),
  };
}