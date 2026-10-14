import type { AtlasView } from '../atlas-view';
import type { Point } from './mapObjectContent';

/** Last client pointer while it was over each view's map canvas. */
const lastOverMap = new WeakMap<AtlasView, Point>();

function mapCanvas(view: AtlasView | null): HTMLCanvasElement | null {
  return view?.serviceManager?.getRendererService()?.getApp()?.canvas ?? null;
}

function pointerOverCanvas(canvas: HTMLCanvasElement | null, pointer: Point | null | undefined): pointer is Point {
  return !!pointer && !!canvas && canvas.ownerDocument.elementFromPoint(pointer.x, pointer.y) === canvas;
}

/**
 * Remembers the pointer while it moves over this view's map, so spawn and insert
 * still land where the GM last pointed after the cursor leaves for a panel.
 */
export function trackMapPointer(view: AtlasView | null): () => void {
  if (!view) return () => undefined;
  const onMove = (event: PointerEvent): void => {
    const canvas = mapCanvas(view);
    const point = { x: event.clientX, y: event.clientY };
    if (pointerOverCanvas(canvas, point)) lastOverMap.set(view, point);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return (): void => window.removeEventListener('pointermove', onMove);
}

/**
 * World position for paste, spawn and blank insert: the cursor while over the map,
 * else the last place it was over this map, else the centre of the visible map.
 */
export function mapPasteTarget(view: AtlasView | null, pointer?: Point | null): Point | null {
  const viewport = view?.serviceManager?.getRendererService()?.getViewport();
  if (!viewport) return null;
  const canvas = mapCanvas(view);
  const client = pointerOverCanvas(canvas, pointer)
    ? pointer
    : (view ? lastOverMap.get(view) ?? null : null);
  if (client && canvas) {
    const rect = canvas.getBoundingClientRect();
    return viewport.toWorld(client.x - rect.left, client.y - rect.top);
  }
  return viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2);
}
