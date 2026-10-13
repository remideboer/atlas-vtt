import { describe, expect, it } from 'vitest';
import { captureBeforeRender, frameCamera, type CameraTarget } from '../../src/app/pixi/playerSafeFrame';
import {
  cameraHeldForFreeze,
  offsetThroughDmZoom,
  panOffsetForKey,
  playerViewOf,
  presentedPlayerFrame,
  readPlayerRotation,
  readZoomLockSession,
  viewFittedForRotation,
  type PlayerRotation,
} from '../../src/app/services/playerPresentation';
import type { PlayerFrame } from '../../src/app/types/playerFrame';

const WINDOW = { width: 800, height: 600, resolution: 1 };
const VIEW = { centerX: 100, centerY: 40, width: 400, height: 300, scale: 1 };

function frameAt(rotation: PlayerRotation, zoomLock: { scale: number; offsetX: number; offsetY: number } | null = null, frozen = false): PlayerFrame | null {
  return presentedPlayerFrame({
    window: WINDOW,
    camera: VIEW,
    gmScreen: { width: 400, height: 300 },
    rotation,
    zoomLock,
    frozen,
  });
}

describe('player rotation', () => {
  it('defaults anything that is not a quarter-turn to 0°', () => {
    expect(readPlayerRotation(undefined)).toBe(0);
    expect(readPlayerRotation(45)).toBe(0);
    expect(readPlayerRotation('90')).toBe(0);
    expect(readPlayerRotation(180)).toBe(180);
  });

  it('swaps the fitted sides at 90° and 270° and keeps the centre', () => {
    const view = { centerX: 10, centerY: 20, width: 400, height: 200 };
    expect(viewFittedForRotation(view, 0)).toEqual(view);
    expect(viewFittedForRotation(view, 180)).toEqual(view);
    expect(viewFittedForRotation(view, 90)).toEqual({ centerX: 10, centerY: 20, width: 200, height: 400 });
    expect(viewFittedForRotation(view, 270)).toEqual({ centerX: 10, centerY: 20, width: 200, height: 400 });
  });

  it('keeps the same centre and shows the whole view at every angle', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const frame = frameAt(rotation);
      expect(frame?.centerX).toBe(100);
      expect(frame?.centerY).toBe(40);
      expect(frame?.scale).toBeGreaterThan(0);
    }
    expect(frameAt(90)?.scale).toBe(frameAt(270)?.scale);
    expect(frameAt(0)?.scale).toBe(frameAt(180)?.scale);
  });
});

