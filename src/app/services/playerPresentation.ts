import type { PlayerCameraState } from '../types/playerCamera';
import type { PlayerFrame, Screen, Size, WorldView } from '../types/playerFrame';
import { playerFrame, viewOf } from './playerFrame';

/** Clockwise quarter-turns of the player map, in degrees. */
export const PLAYER_ROTATIONS = [0, 90, 180, 270] as const;
export type PlayerRotation = (typeof PLAYER_ROTATIONS)[number];

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Share of the visible world extent one arrow-key step moves. */
export const PLAYER_PAN_STEP = 0.1;

export interface ZoomLock {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ZoomLockSession {
  zoomLocked: boolean;
  pinnedScale: number | null;
  panX: number;
  panY: number;
}

/** A stored angle, or 0° when the value is not one of the four quarter-turns. */
export function readPlayerRotation(value: unknown): PlayerRotation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

export function rotationRadians(rotation: PlayerRotation): number {
  return (rotation * Math.PI) / 180;
}

/**
 * The world rectangle `playerFrame` should fit so a clockwise `rotation` still shows all of
 * `view`. At 90° and 270° the window's axes swap, so the view's sides swap before the fit.
 * The centre stays the same.
 */
export function viewFittedForRotation(view: WorldView, rotation: PlayerRotation): WorldView {
  if (rotation === 0 || rotation === 180) return view;
  return { centerX: view.centerX, centerY: view.centerY, width: view.height, height: view.width };
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isFinite(1 / value);
}

/**
 * The world rectangle a window shows at a pinned scale: `scale` CSS pixels of the window per
 * world pixel, centred on (`centerX`, `centerY`). Rotation is applied by the camera, not by
 * resizing this rectangle, so the mini size stays the pinned scale.
 */
export function zoomLockedView(window: Size, centerX: number, centerY: number, scale: number): WorldView | null {
  if (!isPositive(window.width) || !isPositive(window.height) || !isPositive(scale)) return null;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
  return { centerX, centerY, width: window.width / scale, height: window.height / scale };
}

/**
 * A screen-space pan, in world pixels along the screen axes, turned into a world offset.
 * `rotation` is how the picture is turned clockwise, so screen-right follows the world axis
 * that currently points that way.
 */
function axis(value: number): number {
  return value === 0 ? 0 : value;
}

export function screenPanToWorld(dx: number, dy: number, rotation: PlayerRotation): { x: number; y: number } {
  switch (rotation) {
    case 0: return { x: axis(dx), y: axis(dy) };
    case 90: return { x: axis(dy), y: axis(-dx) };
    case 180: return { x: axis(-dx), y: axis(-dy) };
    case 270: return { x: axis(-dy), y: axis(dx) };
  }
}

/** One arrow-key step of the player frame. `extent` is the world size visible along each screen axis. */
export function panOffsetForKey(extent: Size, rotation: PlayerRotation, key: ArrowKey): { x: number; y: number } {
  const across = extent.width * PLAYER_PAN_STEP;
  const down = extent.height * PLAYER_PAN_STEP;
  let dx = 0;
  let dy = 0;
  if (key === 'ArrowLeft') dx = -across;
  else if (key === 'ArrowRight') dx = across;
  else if (key === 'ArrowUp') dy = -down;
  else dy = down;
  return screenPanToWorld(dx, dy, rotation);
}

export function isArrowKey(key: string): key is ArrowKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

function withRotation(frame: PlayerFrame, rotation: PlayerRotation): PlayerFrame {
  return rotation === 0 ? frame : { ...frame, rotation };
}

/**
 * The pan offset after the DM camera moves from `previous` to `next`. A zoom moves the DM
 * centre to keep the cursor still; that centre change is taken out of the offset, so the player
 * picture stays where it is. A pan leaves the DM scale alone and the offset stays, so the
 * picture follows.
 */
export function offsetThroughDmZoom(
  offset: { x: number; y: number },
  previous: { centerX: number; centerY: number; scale: number } | null,
  next: { centerX: number; centerY: number; scale: number },
): { x: number; y: number } {
  if (!previous || previous.scale === next.scale) return offset;
  return {
    x: offset.x - (next.centerX - previous.centerX),
    y: offset.y - (next.centerY - previous.centerY),
  };
}

/** What `presentedPlayerFrame` is asked, apart from the pane the picture is copied through. */
export interface PlayerPicture {
  window: Screen;
  camera: PlayerCameraState;
  gmScreen?: Size | undefined;
  rotation: PlayerRotation;
  zoomLock: ZoomLock | null;
  frozen: boolean;
}

/**
 * The world rectangle the player picture is fitted to. A frozen camera keeps its own rectangle.
 * Zoom lock uses the DM centre plus the pan offset at the pinned scale. Otherwise the DM view
 * is fitted, swapped at 90° and 270° so the whole view still shows.
 */
export function playerViewOf(input: PlayerPicture): WorldView | null {
  const { window, camera, gmScreen, rotation, zoomLock, frozen } = input;
  if (frozen || !zoomLock) {
    const view = viewOf(camera, gmScreen);
    return view ? viewFittedForRotation(view, rotation) : null;
  }
  return zoomLockedView(
    window,
    camera.centerX + zoomLock.offsetX,
    camera.centerY + zoomLock.offsetY,
    zoomLock.scale,
  );
}

/**
 * A camera whose frozen rendering is `view` again. The freeze stores the rectangle before the
 * rotation fit, because showing it applies that fit once more.
 */
export function cameraHeldForFreeze(view: WorldView, rotation: PlayerRotation, scale: number): PlayerCameraState {
  const held = viewFittedForRotation(view, rotation);
  return { centerX: held.centerX, centerY: held.centerY, scale, width: held.width, height: held.height };
}

/**
 * The frame players are shown. A frozen camera keeps its rectangle and is fitted, rotation
 * included. Zoom lock uses the DM centre plus the pan offset at `zoomLock.scale`, and ignores
 * the DM zoom. Otherwise the DM view is fitted, swapped at 90° and 270° so the whole view still
 * shows.
 */
export function presentedPlayerFrame(input: PlayerPicture & { pane?: Screen | undefined }): PlayerFrame | null {
  const view = playerViewOf(input);
  if (!view) return null;
  const frame = playerFrame(input.window, view, input.pane);
  return frame ? withRotation(frame, input.rotation) : null;
}

/** Zoom-lock fields of a saved player-window session. Missing or unusable values are off. */
export function readZoomLockSession(state: object): ZoomLockSession {
  const zoomLocked = 'zoomLocked' in state && state.zoomLocked === true;
  const pinnedScale = 'pinnedScale' in state && typeof state.pinnedScale === 'number' && isPositive(state.pinnedScale)
    ? state.pinnedScale
    : null;
  const panX = 'panX' in state && typeof state.panX === 'number' && Number.isFinite(state.panX) ? state.panX : 0;
  const panY = 'panY' in state && typeof state.panY === 'number' && Number.isFinite(state.panY) ? state.panY : 0;
  return { zoomLocked: zoomLocked && pinnedScale !== null, pinnedScale: zoomLocked ? pinnedScale : null, panX, panY };
}
