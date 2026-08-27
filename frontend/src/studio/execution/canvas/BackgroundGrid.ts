/**
 * RTS-style dot grid background.
 */
import type { ThemeColors } from './colors';

export function drawBackgroundGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: ThemeColors,
  camX: number,
  camY: number,
  zoom: number,
  scale: number,
) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const gridSpacing = 40 * scale * zoom;
  if (gridSpacing < 6) return; // too dense, skip

  const dotR = Math.max(1, 1.5 * scale / zoom);
  const offsetX = -camX * scale + w / 2;
  const offsetY = -camY * scale + h / 2;

  const startX = Math.floor((-offsetX) / gridSpacing) * gridSpacing + offsetX;
  const startY = Math.floor((-offsetY) / gridSpacing) * gridSpacing + offsetY;

  ctx.fillStyle = colors.gridDot;
  for (let x = startX; x < w + gridSpacing; x += gridSpacing) {
    for (let y = startY; y < h + gridSpacing; y += gridSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}