describe('player zoom lock', () => {
  it('keeps the pinned scale when the DM view changes size and follows a pan through the centre', () => {
    const locked = { scale: 2, offsetX: 0, offsetY: 0 };
    const first = frameAt(0, locked);
    const panned = presentedPlayerFrame({
      window: WINDOW,
      camera: { ...VIEW, centerX: 150, centerY: 80, width: 100, height: 50 },
      rotation: 0,
      zoomLock: locked,
      frozen: false,
    });
    expect(first?.scale).toBeCloseTo(2, 5);
    expect(panned?.scale).toBeCloseTo(2, 5);
    expect(panned?.centerX).toBe(150);
    expect(panned?.centerY).toBe(80);
  });

  it('keeps the player centre when the DM zooms and follows when the DM pans', () => {
    const offset = { x: 12, y: -4 };
    const before = { centerX: 100, centerY: 40, scale: 1 };
    const zoomed = { centerX: 160, centerY: 70, scale: 2 };
    const held = offsetThroughDmZoom(offset, before, zoomed);
    expect(zoomed.centerX + held.x).toBe(before.centerX + offset.x);
    expect(zoomed.centerY + held.y).toBe(before.centerY + offset.y);
    const panned = { centerX: 180, centerY: 90, scale: 2 };
    expect(offsetThroughDmZoom(held, zoomed, panned)).toEqual(held);
    const frame = presentedPlayerFrame({
      window: WINDOW,
      camera: { ...VIEW, centerX: zoomed.centerX, centerY: zoomed.centerY, scale: zoomed.scale },
      rotation: 0,
      zoomLock: { scale: 2, offsetX: held.x, offsetY: held.y },
      frozen: false,
    });
    expect(frame?.centerX).toBe(before.centerX + offset.x);
    expect(frame?.centerY).toBe(before.centerY + offset.y);
    expect(frame?.scale).toBeCloseTo(2, 5);
  });

  it('adds the pan offset to the DM centre', () => {
    const frame = frameAt(0, { scale: 2, offsetX: 12, offsetY: -4 });
    expect(frame?.centerX).toBe(112);
    expect(frame?.centerY).toBe(36);
    expect(frame?.scale).toBeCloseTo(2, 5);
  });

  it('keeps a frozen frame when the DM camera and pane have moved', () => {
    const frozenCamera = { centerX: 100, centerY: 40, width: 400, height: 300, scale: 1 };
    const held = presentedPlayerFrame({
      window: WINDOW,
      camera: frozenCamera,
      gmScreen: { width: 800, height: 600 },
      rotation: 0,
      zoomLock: null,
      frozen: true,
    });
    const again = presentedPlayerFrame({
      window: WINDOW,
      camera: frozenCamera,
      gmScreen: { width: 200, height: 100 },
      rotation: 0,
      zoomLock: { scale: 4, offsetX: 80, offsetY: 80 },
      frozen: true,
    });
    expect(again?.centerX).toBe(held?.centerX);
    expect(again?.centerY).toBe(held?.centerY);
    expect(again?.width).toBe(held?.width);
    expect(again?.height).toBe(held?.height);
  });

  it('freezes the picture players are shown, including a locked zoom and a quarter-turn', () => {
    const zoomLock = { scale: 2, offsetX: 12, offsetY: -4 };
    for (const rotation of [0, 90] as const) {
      const picture = { window: WINDOW, camera: VIEW, gmScreen: { width: 400, height: 300 }, rotation, zoomLock, frozen: false };
      const live = presentedPlayerFrame(picture);
      const view = playerViewOf(picture);
      const held = cameraHeldForFreeze(view!, rotation, VIEW.scale);
      const frozen = presentedPlayerFrame({
        window: WINDOW,
        camera: held,
        gmScreen: { width: 200, height: 100 },
        rotation,
        zoomLock: { scale: 9, offsetX: 400, offsetY: 400 },
        frozen: true,
      });
      expect(frozen).toEqual(live);
    }
  });

  it('lets a full freeze win over zoom lock', () => {
    const frozen = frameAt(0, { scale: 2, offsetX: 50, offsetY: 50 }, true);
    const fitted = frameAt(0, null, true);
    expect(frozen?.centerX).toBe(fitted?.centerX);
    expect(frozen?.scale).toBe(fitted?.scale);
  });

  it('steps along the screen and turns that step with the rotation', () => {
    const extent = { width: 100, height: 50 };
    expect(panOffsetForKey(extent, 0, 'ArrowRight')).toEqual({ x: 10, y: 0 });
    expect(panOffsetForKey(extent, 0, 'ArrowDown')).toEqual({ x: 0, y: 5 });
    expect(panOffsetForKey(extent, 90, 'ArrowRight')).toEqual({ x: 0, y: -10 });
    expect(panOffsetForKey(extent, 180, 'ArrowRight')).toEqual({ x: -10, y: 0 });
    expect(panOffsetForKey(extent, 270, 'ArrowUp')).toEqual({ x: 5, y: 0 });
  });

  it('reads a session and drops a lock whose scale is missing', () => {
    expect(readZoomLockSession({ zoomLocked: true, pinnedScale: 1.5, panX: 3, panY: -2 })).toEqual({
      zoomLocked: true,
      pinnedScale: 1.5,
      panX: 3,
      panY: -2,
    });
    expect(readZoomLockSession({ zoomLocked: true }).zoomLocked).toBe(false);
    expect(readZoomLockSession({}).zoomLocked).toBe(false);
  });
});

describe('player camera restore', () => {
  function target(): CameraTarget & { rotation: number; pivot: { x: number; y: number; set(x: number, y: number): void } } {
    return {
      position: { x: 4, y: 5, set(x: number, y: number) { this.x = x; this.y = y; } },
      scale: { x: 1, y: 1, set(x: number, y: number) { this.x = x; this.y = y; } },
      rotation: 0,
      pivot: { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } },
    };
  }

  it('restores position, scale, rotation and pivot when the capture throws', () => {
    const camera = target();
    const frame: PlayerFrame = { width: 100, height: 80, resolution: 1, antialias: false, centerX: 10, centerY: 20, scale: 2, rotation: 90 };
    expect(() => captureBeforeRender([], () => { throw new Error('render failed'); }, () => undefined, frameCamera(camera, frame))).toThrow('render failed');
    expect(camera.position.x).toBe(4);
    expect(camera.position.y).toBe(5);
    expect(camera.scale.x).toBe(1);
    expect(camera.rotation).toBe(0);
    expect(camera.pivot.x).toBe(0);
    expect(camera.pivot.y).toBe(0);
  });
});
