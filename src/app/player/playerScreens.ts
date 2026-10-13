import type { App } from 'obsidian';
import { DEFAULT_CELL_INCHES, pixelsPerInch, cssPixelsPerWorldPixel } from './actualSize';
import type { PlayerDisplay } from './playerDisplays';

/** Screen facts this device remembers. They never sync. */
export const PLAYER_SCREENS_KEY = 'atlas-vtt:player-screens';

/** The profile used when the desktop screen list cannot be read. */
export const MANUAL_DISPLAY_ID = 'manual';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/** What the GM entered for one screen. A higher format's extra fields are left unread. */
export interface PlayerScreenProfile {
  diagonalInches?: number;
  widthMm?: number;
  heightMm?: number;
  /** Multiplier on the estimated PPI. Absent is 1. */
  calibration?: number;
  label?: string;
  crisp?: boolean;
  /** Physical pixels, kept when the screen list could not be read. */
  widthPx?: number;
  heightPx?: number;
}

export interface PlayerScreenSettings {
  cellInches: number;
  screens: Record<string, PlayerScreenProfile>;
}

/** What the screen setup saves. */
export interface PlayerScreenDraft {
  cellInches: number;
  crisp: boolean;
  calibration: number;
  label?: string;
  diagonalInches?: number;
  widthMm?: number;
  heightMm?: number;
  widthPx?: number;
  heightPx?: number;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isFinite(1 / value);
}

function readOptional(record: object, key: string): number | undefined {
  if (!(key in record)) return undefined;
  const value = (record as Record<string, unknown>)[key];
  return isPositive(value) ? value : undefined;
}

function readProfile(value: unknown): PlayerScreenProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const profile: PlayerScreenProfile = {};
  const diagonalInches = readOptional(value, 'diagonalInches');
  const widthMm = readOptional(value, 'widthMm');
  const heightMm = readOptional(value, 'heightMm');
  const calibration = readOptional(value, 'calibration');
  const widthPx = readOptional(value, 'widthPx');
  const heightPx = readOptional(value, 'heightPx');
  if (diagonalInches !== undefined) profile.diagonalInches = diagonalInches;
  if (widthMm !== undefined) profile.widthMm = widthMm;
  if (heightMm !== undefined) profile.heightMm = heightMm;
  if (calibration !== undefined) profile.calibration = calibration;
  if (widthPx !== undefined) profile.widthPx = widthPx;
  if (heightPx !== undefined) profile.heightPx = heightPx;
  if ('label' in value && typeof value.label === 'string' && value.label.length > 0) profile.label = value.label;
  if ('crisp' in value && value.crisp === true) profile.crisp = true;
  return profile;
}

