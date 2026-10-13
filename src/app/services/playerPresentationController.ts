import type { App } from 'obsidian';
import { loadPlayerRotation, savePlayerRotation } from './deviceSettings';
import {
  isArrowKey,
  offsetThroughDmZoom,
  panOffsetForKey,
  readZoomLockSession,
  type ArrowKey,
  type PlayerRotation,
  type ZoomLock,
} from './playerPresentation';
import type { Size } from '../types/playerFrame';

/**
 * Player-map rotation and zoom lock. Rotation is device-local. Zoom lock, its scale and the
 * pan offset belong to the player-window session. Neither is written into a scene file.
 * Full camera freeze is not stored here; the window service lets freeze win while it is on.
 */
export class PlayerPresentationController {
  rotation: PlayerRotation;
  private zoomLocked = false;
  private actualSize = false;
  private pinnedScale: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  /** The DM camera the offset was last measured against. A zoom moves it; a pan does not change its scale. */
  private dmCamera: { centerX: number; centerY: number; scale: number } | null = null;

  constructor(
    private readonly storage: Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>,
    private readonly onChange: () => void,
  ) {
    this.rotation = loadPlayerRotation(storage);
  }

  zoomLock(): ZoomLock | null {
    if (!this.zoomLocked || this.pinnedScale === null) return null;
    return { scale: this.pinnedScale, offsetX: this.offsetX, offsetY: this.offsetY };
  }

  /**
   * The player picture's centre is now this DM camera's centre. The pan offset is cleared, and
   * the camera is the one already noted, so the next frame does not add the offset again or
   * treat the snap as a zoom.
   */
  adoptDmCamera(camera: { centerX: number; centerY: number; scale: number }): void {
    if (!Number.isFinite(camera.centerX) || !Number.isFinite(camera.centerY) || !Number.isFinite(camera.scale)) return;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dmCamera = { centerX: camera.centerX, centerY: camera.centerY, scale: camera.scale };
    this.onChange();
  }

  /**
   * Note the live DM camera. While zoom is locked or the picture is at actual size, a change of
   * its scale is a zoom: the player centre stays, and the offset absorbs the centre the zoom
   * moved. A pan (the same scale) is left for the frame to follow.
   */
  noteDmCamera(camera: { centerX: number; centerY: number; scale: number }): void {
    if (!this.holdsPan()) {
      this.dmCamera = null;
      return;
    }
    const next = { centerX: camera.centerX, centerY: camera.centerY, scale: camera.scale };
    if (!Number.isFinite(next.centerX) || !Number.isFinite(next.centerY) || !Number.isFinite(next.scale)) return;
    const offset = offsetThroughDmZoom({ x: this.offsetX, y: this.offsetY }, this.dmCamera, next);
    this.dmCamera = next;
    this.offsetX = offset.x;
    this.offsetY = offset.y;
  }

  isZoomLocked(): boolean {
    return this.zoomLock() !== null;
  }

  isActualSize(): boolean {
    return this.actualSize;
  }

  /** The pan offset shared by zoom lock and actual size. */
  pan(): { x: number; y: number } {
    return { x: this.offsetX, y: this.offsetY };
  }

  /** Actual size or a zoom lock is holding the player centre against a DM zoom. */
  holdsPan(): boolean {
    return this.actualSize || this.isZoomLocked();
  }

  /**
   * Turn actual size on or off. The pan offset stays, so the picture keeps its centre. The
   * scale itself is computed from the screen each frame, not stored here.
   */
  setActualSize(on: boolean): void {
    if (this.actualSize === on) return;
    this.actualSize = on;
    this.dmCamera = null;
    this.onChange();
  }

  /** Selecting the angle already shown does nothing. */
  setRotation(rotation: PlayerRotation): void {
    if (rotation === this.rotation) return;
    this.rotation = rotation;
    savePlayerRotation(this.storage, rotation);
    this.onChange();
  }

  /**
   * Turn zoom lock on at `scale` (the scale players are shown now), or off. Off clears the
   * offset so the frame returns to the DM centre. A scale that is not a zoom leaves the lock off.
   */
  toggleZoomLock(scale: number | null): boolean {
    if (this.isZoomLocked()) {
      this.zoomLocked = false;
      this.pinnedScale = null;
      if (!this.actualSize) {
        this.offsetX = 0;
        this.offsetY = 0;
        this.dmCamera = null;
      }
      this.onChange();
      return false;
    }
    if (scale === null || !Number.isFinite(scale) || scale <= 0) return false;
    this.zoomLocked = true;
    this.pinnedScale = scale;
    if (!this.actualSize) {
      this.offsetX = 0;
      this.offsetY = 0;
      this.dmCamera = null;
    }
    this.onChange();
    return true;
  }

  /** Move the player centre by one step. No change while nothing is holding the centre. */
  nudge(key: ArrowKey, extent: Size): void {
    if (!this.holdsPan()) return;
    const step = panOffsetForKey(extent, this.rotation, key);
    this.offsetX += step.x;
    this.offsetY += step.y;
    this.onChange();
  }

  restore(session: object): void {
    const saved = readZoomLockSession(session);
    this.zoomLocked = saved.zoomLocked;
    this.pinnedScale = saved.pinnedScale;
    this.offsetX = saved.panX;
    this.offsetY = saved.panY;
    this.actualSize = 'actualSize' in session && session.actualSize === true;
    this.dmCamera = null;
  }

  sessionFields(): { zoomLocked: boolean; panX: number; panY: number; actualSize: boolean; pinnedScale?: number } {
    const fields = { zoomLocked: this.isZoomLocked(), panX: this.offsetX, panY: this.offsetY, actualSize: this.actualSize };
    return this.isZoomLocked() && this.pinnedScale !== null ? { ...fields, pinnedScale: this.pinnedScale } : fields;
  }

  nudgeKey(key: string, extent: Size): boolean {
    if (!isArrowKey(key) || !this.holdsPan()) return false;
    this.nudge(key, extent);
    return true;
  }
}
