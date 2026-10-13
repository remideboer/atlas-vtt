import { describe, expect, it, vi } from 'vitest';
import { canvasMenuEntries } from '../../src/app/pixi/canvasMenu';
import type { CanvasMenuActions } from '../../src/app/pixi/canvasMenu';

function actions(over: Partial<CanvasMenuActions> = {}): CanvasMenuActions {
  return {
    rotation: 0,
    zoomLocked: false,
    frozen: false,
    sendMap: vi.fn(),
    openPlayerWindow: vi.fn(),
    toggleFreeze: vi.fn(),
    toggleZoomLock: vi.fn(),
    setRotation: vi.fn(),
    toggleInitiative: vi.fn(),
    ...over,
  };
}

describe('blank canvas menu', () => {
  it('offers commands and the four rotation choices, with the active angle checked', () => {
    const menu = canvasMenuEntries(actions({ rotation: 90, zoomLocked: true }));
    expect(menu).toHaveLength(2);
    const commands = menu[0];
    const rotation = menu[1];
    expect(commands?.type).toBe('submenu');
    expect(rotation?.type).toBe('submenu');
    if (rotation?.type !== 'submenu' || typeof rotation.children === 'function') throw new Error('rotation submenu');
    expect(rotation.children.map(entry => entry.type === 'item' ? entry.checked : false)).toEqual([false, true, false, false]);
    if (commands?.type !== 'submenu' || typeof commands.children === 'function') throw new Error('commands submenu');
    const zoom = commands.children[3];
    expect(zoom?.type).toBe('item');
    if (zoom?.type === 'item') expect(zoom.checked).toBe(true);
  });

  it('runs the command action and does not call a rotation that is already selected through the entry', () => {
    const menuActions = actions();
    const menu = canvasMenuEntries(menuActions);
    const commands = menu[0];
    if (commands?.type !== 'submenu' || typeof commands.children === 'function') throw new Error('commands');
    const send = commands.children[0];
    if (send?.type === 'item') send.onClick();
    expect(menuActions.sendMap).toHaveBeenCalledOnce();
  });
});
