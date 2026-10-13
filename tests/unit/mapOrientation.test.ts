import { describe, expect, it } from 'vitest';
import { imageToWorld, worldToImage, type MapStretch } from '../../src/app/grid/mapStretch';
import { objectsMovedWithMap } from '../../src/app/grid/mapStretchObjects';
import {
  drawnMapStretch,
  mapTurnMove,
  readMapOrientation,
  turnedGrid,
} from '../../src/app/grid/mapOrientation';
import { turnExploredMask } from '../../src/app/lighting/turnExploredMask';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';
import type { GridState } from '../../src/app/types/gridTypes';
import type { ViewState } from '../../src/app/types/viewState';

const SIZE = { width: 100, height: 200 };
const LEVEL: MapStretch = { x: 1, y: 1 };

function grid(over: Partial<GridState> = {}): GridState {
  return { enabled: true, size: 70, offsetX: 10, offsetY: 20, opacity: 1, type: 'square', ...over };
}

function rectangle(width: number, height: number): FogRectangleFill {
  return { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 0, y: 0, width, height };
}

describe('map orientation', () => {
  it('reads only quarter-turns', () => {
    expect(readMapOrientation(undefined)).toBe(0);
    expect(readMapOrientation(45)).toBe(0);
    expect(readMapOrientation(90)).toBe(90);
  });

  it('keeps a point on the same image pixel and swaps the world sides at 90°', () => {
    const point = { x: 30, y: 40 };
    const move = mapTurnMove(SIZE, LEVEL, 0, 90);
    const moved = move(point);
    const back = worldToImage(moved, SIZE, drawnMapStretch(LEVEL, 90));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
    const corner = imageToWorld({ x: SIZE.width, y: SIZE.height }, SIZE, drawnMapStretch(LEVEL, 90));
    expect(corner.x).toBeCloseTo(0);
    expect(corner.y).toBeCloseTo(SIZE.width);
    const box = imageToWorld({ x: 0, y: 0 }, SIZE, drawnMapStretch(LEVEL, 90));
    expect(box.x).toBeCloseTo(SIZE.height);
    expect(box.y).toBeCloseTo(0);
  });

  it('turns the grid offset, swaps a hex grid on its side, and clears a return to level', () => {
    const move = mapTurnMove(SIZE, LEVEL, 0, 90);
    const turned = turnedGrid(grid({ type: 'hex-horizontal', mapStretch: { x: 1.1, y: 1 } }), 90, move);
    expect(turned.type).toBe('hex-vertical');
    expect(turned.mapOrientation).toBe(90);
    expect(turned.mapStretch).toEqual({ x: 1.1, y: 1 });
    expect(turned.offsetX).toBeCloseTo(move({ x: 10, y: 20 }).x);
    const level = turnedGrid(turned, 0, mapTurnMove(SIZE, LEVEL, 90, 0));
    expect(level.mapOrientation).toBeUndefined();
    expect(level.type).toBe('hex-horizontal');
    expect(level.offsetX).toBeCloseTo(10);
    expect(level.offsetY).toBeCloseTo(20);
  });

  it('keeps a hex grid’s type through a half turn', () => {
    const turned = turnedGrid(grid({ type: 'hex-vertical' }), 180, mapTurnMove(SIZE, LEVEL, 0, 180));
    expect(turned.type).toBe('hex-vertical');
    expect(turned.mapOrientation).toBe(180);
  });

  it('swaps a rectangle of fog onto the turned image', () => {
    const fog = rectangle(40, 80);
    const objects: ViewState['objects'] = {
      tokens: {},
      fog: { fog },
      pins: {},
      texts: {},
      drawings: {},
      walls: {},
      lights: {},
      audios: {},
    };
    const moved = objectsMovedWithMap(objects, mapTurnMove(SIZE, LEVEL, 0, 90));
    const next = moved.fog.fog;
    expect(next?.type).toBe('rectangle');
    if (next?.type !== 'rectangle') return;
    expect(next.width).toBeCloseTo(80);
    expect(next.height).toBeCloseTo(40);
    const centre = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
    const back = worldToImage(centre, SIZE, drawnMapStretch(LEVEL, 90));
    expect(back.x).toBeCloseTo(20);
    expect(back.y).toBeCloseTo(40);
  });

  it('drops an explored mask that has not decoded', () => {
    expect(turnExploredMask('data:image/png;base64,xx', 90)).toBeNull();
    expect(turnExploredMask(null, 90)).toBeNull();
  });
});
