/**
 * How far the loaded map is turned, clockwise, in quarter-turns. This is the scene's own
 * orientation (`GridState.mapOrientation`), drawn by both the GM and the players. It is not the
 * scan correction on `MapStretch` (a few degrees) and not the device-local player-view rotation.
 */

import { movedWithMap, type MapMove, type MapStretch } from './mapStretch';

type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';

interface OrientedGrid {
  offsetX: number;
  offsetY: number;
  type?: GridType;
  mapOrientation?: MapOrientation;
}

export const MAP_ORIENTATIONS = [0, 90, 180, 270] as const;
export type MapOrientation = (typeof MAP_ORIENTATIONS)[number];

/** A stored orientation as it is drawn. Anything else, and an unset field, is level. */
export function readMapOrientation(value: unknown): MapOrientation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

/**
 * The stretch the image is drawn with: the alignment's own turn, then this orientation clockwise
 * on screen. The alignment's stored stretch is left alone; a quarter-turn is far past the few
 * degrees a scan correction may hold.
 */
export function drawnMapStretch(stretch: MapStretch, orientation: MapOrientation): MapStretch {
  if (orientation === 0) return stretch;
  const rotation = (stretch.rotation ?? 0) - orientation;
  return rotation === 0 ? { x: stretch.x, y: stretch.y } : { ...stretch, rotation };
}

/** How far `to` is past `from`, clockwise, as one of the four orientations. */
export function orientationDelta(from: MapOrientation, to: MapOrientation): MapOrientation {
  return ((to - from + 360) % 360) as MapOrientation;
}

/**
 * The grid once the map is shown at `orientation`. Offsets follow the image (`move`). A hex grid
 * turned on its side swaps pointy-top and flat-top; its flat-to-flat size stays.
 */
export function turnedGrid<T extends OrientedGrid>(grid: T, orientation: MapOrientation, move: MapMove): T {
  const origin = move({ x: grid.offsetX, y: grid.offsetY });
  const turned: T = { ...grid, offsetX: origin.x, offsetY: origin.y, type: turnedHexType(grid.type, orientationDelta(readMapOrientation(grid.mapOrientation), orientation)) };
  if (orientation === 0) delete turned.mapOrientation;
  else turned.mapOrientation = orientation;
  return turned;
}

/** Where the world moves when the shown image turns from `from` to `to`, stretch included. */
export function mapTurnMove(size: { width: number; height: number }, stretch: MapStretch, from: MapOrientation, to: MapOrientation): MapMove {
  return movedWithMap(size, drawnMapStretch(stretch, from), drawnMapStretch(stretch, to));
}

function turnedHexType(type: GridType | undefined, delta: MapOrientation): GridType | undefined {
  if (delta !== 90 && delta !== 270) return type;
  if (type === 'hex-horizontal') return 'hex-vertical';
  if (type === 'hex-vertical') return 'hex-horizontal';
  return type;
}
