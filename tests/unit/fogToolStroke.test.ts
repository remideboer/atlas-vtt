import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { snapCorner } from '../../src/app/pixi/fog/snapCorner';
import type { FogShapeMode } from '../../src/app/tools/FogTool';
import { FogPolygonDraft } from '../../src/app/tools/fogPolygonDraft';
import { ShapeStroke } from '../../src/app/tools/shapeStroke';

interface FogState {
  activeTool: string;
  isMapLoading: boolean;
  grid: { size: number };
  objects: { fog: Record<string, unknown> };
  addFogOperation: ReturnType<typeof vi.fn>;
}

interface FogToolHarness {
  stroke: ShapeStroke;
  polygon: FogPolygonDraft;
  fogShapeMode: FogShapeMode;
  snapToGrid: boolean;
  setFogMode(mode: FogShapeMode): void;
  setupStoreSubscriptions(): void;
  onPointerDown(event: FederatedPointerEvent): void;
  onPointerMove(event: FederatedPointerEvent): void;
  onPointerUp(): void;
  onPointerLeave(): void;
  handleEscape(): boolean;
  handleEnter(): boolean;
  handleDoubleClick(): void;
  cursorPreview: { shown: boolean; erasing: boolean | null };
  rebuildFogSprites: ReturnType<typeof vi.fn>;
  renderPreviewFromStore: ReturnType<typeof vi.fn>;
  compositor: { composite: ReturnType<typeof vi.fn> };
}

const at = (x: number, y: number): FederatedPointerEvent => ({ button: 0, global: { x, y } }) as unknown as FederatedPointerEvent;
const graphics = (): Record<string, ReturnType<typeof vi.fn>> => ({ clear: vi.fn(), rect: vi.fn(), poly: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() });

/** The fog renderer's drawing tool on a 70 px grid, without its canvas: what a stroke commits is what the store is given. */
function fogTool(activeTool: 'fog' | 'eraser', mode: FogShapeMode): { tool: FogToolHarness; state: FogState; notify: () => void } {
  const state: FogState = { activeTool, isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation: vi.fn() };
  const listeners: ((state: FogState) => void)[] = [];
  const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => state, subscribe: (listener: (state: FogState) => void) => (listeners.push(listener), () => undefined) },
    viewport: { toWorld: (point: { x: number; y: number }) => point, scale: { x: 1 } },
    stroke: Object.assign(new ShapeStroke(), { mode: mode === 'polygon' ? 'brush' : mode }),
    polygon: new FogPolygonDraft(),
    fogShapeMode: mode,
    snapToGrid: false,
    _pixiApp: {},
    compositor: { composite: vi.fn() },
    updatePreviewTexture: vi.fn(),
    cursorPreview: {
      shown: true,
      erasing: null as boolean | null,
      updatePosition: vi.fn(),
      show(erasing: boolean): void { Object.assign(this, { shown: true, erasing }); },
      hide(): void { this.shown = false; },
    },
    lassoGraphics: graphics(),
    rectPreviewGraphics: graphics(),
    rebuildFogSprites: vi.fn(),
    refreshBounds: vi.fn(),
    renderPreviewFromStore: vi.fn(),
    container: { visible: true },
    previewSprite: {},
  }) as unknown as FogToolHarness;
  return { tool, state, notify: () => listeners.forEach((listener) => listener(state)) };
}

