import { EventEmitter } from 'events';
import type { StrokeMode } from './shapeStroke';

/** Fog shape modes: drag strokes plus click-to-place polygon. */
export type FogShapeMode = StrokeMode | 'polygon';

export type FogToolMode = FogShapeMode;

export interface FogSettings {
  brushSize: number;
  mode: FogToolMode;
  /** Whether rectangle and polygon corners snap to the grid. */
  snapToGrid: boolean;
}

/**
 * Handles fog specific interactions such as painting, erasing and clearing the entire fog on the map.
 * It only keeps local state and notifies other parts of the application via the shared event bus.
 */
export class FogTool {
  private settings: FogSettings;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.settings = {
      brushSize: 50,
      mode: 'brush',
      snapToGrid: false,
    };
  }

  /**
   * Update the active brush size used for painting / erasing fog.
   */
  public setBrushSize(size: number): void {
    if (this.settings.brushSize === size) return;
    this.settings.brushSize = size;
    this.eventBus.emit('fog-brush-size-changed', size);
  }

  /**
   * Switch between brush, lasso, rectangle, and polygon fog modes.
   */
  public setMode(mode: FogToolMode): void {
    if (this.settings.mode === mode) return;
    this.settings.mode = mode;
    this.eventBus.emit('fog-mode-changed', mode);
  }

  /**
   * Whether rectangle and polygon corners snap to the grid.
   */
  public setSnapToGrid(snap: boolean): void {
    if (this.settings.snapToGrid === snap) return;
    this.settings.snapToGrid = snap;
    this.eventBus.emit('fog-snap-changed', snap);
  }

  /**
   * Clear all fog on the canvas.
   */
  public clearAll(): void {
    this.eventBus.emit('fog-clear-all');
  }

  /**
   * Cover the whole map with fog.
   */
  public coverMap(): void {
    this.eventBus.emit('fog-cover-map');
  }

  /**
   * Current configuration for the fog tool.
   */
  public getSettings(): FogSettings {
    return { ...this.settings };
  }
}
