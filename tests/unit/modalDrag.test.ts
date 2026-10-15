import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachModalDrag } from '../../src/app/ui/modalDrag';

const MARGIN = 16;

function setBox(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => height });
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

// jsdom has no PointerEvent: a mouse event of the pointer's type.
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', target: EventTarget, clientX: number, clientY: number): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
  target.dispatchEvent(event);
}

describe('attachModalDrag', () => {
  let modal: HTMLElement;
  let handle: HTMLElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    modal = document.createElement('div');
    handle = document.createElement('div');
    modal.appendChild(handle);
    document.body.appendChild(modal);
    setBox(modal, 200, 100, 400, 300);
    dispose = attachModalDrag(modal, handle, { margin: MARGIN });
  });

  afterEach(() => {
    dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('moves the modal by left and top when the handle is dragged', () => {
    pointer('pointerdown', handle, 220, 120);
    pointer('pointermove', window, 270, 160);
    pointer('pointerup', window, 270, 160);

    expect(modal.style.left).toBe('250px');
    expect(modal.style.top).toBe('140px');
    expect(modal.style.position).toBe('fixed');
  });

  it('does not drag when the press is on a close button', () => {
    const close = document.createElement('button');
    close.className = 'modal-close-button';
    handle.appendChild(close);

    pointer('pointerdown', close, 220, 120);
    pointer('pointermove', window, 270, 160);
    pointer('pointerup', window, 270, 160);

    expect(modal.style.left).toBe('');
    expect(modal.style.top).toBe('');
  });

  it('clamps the modal inside the viewport margin when a drag ends past the edge', () => {
    pointer('pointerdown', handle, 220, 120);
    pointer('pointermove', window, -500, -500);
    pointer('pointerup', window, -500, -500);

    expect(modal.style.left).toBe(`${MARGIN}px`);
    expect(modal.style.top).toBe(`${MARGIN}px`);
  });

  it('stops moving after dispose', () => {
    pointer('pointerdown', handle, 220, 120);
    pointer('pointermove', window, 270, 160);
    pointer('pointerup', window, 270, 160);
    expect(modal.style.left).toBe('250px');

    dispose();
    pointer('pointerdown', handle, 270, 160);
    pointer('pointermove', window, 320, 200);
    pointer('pointerup', window, 320, 200);

    expect(modal.style.left).toBe('250px');
    expect(modal.style.top).toBe('140px');
  });
});
