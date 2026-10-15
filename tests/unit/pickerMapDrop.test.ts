import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachPickerMapDrop,
  readPickerTokenDrag,
  worldPointFromPickerDrop,
  writePickerTokenDrag,
  type PickerTokenPayload,
} from '../../src/app/clipboard/pickerMapDrop';

function setBox(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
}

function transfer(readable = true): DataTransfer {
  const data: Record<string, string> = {};
  const types: string[] = [];
  return {
    setData: (type: string, value: string) => {
      data[type] = value;
      if (!types.includes(type)) types.push(type);
    },
    getData: (type: string) => (readable ? data[type] ?? '' : ''),
    types,
    effectAllowed: 'all',
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

function drag(type: string, target: EventTarget, clientX: number, clientY: number, dataTransfer: DataTransfer): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  window.dispatchEvent(event);
  return event;
}

describe('worldPointFromPickerDrop', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('converts a point on the map canvas into world coordinates', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    setBox(canvas, 100, 50, 200, 100);
    const viewport = { toWorld: (x: number, y: number) => ({ x: x * 2, y: y * 2 }) };

    expect(worldPointFromPickerDrop(canvas, viewport, null, 150, 80)).toEqual({ x: 100, y: 60 });
  });

  it('returns null when the point is outside the canvas', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    setBox(canvas, 100, 50, 200, 100);
    const viewport = { toWorld: (x: number, y: number) => ({ x, y }) };

    expect(worldPointFromPickerDrop(canvas, viewport, null, 50, 80)).toBeNull();
  });

  it('returns null when the point is on the picker modal', () => {
    const canvas = document.createElement('canvas');
    const modal = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(modal);
    setBox(canvas, 100, 50, 200, 100);
    setBox(modal, 120, 60, 80, 40);
    const viewport = { toWorld: (x: number, y: number) => ({ x, y }) };

    expect(worldPointFromPickerDrop(canvas, viewport, modal, 150, 70)).toBeNull();
  });
});

describe('attachPickerMapDrop', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('places a dragged token at the world point under the pointer', () => {
    const canvas = document.createElement('canvas');
    const modal = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(modal);
    setBox(canvas, 100, 50, 200, 100);
    setBox(modal, 400, 400, 80, 40);
    const onPlace = vi.fn();
    const stop = attachPickerMapDrop({
      getCanvas: () => canvas,
      getViewport: () => ({ toWorld: (x: number, y: number) => ({ x: x + 1, y: y + 2 }) }),
      modalEl: modal,
      onPlace,
    });
    const dataTransfer = transfer();
    const payload: PickerTokenPayload = { kind: 'library', id: 'goblin' };
    writePickerTokenDrag(dataTransfer, payload);

    drag('dragover', document, 150, 80, dataTransfer);
    drag('drop', document, 150, 80, dataTransfer);

    expect(onPlace).toHaveBeenCalledOnce();
    expect(onPlace).toHaveBeenCalledWith({ x: 51, y: 32 }, payload);
    stop();
  });

  it('accepts a map dragover before the payload can be read', () => {
    const canvas = document.createElement('canvas');
    const modal = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(modal);
    setBox(canvas, 100, 50, 200, 100);
    setBox(modal, 400, 400, 80, 40);
    const stop = attachPickerMapDrop({
      getCanvas: () => canvas,
      getViewport: () => ({ toWorld: (x: number, y: number) => ({ x, y }) }),
      modalEl: modal,
      onPlace: vi.fn(),
    });
    const dataTransfer = transfer(false);
    writePickerTokenDrag(dataTransfer, { kind: 'library', id: 'goblin' });

    const over = drag('dragover', document, 150, 80, dataTransfer);

    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
    stop();
  });

  it('accepts a picker dragover that is not on the picker even without a canvas', () => {
    const modal = document.createElement('div');
    document.body.appendChild(modal);
    setBox(modal, 400, 400, 80, 40);
    const stop = attachPickerMapDrop({
      getCanvas: () => null,
      getViewport: () => null,
      modalEl: modal,
      onPlace: vi.fn(),
    });
    const dataTransfer = transfer(false);
    writePickerTokenDrag(dataTransfer, { kind: 'fiveE', uid: 'goblin|MM' });

    const over = drag('dragover', document, 150, 80, dataTransfer);

    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
    stop();
  });

  it('does not place when the drop lands on the picker', () => {
    const canvas = document.createElement('canvas');
    const modal = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(modal);
    setBox(canvas, 100, 50, 200, 100);
    setBox(modal, 120, 60, 80, 40);
    const onPlace = vi.fn();
    const stop = attachPickerMapDrop({
      getCanvas: () => canvas,
      getViewport: () => ({ toWorld: (x: number, y: number) => ({ x, y }) }),
      modalEl: modal,
      onPlace,
    });
    const dataTransfer = transfer();
    writePickerTokenDrag(dataTransfer, { kind: 'fiveE', uid: 'goblin|MM' });

    drag('drop', document, 150, 70, dataTransfer);

    expect(onPlace).not.toHaveBeenCalled();
    stop();
  });
});

describe('picker token drag payload', () => {
  it('round-trips a library or 5e.tools token', () => {
    const library = transfer();
    writePickerTokenDrag(library, { kind: 'library', id: 'goblin' });
    expect(readPickerTokenDrag(library)).toEqual({ kind: 'library', id: 'goblin' });

    const fiveE = transfer();
    writePickerTokenDrag(fiveE, { kind: 'fiveE', uid: 'goblin|MM' });
    expect(readPickerTokenDrag(fiveE)).toEqual({ kind: 'fiveE', uid: 'goblin|MM' });
  });
});
