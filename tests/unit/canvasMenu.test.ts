import { describe, expect, it, vi } from 'vitest';
import { canvasMenuEntries } from '../../src/app/pixi/canvasMenu';
import type { CanvasMenuActions } from '../../src/app/pixi/canvasMenu';

function actions(over: Partial<CanvasMenuActions> = {}): CanvasMenuActions {
  return {
    rotation: 0,
    mapOrientation: 0,
    zoomLocked: false,
    paused: false,
    actualSize: false,
    sendMap: vi.fn(),
    sendActualSize: vi.fn(),
    openScreenSetup: vi.fn(),
    openPlayerWindow: vi.fn(),
    togglePause: vi.fn(),
    toggleZoomLock: vi.fn(),
    setRotation: vi.fn(),
    setMapOrientation: vi.fn(),
    toggleInitiative: vi.fn(),
    ...over,
  };
}

describe('blank canvas menu', () => {
  it('offers commands and the four rotation choices, with the active angle checked', () => {
    const menu = canvasMenuEntries(actions({ rotation: 90, zoomLocked: true, paused: true }));
    expect(menu).toHaveLength(3);
    const commands = menu[0];
    const rotation = menu[1];
    expect(commands?.type).toBe('submenu');
    expect(rotation?.type).toBe('submenu');
    if (rotation?.type !== 'submenu' || typeof rotation.children === 'function') throw new Error('rotation submenu');
    expect(rotation.children.map(entry => entry.type === 'item' ? entry.checked : false)).toEqual([false, true, false, false]);
    if (commands?.type !== 'submenu' || typeof commands.children === 'function') throw new Error('commands submenu');
    const pause = commands.children[4];
    const zoom = commands.children[5];
    expect(pause?.type).toBe('item');
    expect(zoom?.type).toBe('item');
    if (pause?.type === 'item') expect(pause.checked).toBe(true);
    if (zoom?.type === 'item') expect(zoom.checked).toBe(true);
    const map = menu[2];
    if (map?.type !== 'submenu' || typeof map.children === 'function') throw new Error('map submenu');
    expect(map.children.map(entry => entry.type === 'item' ? entry.checked : false)).toEqual([true, false, false, false]);
  });

  it('turns the map by a quarter from the menu', () => {
    const menuActions = actions({ mapOrientation: 180 });
    const menu = canvasMenuEntries(menuActions);
    const map = menu[2];
    if (map?.type !== 'submenu' || typeof map.children === 'function') throw new Error('map');
    const quarter = map.children[1];
    if (quarter?.type === 'item') quarter.onClick();
    expect(menuActions.setMapOrientation).toHaveBeenCalledWith(90);
  });

  it('runs the command action and does not call a rotation that is already selected through the entry', () => {
    const menuActions = actions();
    const menu = canvasMenuEntries(menuActions);
    const commands = menu[0];
    if (commands?.type !== 'submenu' || typeof commands.children === 'function') throw new Error('commands');
    const send = commands.children[0];
    if (send?.type === 'item') send.onClick();
    expect(menuActions.sendMap).toHaveBeenCalledOnce();
    const pause = commands.children[4];
    if (pause?.type === 'item') pause.onClick();
    expect(menuActions.togglePause).toHaveBeenCalledOnce();
    const actual = commands.children[1];
    if (actual?.type === 'item') actual.onClick();
    expect(menuActions.sendActualSize).toHaveBeenCalledOnce();
  });

  it('marks actual size when it is on and opens the screen setup', () => {
    const menuActions = actions({ actualSize: true });
    const menu = canvasMenuEntries(menuActions);
    const commands = menu[0];
    if (commands?.type !== 'submenu' || typeof commands.children === 'function') throw new Error('commands');
    const actual = commands.children[1];
    const setup = commands.children[2];
    if (actual?.type === 'item') expect(actual.checked).toBe(true);
    if (setup?.type === 'item') setup.onClick();
    expect(menuActions.openScreenSetup).toHaveBeenCalledOnce();
  });
});
