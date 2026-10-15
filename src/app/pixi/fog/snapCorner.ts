import type { Point } from '../../types/visionTypes';

/** The grid fields a corner snap reads. No size leaves the point where it is. */
export interface SnapGrid {
  size?: number;
  offsetX?: number;
  offsetY?: number;
}

/** The grid corner nearest `point`. */
export function snapCorner(point: Point, grid: SnapGrid | null | undefined): Point {
  if (!grid?.size) return { x: point.x, y: point.y };
  const { size, offsetX = 0, offsetY = 0 } = grid;
  return {
    x: Math.round((point.x - offsetX) / size) * size + offsetX,
    y: Math.round((point.y - offsetY) / size) * size + offsetY,
  };
}
