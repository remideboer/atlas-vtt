import type { Point } from '../types/visionTypes';

/** Corners a fog polygon may have before it auto-closes. */
export const MAX_FOG_POLYGON_CORNERS = 64;

/** Screen pixels: click within this of the first corner closes the draft. */
const CLOSE_SNAP_PX = 10;

/** Whether corners enclose an area (three on one line enclose none). */
export function fogPolygonHasArea(polygon: readonly Point[]): boolean {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) > 1e-6;
}

/**
 * Click-to-place corners for a fog fill. Closing yields the vertex list used as a
 * `lasso` fog operation; there is no press–drag–release stroke.
 */
export class FogPolygonDraft {
  private corners: Point[] = [];
  private cursor: Point | null = null;

  get active(): boolean {
    return this.corners.length > 0;
  }

  /** Placed corners so far (open outline). */
  get points(): readonly Point[] {
    return this.corners;
  }

  /** Live rubber-band end while drawing, or null. */
  get cursorPoint(): Point | null {
    return this.cursor;
  }

  /** Preview polyline: corners plus the cursor when it has moved. */
  outline(): readonly Point[] {
    if (this.corners.length === 0) return [];
    if (!this.cursor) return this.corners;
    const last = this.corners[this.corners.length - 1]!;
    if (last.x === this.cursor.x && last.y === this.cursor.y) return this.corners;
    return [...this.corners, this.cursor];
  }

  /** Whether a click at `point` lands on the first corner and may close. */
  closesOn(point: Point, zoom: number): boolean {
    const first = this.corners[0];
    return this.corners.length >= 3 && !!first
      && Math.hypot(point.x - first.x, point.y - first.y) <= CLOSE_SNAP_PX / zoom;
  }

  place(point: Point): void {
    const last = this.corners[this.corners.length - 1];
    if (last && last.x === point.x && last.y === point.y) {
      this.cursor = point;
      return;
    }
    this.corners = [...this.corners, { ...point }];
    this.cursor = point;
  }

  moveCursor(point: Point): void {
    if (!this.active) return;
    this.cursor = { ...point };
  }

  /**
   * The closed polygon when it is an area, else null (drawing continues).
   * Clears the draft only when a polygon is returned.
   */
  finish(): Point[] | null {
    const polygon = this.corners.filter(
      (point, i) => i === 0 || point.x !== this.corners[i - 1]!.x || point.y !== this.corners[i - 1]!.y,
    );
    if (polygon.length < 3 || !fogPolygonHasArea(polygon)) return null;
    this.cancel();
    return polygon;
  }

  /** Drops the draft. */
  cancel(): void {
    this.corners = [];
    this.cursor = null;
  }

  /** True once more corners would exceed the cap. */
  atCornerCap(): boolean {
    return this.corners.length >= MAX_FOG_POLYGON_CORNERS;
  }
}
