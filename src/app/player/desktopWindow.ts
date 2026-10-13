import type { WindowFrame } from './playerDisplays';

/** How far a desktop window may sit from the popout and still be the same window, in CSS pixels. */
const BOUNDS_SLOP = 20;
/** How long to wait for a new popout to receive a size before giving up. */
const PLACE_WAIT_MS = 500;
/** Obsidian applies a popout's saved size after it opens; maximize again once that has settled. */
export const RESTORE_WAIT_MS = 150;

/** The slice of Electron's window this file can maximize. The package is not a dependency. */
interface DesktopWindow {
  maximizable: boolean;
  maximize(): void;
  isMaximized(): boolean;
  getBounds(): WindowFrame;
}

interface DesktopRemote {
  getCurrentWindow(): DesktopWindow;
  BrowserWindow: { getAllWindows(): DesktopWindow[] };
}

interface ElectronModule {
  remote?: Partial<DesktopRemote>;
}

function requireIn(win: Window): ((id: string) => unknown) | null {
  const requireFn = (win as Window & { require?: (id: string) => unknown }).require;
  return typeof requireFn === 'function' ? requireFn : null;
}

function remoteFrom(win: Window): DesktopRemote | null {
  const requireFn = requireIn(win);
  if (!requireFn) return null;
  try {
    const electron = requireFn('electron') as ElectronModule;
    const remote = electron.remote;
    if (isRemote(remote)) return remote;
    const named = requireFn('@electron/remote') as Partial<DesktopRemote>;
    return isRemote(named) ? named : null;
  } catch {
    return null;
  }
}

function isRemote(value: Partial<DesktopRemote> | undefined): value is DesktopRemote {
  return typeof value?.getCurrentWindow === 'function' && typeof value.BrowserWindow?.getAllWindows === 'function';
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function samePlace(desktop: DesktopWindow, win: Window): boolean {
  let bounds: WindowFrame;
  try {
    bounds = desktop.getBounds();
  } catch {
    return false;
  }
  return Math.abs(bounds.x - win.screenX) <= BOUNDS_SLOP
    && Math.abs(bounds.y - win.screenY) <= BOUNDS_SLOP
    && Math.abs(bounds.width - win.outerWidth) <= BOUNDS_SLOP
    && Math.abs(bounds.height - win.outerHeight) <= BOUNDS_SLOP;
}

/** The desktop window behind `win`, never some other window that merely shares the process. */
function desktopWindowFor(win: Window): DesktopWindow | null {
  const remote = remoteFrom(win) ?? remoteFrom(window);
  if (!remote) return null;
  try {
    const current = remote.getCurrentWindow();
    if (samePlace(current, win)) return current;
    return remote.BrowserWindow.getAllWindows().find((item) => samePlace(item, win)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Maximize the desktop window `win` belongs to. False when this device has no desktop
 * windows, or none of them stands where `win` stands.
 */
export function maximizeDesktopWindow(win: Window): boolean {
  const desktop = desktopWindowFor(win);
  if (!desktop) return false;
  try {
    desktop.maximizable = true;
  } catch {
    // The window can still be maximized when the flag cannot be changed.
  }
  try {
    desktop.maximize();
    return true;
  } catch {
    return false;
  }
}

/** Resolves once `win` has a size, or after a short wait when it never receives one. */
export function whenWindowPlaced(win: Window): Promise<void> {
  if (win.closed || (isPositive(win.outerWidth) && isPositive(win.outerHeight))) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      if (win.closed || (isPositive(win.outerWidth) && isPositive(win.outerHeight)) || Date.now() - started >= PLACE_WAIT_MS) {
        resolve();
        return;
      }
      win.setTimeout(tick, 16);
    };
    win.setTimeout(tick, 16);
  });
}
