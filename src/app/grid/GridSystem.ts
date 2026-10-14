import { Application, Container, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { RenderLayer } from 'pixi.js';
import { drawSquareGrid } from './squareGridDrawer';
import { drawHexGrid } from './hexGridDrawer';
import { gridMarkerArmLength } from './gridLineStyle';
import type { GridBounds, GridLineType } from './gridLineStyle';
import { GridLines } from './gridLines';
import { createHexLayout, hexCellExtent, isHexGridType, nearestHexCenter } from './hexGeometry';
import type { HexLayout } from './hexGeometry';
import { contrastColorForPixels } from './gridContrastColor';
import { snapTokenCenter } from './gridPlacement';
import { numberCells, type CellLattice, type CellNumberStyle } from './cellNumbering';
import { hexLattice } from './hexLattice';
import { squareLattice } from './squareLattice';
import { CellNumberLabels, type CellNumberView } from './cellNumberLabels';
import { destroyTree } from '../pixi/utils/destroyTree';
import { applyGridMark, createMarkBacking, type GridMarkColor, type UnlitGrid } from './gridLightingMark';
import type { MapImageView } from '../pixi/mapImage/mapImageView';
import type { PixelRect } from '../pixi/mapImage/pyramid';

export type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';

// Tracks grid containers without modifying their types
const gridSpriteIds = new WeakMap<Container, number>();

export interface GridOptions {
  /** Type of grid. `hex-horizontal` is flat-top, `hex-vertical` is pointy-top. */
  type?: GridType;
  /**
   * Size of grid cells in pixels.
   * For square grids this is the side length. For hex grids it is the
   * flat-to-flat distance (width of a pointy-top hex, height of a flat-top hex),
   * matching the convention used by Foundry VTT and Owlbear Rodeo.
   */
  size: number;
  /** X offset for the grid origin */
  offsetX?: number;
  /** Y offset for the grid origin */
  offsetY?: number;
  /** Color of grid lines in hex format. Unset picks black or white from the map's brightness. */
  color?: number | undefined;
  /** Alpha transparency of grid lines (0–1) */
  alpha?: number;
  /** Line width for grid lines */
  lineWidth?: number;
  /** Line style (solid, dashed, dotted) */
  lineType?: GridLineType;
  /** Whether the grid is visible */
  enabled?: boolean;
  /** Scale factor for the grid (visual scale) */
  scale?: number;
  /** Whether in alignment mode (for visual feedback) */
  isAligning?: boolean;
  /** Numbers every cell of the grid in this style; unset shows no numbers. */
  cellNumbers?: CellNumberStyle | undefined;
}

/** Colour of every grid preview while the grid is being aligned. */
export const ALIGNMENT_GRID_COLOR = 0x00ff00;

/**
 * Manages a static grid overlay that exactly matches the map image,
 * staying locked under pan/zoom by the Pixi‑Viewport container.
 */
export class GridSystem implements UnlitGrid {
  /** Holds the grid lines and, on a numbered grid, the cell numbers. */
  private gridSprite: Container | null = null;
  /**
   * Continues the grid into the players' off-map margins. Never marked (UnlitGrid erase would
   * punch holes in the edge-colour clear outside the lighting layer). Shown only while a player
   * frame asks for it (`setOffMapGrid`).
   */
  private offMapSprite: Container | null = null;
  /** Whether the next player frame should show the off-map continuation. */
  private offMapWanted = false;
  private cellNumberLabels: CellNumberLabels | null = null;
  private readonly onViewportZoomed = (): void => {
    this.cellNumberLabels?.setView(this.numberView());
  };
  /** The map the grid overlays: its world rect bounds the grid, and the grid lies just above its layer. */
  private map: MapImageView;
  private stopFollowingMap: () => void;
  /** Counts the images shown, so a colour read from one is never applied to the next. */
  private mapGeneration = 0;
  /** The automatic colour of the image shown: unread, being read, or read (`autoColor`, null where it had no pixels). */
  private autoColorState: 'unread' | 'reading' | 'read' = 'unread';
  private viewport: Viewport;
  private app: Application;
  private options: GridOptions;
  private layer: RenderLayer | null = null;
  private _updateDebounceTimer: number | null = null;
  private _gridSpriteInitialWorldX: number = 0;
  private _gridSpriteInitialWorldY: number = 0;
  private _offMapSpriteInitialWorldX: number = 0;
  private _offMapSpriteInitialWorldY: number = 0;
  private _gridOptionsOffsetXAtCreation: number = 0;
  private _gridOptionsOffsetYAtCreation: number = 0;
  private isDestroying: boolean = false;
  private autoColor: number | null = null;
  /** Whether the lighting composite draws the grid (`UnlitGrid`). */
  private marked = false;
  private markBacking: Graphics | null = null;
  private drawnColor: GridMarkColor = { color: 0xffffff, contrasting: true };

  /**
   * @param app      – the Pixi Application
   * @param viewport – the Pixi‑Viewport instance containing your map
   * @param map      – the map image the grid overlays and follows to every image it shows
   * @param options  – grid styling options
   */
  constructor(
    app: Application,
    viewport: Viewport,
    map: MapImageView,
    options: GridOptions,
  ) {
    this.app = app;
    this.viewport = viewport;
    this.map = map;
    this.stopFollowingMap = this.follow(map);
    this.options = {
      ...options,
      type: options.type ?? 'square',
      size: options.size ?? 70,
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      alpha: options.alpha ?? 0.7,
      lineWidth: options.lineWidth ?? 1,
      lineType: options.lineType ?? 'solid',
      enabled: options.enabled ?? true,
      scale: options.scale ?? 1,
    };

    this.viewport.on('zoomed', this.onViewportZoomed);
    this.createGrid();
  }

  private createGrid(): void {
    if (this.isDestroying) {
      return;
    }
    this.destroyGridResources();
    this.createExplicitGrid();
  }

  /** Hex layout for the current options, or null for square grids. */
  private getHexLayout(): HexLayout | null {
    const { type, size, offsetX = 0, offsetY = 0 } = this.options;
    return isHexGridType(type) ? createHexLayout(type, size, offsetX, offsetY) : null;
  }

  private createExplicitGrid(): void {
    const { size, offsetX = 0, offsetY = 0, color, alpha, lineWidth, lineType = 'solid', isAligning } = this.options;

    // Without an image the grid is drawn once the map image shows the next one (`onChange`).
    const mapRect = this.mapRect;
    if (!mapRect) return;
    // `??`, not `||`: black is 0x000000 and must not fall through to the automatic colour.
    // While the automatic colour is read the grid waits for it rather than flash in another colour.
    const gridColor = isAligning ? ALIGNMENT_GRID_COLOR : (color ?? this.getAutoColor());
    if (gridColor === null) return;

    const { x: mapX, y: mapY, width: mapWidth, height: mapHeight } = mapRect;
    const hexLayout = this.getHexLayout();
    const lineAlpha = isAligning ? Math.min(alpha! * 1.5, 1) : alpha!;
    const markerArm = gridMarkerArmLength(size);
    const makeLines = (bounds: GridBounds): GridLines => new GridLines({
      lineType,
      lineWidth: lineWidth!,
      color: gridColor,
      alpha: lineAlpha,
      markerArm,
      trace: (path, thickness, arm) => {
        if (hexLayout) drawHexGrid(path, bounds, hexLayout, lineType, thickness, arm);
        else drawSquareGrid(path, bounds, size, offsetX, offsetY, lineType, thickness, arm);
      },
    });

    // One cell of padding around the map; the mask clips the overflow.
    const padding = hexLayout ? Math.max(hexCellExtent(hexLayout).width, hexCellExtent(hexLayout).height) : size;
    const bounds: GridBounds = {
      minX: mapX - padding,
      minY: mapY - padding,
      maxX: mapX + mapWidth + padding,
      maxY: mapY + mapHeight + padding,
    };

    const grid = new Container({ label: 'grid', eventMode: 'none', interactiveChildren: false });
    grid.addChild(makeLines(bounds).graphics);
    grid.position.set(bounds.minX, bounds.minY);

    const cellNumbers = this.options.cellNumbers;
    if (cellNumbers) {
      const lattice: CellLattice = hexLayout ? hexLattice(hexLayout) : squareLattice(size, offsetX, offsetY);
      this.cellNumberLabels = new CellNumberLabels(
        numberCells(lattice, mapRect, cellNumbers.format),
        lattice.size,
        { x: bounds.minX, y: bounds.minY },
        { color: gridColor, opacity: cellNumbers.opacity },
        this.numberView(),
      );
      grid.addChild(this.cellNumberLabels.container);
    }

    // Clip the grid to the map bounds. The mask is the grid's own child so it is hidden with it:
    // a visible mask whose grid is hidden is left out of PIXI's batch yet still updated in place on
    // every zoom, writing its corners over whatever took its slot (the map folded towards a pin).
    const maskGraphics = new Graphics();
    // A scan turned level lies askew in its world rect: the grid ends at the image, not at the rect's empty corners.
    const outline = this.map.outline;
    if (outline) maskGraphics.poly(outline.flatMap((corner) => [corner.x - mapX, corner.y - mapY]));
    else maskGraphics.rect(0, 0, mapWidth, mapHeight);
    maskGraphics.fill(0xffffff);
    maskGraphics.position.set(mapX - bounds.minX, mapY - bounds.minY);
    grid.addChild(maskGraphics);
    grid.mask = maskGraphics;
    this.markBacking = createMarkBacking(mapX - bounds.minX, mapY - bounds.minY, mapWidth, mapHeight);
    grid.addChildAt(this.markBacking, 0);
    applyGridMark(grid, this.markBacking, this.marked);
    this.drawnColor = { color: gridColor, contrasting: !isAligning && color === undefined };

    // Hidden for the players' frame too, which takes the grid as the GM sets it.
    grid.visible = this.options.enabled !== false;
    this.gridSprite = grid;
    this._gridSpriteInitialWorldX = bounds.minX;
    this._gridSpriteInitialWorldY = bounds.minY;
    this._gridOptionsOffsetXAtCreation = offsetX;
    this._gridOptionsOffsetYAtCreation = offsetY;

    // Off-map ring for the players' letterbox: one map side of padding covers ultrawide frames.
    const marginPad = Math.max(mapWidth, mapHeight);
    const marginBounds: GridBounds = {
      minX: mapX - marginPad,
      minY: mapY - marginPad,
      maxX: mapX + mapWidth + marginPad,
      maxY: mapY + mapHeight + marginPad,
    };
    const offMap = new Container({ label: 'grid-off-map', eventMode: 'none', interactiveChildren: false });
    offMap.addChild(makeLines(marginBounds).graphics);
    offMap.position.set(marginBounds.minX, marginBounds.minY);
    const offMapMask = new Graphics();
    offMapMask.rect(0, 0, marginBounds.maxX - marginBounds.minX, marginBounds.maxY - marginBounds.minY).fill(0xffffff);
    if (outline) {
      offMapMask.poly(outline.flatMap((corner) => [corner.x - marginBounds.minX, corner.y - marginBounds.minY])).cut();
    } else {
      offMapMask.rect(mapX - marginBounds.minX, mapY - marginBounds.minY, mapWidth, mapHeight).cut();
    }
    offMap.addChild(offMapMask);
    offMap.mask = offMapMask;
    offMap.visible = this.offMapWanted && this.options.enabled !== false;
    this.offMapSprite = offMap;
    this._offMapSpriteInitialWorldX = marginBounds.minX;
    this._offMapSpriteInitialWorldY = marginBounds.minY;

    // Insert just above the map image
    const existingGrids = this.viewport.children.filter(child => gridSpriteIds.has(child));
    existingGrids.forEach(g => this.viewport.removeChild(g));

    const mapIndex = this.viewport.children.indexOf(this.map.layer);
    const insertAt = mapIndex >= 0 ? mapIndex + 1 : 0;
    this.viewport.addChildAt(grid, insertAt);
    this.viewport.addChildAt(offMap, insertAt + 1);
    gridSpriteIds.set(grid, Date.now());
    gridSpriteIds.set(offMap, Date.now());

    if (this.layer) {
      this.layer.attach(grid);
      this.layer.attach(offMap);
    }

    this.viewport.dirty = true;
  }

  private numberView(): CellNumberView {
    return { zoom: this.viewport.scale.x, pixelRatio: this.app.renderer.resolution };
  }

  /**
   * Black or white, whichever contrasts with the map image, read once per image from a small
   * overview of it; null while it is read, after which the grid is drawn again.
   */
  private getAutoColor(): number | null {
    if (this.autoColorState === 'read') return this.autoColor ?? 0xffffff;
    if (this.autoColorState === 'unread') this.readAutoColor();
    return null;
  }

  private readAutoColor(): void {
    const generation = this.mapGeneration;
    this.autoColorState = 'reading';
    void contrastColorForPixels(this.map).then((color) => {
      if (generation !== this.mapGeneration || this.isDestroying) return;
      this.autoColor = color;
      this.autoColorState = 'read';
      if (this.options.color === undefined && !this.options.isAligning) this.createGrid();
    });
  }

  /** The image the grid is drawn over, in world units; null while the map image shows none. */
  private get mapRect(): PixelRect | null {
    const rect = this.map.worldRect;
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  /** Follows `map` to every image it shows; returns the function that stops. */
  private follow(map: MapImageView): () => void {
    return map.onChange((change) => {
      if (change === 'image') this.mapImageChanged();
    });
  }

  /** Another image (or none) is shown: its colour is read anew and the grid is drawn over it. */
  private mapImageChanged(): void {
    this.autoColor = null;
    this.autoColorState = 'unread';
    this.mapGeneration++;
    this.createGrid();
  }

  /** Clean up grid-only resources */
  private destroyGridResources(): void {
    this.cellNumberLabels = null;
    this.markBacking = null;
    this.releaseGridSprite(this.gridSprite);
    this.gridSprite = null;
    this.releaseGridSprite(this.offMapSprite);
    this.offMapSprite = null;
  }

  private releaseGridSprite(sprite: Container | null): void {
    if (!sprite) return;
    sprite.visible = false;
    sprite.renderable = false;
    if (this.layer) {
      try {
        this.layer.detach(sprite);
      } catch {
        // Layer might already be destroyed
      }
    }
    if (sprite.parent) {
      try {
        sprite.parent.removeChild(sprite);
      } catch {
        // Parent might be in the middle of rendering
      }
    }
    window.requestAnimationFrame(() => {
      try {
        if (!sprite.destroyed) destroyTree(sprite);
      } catch {
        // Silently ignore destruction errors
      }
    });
  }

  setMarking(on: boolean): void {
    if (on === this.marked) return;
    this.marked = on;
    if (this.gridSprite && this.markBacking) applyGridMark(this.gridSprite, this.markBacking, on);
  }

  markColor(): GridMarkColor | null {
    return this.marked && this.gridSprite?.visible ? this.drawnColor : null;
  }

  /**
   * Shows the off-map grid continuation for one players' frame. No-op while the grid is hidden;
   * the GM canvas never shows it.
   */
  public setOffMapGrid(on: boolean): void {
    this.offMapWanted = on;
    if (this.offMapSprite) {
      this.offMapSprite.visible = on && this.options.enabled !== false;
      this.viewport.dirty = true;
    }
  }

  /** Toggle visibility */
  public setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (enabled) {
      this.createGrid();
    } else {
      if (this.gridSprite) this.gridSprite.visible = false;
      if (this.offMapSprite) this.offMapSprite.visible = false;
    }
  }

  /** Update cell size, color, alpha, etc. */
  public updateOptions(opts: Partial<GridOptions>): void {
    if (Object.keys(opts).length === 0) {
      return;
    }

    Object.assign(this.options, opts);

    if (this._updateDebounceTimer) {
      window.clearTimeout(this._updateDebounceTimer);
    }

    this._updateDebounceTimer = window.setTimeout(() => {
      this.createGrid();
      this._updateDebounceTimer = null;
    }, 100);
  }

  /** Changes only the numbers' opacity, without rebuilding the grid. */
  public setCellNumberOpacity(opacity: number): void {
    if (!this.options.cellNumbers) return;
    this.options.cellNumbers = { ...this.options.cellNumbers, opacity };
    this.cellNumberLabels?.setOpacity(opacity);
  }

  /** Return current options */
  public getOptions(): Readonly<GridOptions> {
    return this.options;
  }

  /** Returns the grid container: its lines and, on a numbered grid, the cell numbers */
  public getGridSprite(): Container | null {
    return this.gridSprite;
  }

  /** Off-map continuation for the players' frame; hidden on the GM canvas. */
  public getOffMapSprite(): Container | null {
    return this.offMapSprite;
  }

  /** Completely destroy */
  public destroy(): void {
    this.isDestroying = true;
    this.stopFollowingMap();
    this.viewport.off('zoomed', this.onViewportZoomed);
    this.destroyGridResources();
  }

  /** Draws over another map image from now on, as when the view's map image was replaced. */
  public setMapImage(map: MapImageView): void {
    if (map === this.map) return;
    this.stopFollowingMap();
    this.map = map;
    this.stopFollowingMap = this.follow(map);
    this.mapImageChanged();
  }

  /** Provide a render layer so the grid sprite can automatically be attached */
  public setRenderLayer(layer: RenderLayer | null): void {
    this.layer = layer;
    if (layer) {
      if (this.gridSprite) layer.attach(this.gridSprite);
      if (this.offMapSprite) layer.attach(this.offMapSprite);
    }
  }

  /** Snap to the top-left corner of the containing square cell */
  public snapToGrid(x: number, y: number): { x: number; y: number } {
    const { size, offsetX = 0, offsetY = 0 } = this.options;
    return {
      x: Math.floor((x - offsetX) / size) * size + offsetX,
      y: Math.floor((y - offsetY) / size) * size + offsetY,
    };
  }

  /** Snap to the centre of the containing grid cell */
  public snapToCellCenter(x: number, y: number): { x: number; y: number } {
    const hexLayout = this.getHexLayout();
    if (hexLayout) {
      return nearestHexCenter(hexLayout, { x, y });
    }

    const { size, offsetX = 0, offsetY = 0 } = this.options;
    const col = Math.floor((x - offsetX) / size);
    const row = Math.floor((y - offsetY) / size);
    return {
      x: col * size + offsetX + size / 2,
      y: row * size + offsetY + size / 2,
    };
  }

  /** Snap a token's centre: a cell centre, or where cells meet for an even footprint (`tokenCenterShift`) */
  public snapTokenCenter(x: number, y: number, tokenSize: number): { x: number; y: number } {
    const { type, size } = this.options;
    return snapTokenCenter({ x, y }, tokenSize, type, size, (point) => this.snapToCellCenter(point.x, point.y));
  }

  /** Get current grid size */
  public get gridSize(): number {
    return this.options.size;
  }

  /** Set grid type */
  public setGridType(type: GridType): void {
    const oldType = this.options.type;
    this.updateOptions({ type });

    if (oldType !== type) {
      window.dispatchEvent(new CustomEvent('atlas-grid-type-changed', {
        detail: { oldType, newType: type }
      }));
    }
  }

  /** Set grid size (see GridOptions.size for the meaning per grid type) */
  public setGridSize(size: number): void {
    this.updateOptions({ size });
  }

  /** Set grid offset - optimized for real-time updates during dragging */
  public setGridOffset(offsetX: number, offsetY: number): void {
    const roundedOffsetX = Math.round(offsetX);
    const roundedOffsetY = Math.round(offsetY);

    this.options.offsetX = roundedOffsetX;
    this.options.offsetY = roundedOffsetY;

    if (!this.gridSprite) return;

    // Move the existing graphics to reflect the new offset instead of redrawing
    const deltaOptionsX = roundedOffsetX - this._gridOptionsOffsetXAtCreation;
    const deltaOptionsY = roundedOffsetY - this._gridOptionsOffsetYAtCreation;
    this.gridSprite.position.set(
      this._gridSpriteInitialWorldX + deltaOptionsX,
      this._gridSpriteInitialWorldY + deltaOptionsY,
    );
    this.offMapSprite?.position.set(
      this._offMapSpriteInitialWorldX + deltaOptionsX,
      this._offMapSpriteInitialWorldY + deltaOptionsY,
    );
    this.viewport.dirty = true;
  }

  /** Force recreation of grid with current offset - use this for final alignment */
  public recreateGridWithOffset(): void {
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid scale */
  public setGridScale(scale: number): void {
    this.updateOptions({ scale });
  }

  /** Set alignment mode for visual feedback */
  public setAlignmentMode(isAligning: boolean): void {
    this.options.isAligning = isAligning;
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid opacity */
  public setGridOpacity(opacity: number): void {
    this.updateOptions({ alpha: opacity });
  }

  /**
   * Validate and adjust grid size according to VTT best practices
   * Minimum 50px, recommended 100px+ for optimal snapping precision
   */
  public validateGridSize(size: number): number {
    const minSize = 50;

    if (size < minSize) {
      console.warn(`Grid size ${size}px is below minimum recommended size of ${minSize}px`);
      return minSize;
    }

    return Math.round(size);
  }
}