describe('the fog tool\'s stroke', () => {
  it('commits nothing for a pointer release without a stroke', () => {
    const { tool, state } = fogTool('fog', 'brush');
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('paints with the fog tool and erases with the eraser', () => {
    for (const [activeTool, isErasing] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state } = fogTool(activeTool, 'brush');
      tool.onPointerDown(at(100, 100));
      tool.onPointerMove(at(130, 110));
      tool.onPointerUp();
      expect(state.addFogOperation).toHaveBeenCalledOnce();
      expect(state.addFogOperation).toHaveBeenCalledWith(expect.objectContaining({ type: 'brush', isErasing }));
    }
  });

  it('uses snapped corners when snap is on', () => {
    const grid = { size: 70 };
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.snapToGrid = true;
    rectangle.tool.onPointerDown(at(33, 33));
    rectangle.tool.onPointerMove(at(141, 121));
    rectangle.tool.onPointerUp();
    const origin = snapCorner({ x: 33, y: 33 }, grid);
    const opposite = snapCorner({ x: 141, y: 121 }, grid);
    expect(rectangle.state.addFogOperation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'rectangle',
      x: Math.min(origin.x, opposite.x),
      y: Math.min(origin.y, opposite.y),
    }));
  });

  it('drops the stroke under way when the mode is switched, and commits nothing', () => {
    const { tool, state } = fogTool('fog', 'brush');
    tool.onPointerDown(at(100, 100));
    tool.onPointerMove(at(160, 100));
    tool.setFogMode('lasso');
    expect(tool.stroke.active).toBe(false);
    expect(tool.stroke.mode).toBe('lasso');
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('commits nothing for a lasso of two points or a rectangle that never moved', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.onPointerDown(at(33, 33));
    lasso.tool.onPointerMove(at(141, 37));
    lasso.tool.onPointerUp();
    expect(lasso.state.addFogOperation).not.toHaveBeenCalled();
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.onPointerDown(at(33, 33));
    rectangle.tool.onPointerUp();
    expect(rectangle.state.addFogOperation).not.toHaveBeenCalled();
  });

  it('hides the brush\'s ring when the pointer leaves the map, and shows it again at the next move', () => {
    const { tool } = fogTool('eraser', 'brush');
    tool.onPointerMove(at(100, 100));
    expect(tool.cursorPreview.shown).toBe(true);
    tool.onPointerLeave();
    expect(tool.cursorPreview.shown).toBe(false);
    tool.onPointerMove(at(120, 100));
    expect(tool.cursorPreview).toMatchObject({ shown: true, erasing: true });

    // A lasso has no ring to bring back.
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.onPointerLeave();
    lasso.tool.onPointerMove(at(120, 100));
    expect(lasso.tool.cursorPreview.shown).toBe(false);
  });

  it('commits a click-corner polygon as a lasso fill where the pointer went', () => {
    const { tool, state } = fogTool('fog', 'polygon');
    tool.onPointerDown(at(33, 33));
    tool.onPointerUp();
    tool.onPointerDown(at(141, 37));
    tool.onPointerUp();
    tool.onPointerDown(at(40, 121));
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
    expect(tool.handleEnter()).toBe(true);
    expect(state.addFogOperation).toHaveBeenCalledWith({
      type: 'lasso',
      isErasing: false,
      points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 40, y: 121 }],
    });
    expect(tool.polygon.active).toBe(false);
  });

  it('snaps polygon corners to the grid when snap is on', () => {
    const { tool, state } = fogTool('fog', 'polygon');
    tool.snapToGrid = true;
    tool.onPointerDown(at(33, 33));
    tool.onPointerDown(at(141, 37));
    tool.onPointerDown(at(40, 121));
    expect(tool.handleEnter()).toBe(true);
    const committed = state.addFogOperation.mock.calls[0]![0] as { points: { x: number; y: number }[] };
    expect(committed.points[0]).toEqual(snapCorner({ x: 33, y: 33 }, { size: 70 }));
    expect(committed.points[1]).toEqual(snapCorner({ x: 141, y: 37 }, { size: 70 }));
  });

  it('Escape drops a polygon draft without committing', () => {
    const { tool, state } = fogTool('eraser', 'polygon');
    tool.onPointerDown(at(0, 0));
    tool.onPointerDown(at(140, 0));
    expect(tool.handleEscape()).toBe(true);
    expect(tool.polygon.active).toBe(false);
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });
});
