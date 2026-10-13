/**
 * Operation-based fog of war data model.
 *
 * Each user action (brush stroke, lasso fill, rectangle) is stored as an
 * individual record in `state.objects.fog`. Their ordered paint/erase geometry
 * forms shared coverage, drawn by `FogCanvasCompositor` onto a half-resolution
 * HTML Canvas 2D and displayed as a PIXI Sprite.
 */

// ── Base ────────────────────────────────────────────────────────────────

export interface FogOperationBase {
  id: string;
  kind: 'fog';
  timestamp: number;
  /** `true` ⇢ erase (destination-out), `false` ⇢ paint (source-over) */
  isErasing: boolean;
  /** Drag offset from original position (default 0) */
  offsetX?: number;
  offsetY?: number;
}

// ── Concrete operation types ────────────────────────────────────────────

export interface FogBrushStroke extends FogOperationBase {
  type: 'brush';
  points: Array<{ x: number; y: number }>;
  brushRadius: number;
}

export interface FogLassoFill extends FogOperationBase {
  type: 'lasso';
  points: Array<{ x: number; y: number }>;
}

export interface FogRectangleFill extends FogOperationBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Discriminated union of all fog operation types */
export type FogOperation = FogBrushStroke | FogLassoFill | FogRectangleFill;

/** Distributive Omit that preserves the discriminated union */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Input type for creating a fog operation (without auto-generated fields) */
export type FogOperationInput = DistributiveOmit<FogOperation, 'id' | 'kind' | 'timestamp'>;

/**
 * One paint rectangle over the map image, so a scene can start fully hidden.
 * None when there is no image to cover.
 */
export function fogCoveringMap(
  map: { x: number; y: number; width: number; height: number } | null,
): FogOperationInput | null {
  if (!map || !(map.width > 0) || !(map.height > 0)) return null;
  return {
    type: 'rectangle',
    x: map.x,
    y: map.y,
    width: map.width,
    height: map.height,
    isErasing: false,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────

export interface FogBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
