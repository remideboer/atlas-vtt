import { describe, expect, test, vi } from 'vitest';
import { maximizeDesktopWindow, whenWindowPlaced } from '../../src/app/player/desktopWindow';
import type { WindowFrame } from '../../src/app/player/playerDisplays';

interface FakeDesktop {
  maximizable: boolean;
  maximize: ReturnType<typeof vi.fn>;
  isMaximized(): boolean;
  getBounds(): WindowFrame;
}

function desktop(frame: WindowFrame): FakeDesktop {
  return {
    maximizable: false,
    maximize: vi.fn(),
    isMaximized: () => false,
    getBounds: () => frame,
  };
}

function popout(frame: WindowFrame, modules: Record<string, unknown>): Window {
  return {
    closed: false,
    screenX: frame.x,
    screenY: frame.y,
    outerWidth: frame.width,
    outerHeight: frame.height,
    require(id: string): unknown {
      if (!(id in modules)) throw new Error(id);
      return modules[id];
    },
  } as unknown as Window;
}

const playerFrame: WindowFrame = { x: 10, y: 20, width: 800, height: 600 };
const otherFrame: WindowFrame = { x: 0, y: 0, width: 400, height: 300 };

describe('maximizeDesktopWindow', () => {
  test('maximizes the popout and leaves a different window alone', () => {
    const player = desktop(playerFrame);
    const other = desktop(otherFrame);
    const win = popout(playerFrame, {
      electron: { remote: { getCurrentWindow: () => other, BrowserWindow: { getAllWindows: () => [other, player] } } },
    });

    expect(maximizeDesktopWindow(win)).toBe(true);
    expect(player.maximizable).toBe(true);
    expect(player.maximize).toHaveBeenCalledTimes(1);
    expect(other.maximize).not.toHaveBeenCalled();
  });

  test('maximizes the current window when it is the popout', () => {
    const player = desktop(playerFrame);
    const win = popout(playerFrame, {
      electron: { remote: { getCurrentWindow: () => player, BrowserWindow: { getAllWindows: () => [player] } } },
    });

    expect(maximizeDesktopWindow(win)).toBe(true);
    expect(player.maximize).toHaveBeenCalledTimes(1);
  });

  test('reads @electron/remote when electron has no remote', () => {
    const player = desktop(playerFrame);
    const win = popout(playerFrame, {
      electron: {},
      '@electron/remote': { getCurrentWindow: () => player, BrowserWindow: { getAllWindows: () => [player] } },
    });

    expect(maximizeDesktopWindow(win)).toBe(true);
    expect(player.maximize).toHaveBeenCalledTimes(1);
  });

  test('does nothing when no desktop window stands where the popout stands', () => {
    const other = desktop(otherFrame);
    const win = popout(playerFrame, {
      electron: { remote: { getCurrentWindow: () => other, BrowserWindow: { getAllWindows: () => [other] } } },
    });

    expect(maximizeDesktopWindow(win)).toBe(false);
    expect(other.maximize).not.toHaveBeenCalled();
  });

  test('does nothing when the window cannot load Electron', () => {
    const win = popout(playerFrame, {});

    expect(maximizeDesktopWindow(win)).toBe(false);
  });
});

describe('whenWindowPlaced', () => {
  test('resolves immediately when the window already has a size', async () => {
    const win = popout(playerFrame, {});
    const setTimeout = vi.fn();
    (win as Window & { setTimeout: typeof setTimeout }).setTimeout = setTimeout;

    await whenWindowPlaced(win);

    expect(setTimeout).not.toHaveBeenCalled();
  });

  test('resolves once a new window receives a size', async () => {
    const win = popout({ x: 0, y: 0, width: 0, height: 0 }, {});
    (win as Window & { setTimeout: (fn: () => void) => number }).setTimeout = (fn): number => {
      (win as Window & { outerWidth: number; outerHeight: number }).outerWidth = 800;
      (win as Window & { outerHeight: number }).outerHeight = 600;
      fn();
      return 0;
    };

    await whenWindowPlaced(win);
  });
});