/** A typed number, accepting a decimal comma. Empty or not positive is none. */
export function positiveDecimal(text: string): number | undefined {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** A diagonal, or both sides in millimetres, is enough to compute a PPI. */
export function hasPhysicalSize(profile: PlayerScreenProfile | null): profile is PlayerScreenProfile {
  if (!profile) return false;
  if (profile.diagonalInches !== undefined) return true;
  return profile.widthMm !== undefined && profile.heightMm !== undefined;
}

/** The player screens stored on this device. Anything unreadable is the default cell of 1 inch. */
export function loadPlayerScreens(storage: DeviceStorage): PlayerScreenSettings {
  try {
    const stored: unknown = storage.loadLocalStorage(PLAYER_SCREENS_KEY);
    if (typeof stored !== 'object' || stored === null) return { cellInches: DEFAULT_CELL_INCHES, screens: {} };
    const cellInches = 'cellInches' in stored && isPositive(stored.cellInches) ? stored.cellInches : DEFAULT_CELL_INCHES;
    const screens: Record<string, PlayerScreenProfile> = {};
    if ('screens' in stored && typeof stored.screens === 'object' && stored.screens !== null) {
      for (const [id, value] of Object.entries(stored.screens)) {
        const profile = readProfile(value);
        if (profile) screens[id] = profile;
      }
    }
    return { cellInches, screens };
  } catch (error) {
    console.error('[Atlas] Could not read the player screens of this device', error);
    return { cellInches: DEFAULT_CELL_INCHES, screens: {} };
  }
}

function profileFromDraft(draft: PlayerScreenDraft): PlayerScreenProfile {
  const profile: PlayerScreenProfile = {};
  if (draft.diagonalInches !== undefined) profile.diagonalInches = draft.diagonalInches;
  if (draft.widthMm !== undefined) profile.widthMm = draft.widthMm;
  if (draft.heightMm !== undefined) profile.heightMm = draft.heightMm;
  if (draft.calibration > 0 && draft.calibration !== 1) profile.calibration = draft.calibration;
  if (draft.label) profile.label = draft.label;
  if (draft.crisp) profile.crisp = true;
  if (draft.widthPx !== undefined) profile.widthPx = draft.widthPx;
  if (draft.heightPx !== undefined) profile.heightPx = draft.heightPx;
  return profile;
}

/** A draft that stores `profile` again, under a screen name when `label` is set. */
export function draftOf(profile: PlayerScreenProfile, cellInches: number, label?: string): PlayerScreenDraft {
  const name = label || profile.label;
  return {
    cellInches,
    crisp: profile.crisp === true,
    calibration: profile.calibration ?? 1,
    ...(profile.diagonalInches !== undefined ? { diagonalInches: profile.diagonalInches } : {}),
    ...(profile.widthMm !== undefined ? { widthMm: profile.widthMm } : {}),
    ...(profile.heightMm !== undefined ? { heightMm: profile.heightMm } : {}),
    ...(profile.widthPx !== undefined ? { widthPx: profile.widthPx } : {}),
    ...(profile.heightPx !== undefined ? { heightPx: profile.heightPx } : {}),
    ...(name ? { label: name } : {}),
  };
}

/** Remember `draft` for `id` and the cell size it carries. */
export function savePlayerScreen(storage: DeviceStorage, id: string, draft: PlayerScreenDraft): PlayerScreenSettings {
  const settings = loadPlayerScreens(storage);
  settings.cellInches = isPositive(draft.cellInches) ? draft.cellInches : DEFAULT_CELL_INCHES;
  settings.screens[id] = profileFromDraft(draft);
  try {
    storage.saveLocalStorage(PLAYER_SCREENS_KEY, settings);
  } catch (error) {
    console.error('[Atlas] Could not save the player screens of this device', error);
  }
  return settings;
}

/**
 * The profile for `display`: its own when that has a size, else one saved under the same
 * screen name. With no display, the manual profile.
 */
export function profileFor(settings: PlayerScreenSettings, display: PlayerDisplay | null): PlayerScreenProfile | null {
  if (!display) return settings.screens[MANUAL_DISPLAY_ID] ?? null;
  const own = settings.screens[display.id];
  if (own && hasPhysicalSize(own)) return own;
  if (display.label) {
    for (const profile of Object.values(settings.screens)) {
      if (profile.label === display.label && hasPhysicalSize(profile)) return profile;
    }
  }
  return own ?? null;
}

/** Physical pixels the scale is computed from: the live screen, else the pixels stored with the profile. */
export function screenPixels(
  display: PlayerDisplay | null,
  profile: PlayerScreenProfile | null,
): { width: number; height: number } | null {
  if (display && isPositive(display.widthPx) && isPositive(display.heightPx)) {
    return { width: display.widthPx, height: display.heightPx };
  }
  if (profile?.widthPx !== undefined && profile.heightPx !== undefined) {
    return { width: profile.widthPx, height: profile.heightPx };
  }
  return null;
}

/**
 * Actual size still needs the screen dialog. A detected resolution is not a physical size:
 * the diagonal or both millimetre sides have to be entered, and so do the pixels when no
 * screen list supplied them.
 */
export function screenSetupNeeded(settings: PlayerScreenSettings, display: PlayerDisplay | null): boolean {
  const profile = profileFor(settings, display);
  return !hasPhysicalSize(profile) || screenPixels(display, profile) === null;
}

/**
 * CSS pixels per world pixel for `cellPixels` on this screen. None when the grid or the screen
 * has no size.
 */
export function actualScaleFor(input: {
  cellPixels: number | undefined;
  settings: PlayerScreenSettings;
  display: PlayerDisplay | null;
  devicePixelRatio: number;
}): number | null {
  const profile = profileFor(input.settings, input.display);
  const pixels = screenPixels(input.display, profile);
  if (!profile || !pixels || input.cellPixels === undefined) return null;
  const ppi = pixelsPerInch({
    widthPx: pixels.width,
    heightPx: pixels.height,
    ...(profile.diagonalInches !== undefined ? { diagonalInches: profile.diagonalInches } : {}),
    ...(profile.widthMm !== undefined ? { widthMm: profile.widthMm } : {}),
    ...(profile.heightMm !== undefined ? { heightMm: profile.heightMm } : {}),
    ...(profile.calibration !== undefined ? { calibration: profile.calibration } : {}),
  });
  if (ppi === null) return null;
  return cssPixelsPerWorldPixel(input.cellPixels, input.settings.cellInches, ppi, input.devicePixelRatio);
}
