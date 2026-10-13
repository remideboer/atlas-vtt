/** A desktop screen the player window is on, in physical pixels. */
export interface PlayerDisplay {
  id: string;
  label: string;
  widthPx: number;
  heightPx: number;
}

/** A window rectangle in CSS pixels, the units `moveTo` and `resizeTo` take. */
export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesktopDisplay {
  id: number;
  label: string;
  size: { width: number; height: number };
  scaleFactor: number;
  workArea: WindowFrame;
}

interface DesktopScreen {
  getDisplayMatching(rect: WindowFrame): DesktopDisplay;
  on(event: 'display-metrics-changed', listener: () => void): void;
  removeListener(event: 'display-metrics-changed', listener: () => void): void;
}

/** None until the first lookup, then the desktop screen list or null where there is none. */
let desktop: DesktopScreen | null | undefined;

/**
 * Electron's screen API, loaded when a player window asks for it. None in tests and on a phone.
 * The module is external, so a static import would fail wherever Electron is absent.
 */
export async function prepareDesktopScreen(): Promise<DesktopScreen | null> {
  if (desktop !== undefined) return desktop;
  let loaded: DesktopScreen | null = null;
  try {
    const electron = await import('electron');
    loaded = electron.screen ?? null;
  } catch {
    loaded = null;
  }
  desktop = loaded;
  return loaded;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function placedWindow(win: Window): WindowFrame | null {
  const bounds = { x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight };
  if (!isPositive(bounds.width) || !isPositive(bounds.height)) return null;
  return bounds;
}

/**
 * The screen `win` stands on. Physical pixels are the DIP size times the screen's scale factor.
 * None until `prepareDesktopScreen` has run, or when the window has no size yet.
 */
export function displayMatching(win: Window): PlayerDisplay | null {
  if (!desktop) return null;
  const bounds = placedWindow(win);
  if (!bounds) return null;
  const display = desktop.getDisplayMatching(bounds);
  const scale = display.scaleFactor;
  if (!isPositive(scale) || !isPositive(display.size.width) || !isPositive(display.size.height)) return null;
  return {
    id: String(display.id),
    label: display.label,
    widthPx: Math.round(display.size.width * scale),
    heightPx: Math.round(display.size.height * scale),
  };
}

/**
 * The work area of the screen `win` stands on, in CSS pixels. None until `prepareDesktopScreen`
 * has run, or when the window has no size yet.
 */
export function workAreaMatching(win: Window): WindowFrame | null {
  if (!desktop) return null;
  const bounds = placedWindow(win);
  if (!bounds) return null;
  const area = desktop.getDisplayMatching(bounds).workArea;
  if (!Number.isFinite(area.x) || !Number.isFinite(area.y) || !isPositive(area.width) || !isPositive(area.height)) return null;
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

/**
 * Call `listener` when a screen's resolution or scale changes. None when there is no desktop
 * screen list. The caller compares the window's place itself.
 */
export function watchDisplayMetrics(listener: () => void): (() => void) | null {
  if (!desktop) return null;
  desktop.on('display-metrics-changed', listener);
  return () => desktop?.removeListener('display-metrics-changed', listener);
}
