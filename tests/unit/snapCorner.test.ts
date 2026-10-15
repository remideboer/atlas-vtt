import { expect, it } from 'vitest';
import { snapCorner } from '../../src/app/pixi/fog/snapCorner';

const grid = { size: 70, offsetX: 0, offsetY: 0 };

it('snaps a point to the nearest corner of a 70 px grid', () => {
  expect(snapCorner({ x: 33, y: 33 }, grid)).toEqual({ x: 0, y: 0 });
  expect(snapCorner({ x: 141, y: 121 }, grid)).toEqual({ x: 140, y: 140 });
});

it('leaves the point where it is when the grid has no size', () => {
  expect(snapCorner({ x: 33, y: 33 }, { size: 0 })).toEqual({ x: 33, y: 33 });
  expect(snapCorner({ x: 33, y: 33 }, null)).toEqual({ x: 33, y: 33 });
});

it('honours the grid offset', () => {
  expect(snapCorner({ x: 20, y: 20 }, { size: 70, offsetX: 10, offsetY: 5 })).toEqual({ x: 10, y: 5 });
});
