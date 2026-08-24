/** Mathematical perimeter & edge path generators for Studio Graph.
 * GUARANTEE: Every single coordinate lies STRICTLY on the canvas perimeter (y=0, x=cw, y=ch, x=0).
 * Diagonal or interior lines are mathematically impossible.
 */

export type Edge = 'top' | 'right' | 'bottom' | 'left';
export type Corner = 'TL' | 'TR' | 'BR' | 'BL';

export const CORNER_IDS: Corner[] = ['TL', 'TR', 'BR', 'BL'];
export const EDGE_IDS: Edge[] = ['top', 'right', 'bottom', 'left'];

/** Returns corner coordinate in canvas pixels (0..cw, 0..ch). */
export function cornerPoint(c: Corner, cw: number, ch: number): { x: number; y: number } {
  if (c === 'TL') return { x: 0, y: 0 };
  if (c === 'TR') return { x: cw, y: 0 };
  if (c === 'BR') return { x: cw, y: ch };
  return { x: 0, y: ch };
}

/** Point on a continuous clockwise perimeter [0..4).
 * 0..1 = Top (TL -> TR)
 * 1..2 = Right (TR -> BR)
 * 2..3 = Bottom (BR -> BL)
 * 3..4 = Left (BL -> TL)
 */
export function pointOnPerimeter(t: number, cw: number, ch: number): { x: number; y: number } {
  let norm = t % 4;
  if (norm < 0) norm += 4;

  if (norm < 1) {
    // Top edge: (0,0) -> (cw,0)
    return { x: norm * cw, y: 0 };
  } else if (norm < 2) {
    // Right edge: (cw,0) -> (cw,ch)
    return { x: cw, y: (norm - 1) * ch };
  } else if (norm < 3) {
    // Bottom edge: (cw,ch) -> (0,ch)
    return { x: (1 - (norm - 2)) * cw, y: ch };
  } else {
    // Left edge: (0,ch) -> (0,0)
    return { x: 0, y: (1 - (norm - 3)) * ch };
  }
}

/** Returns the perimeter base offset for a corner: TL=0, TR=1, BR=2, BL=3 */
export function cornerPerimeterOffset(c: Corner): number {
  if (c === 'TL') return 0;
  if (c === 'TR') return 1;
  if (c === 'BR') return 2;
  return 3;
}

/** Point strictly on an individual edge t in [0..1] */
export function pointOnEdge(edge: Edge, t: number, cw: number, ch: number, reverse = false): { x: number; y: number } {
  const norm = Math.min(1, Math.max(0, reverse ? 1 - t : t));
  if (edge === 'top') return { x: norm * cw, y: 0 };
  if (edge === 'right') return { x: cw, y: norm * ch };
  if (edge === 'bottom') return { x: (1 - norm) * cw, y: ch };
  return { x: 0, y: (1 - norm) * ch }; // left
}

/** Two adjacent edges departing from a corner (clockwise & counter-clockwise) */
export function cornerDepartingEdges(c: Corner): Array<{ edge: Edge; reverse: boolean; targetCorner: Corner }> {
  if (c === 'TL') {
    return [
      { edge: 'top', reverse: false, targetCorner: 'TR' },
      { edge: 'left', reverse: true, targetCorner: 'BL' },
    ];
  }
  if (c === 'TR') {
    return [
      { edge: 'right', reverse: false, targetCorner: 'BR' },
      { edge: 'top', reverse: true, targetCorner: 'TL' },
    ];
  }
  if (c === 'BR') {
    return [
      { edge: 'bottom', reverse: false, targetCorner: 'BL' },
      { edge: 'right', reverse: true, targetCorner: 'TR' },
    ];
  }
  // BL
  return [
    { edge: 'left', reverse: false, targetCorner: 'TL' },
    { edge: 'bottom', reverse: true, targetCorner: 'BR' },
  ];
}
