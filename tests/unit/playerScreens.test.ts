import { describe, expect, it } from 'vitest';
import { actualScaleFor, loadPlayerScreens, positiveDecimal, profileFor, savePlayerScreen, screenSetupNeeded } from '../../src/app/player/playerScreens';
import type { PlayerDisplay } from '../../src/app/player/playerDisplays';

function storage(): { loadLocalStorage(key: string): unknown; saveLocalStorage(key: string, value: unknown): void } {
  const data = new Map<string, unknown>();
  return {
    loadLocalStorage: (key) => data.get(key),
    saveLocalStorage: (key, value) => { data.set(key, value); },
  };
}

const DELL: PlayerDisplay = { id: '2', label: 'DELL U2723QE', widthPx: 2560, heightPx: 1440 };

describe('player screen profiles', () => {
  it('fills a new screen from one saved under the same name', () => {
    const saved = savePlayerScreen(storage(), '1', {
      cellInches: 1,
      crisp: false,
      calibration: 1,
      label: 'DELL U2723QE',
      diagonalInches: 27,
      widthPx: 2560,
      heightPx: 1440,
    });
    expect(profileFor(saved, DELL)?.diagonalInches).toBe(27);
    expect(profileFor(saved, { ...DELL, id: '1' })?.diagonalInches).toBe(27);
  });

  it('drops a stored screen that is not a record and keeps a cell size of 1 inch', () => {
    const box = storage();
    box.saveLocalStorage('atlas-vtt:player-screens', { cellInches: 0, screens: { a: 'nope', b: { diagonalInches: 32 } } });
    const loaded = loadPlayerScreens(box);
    expect(loaded.cellInches).toBe(1);
    expect(loaded.screens.a).toBeUndefined();
    expect(loaded.screens.b?.diagonalInches).toBe(32);
  });

  it('scales a 70 pixel cell on a 27 inch screen', () => {
    const settings = savePlayerScreen(storage(), DELL.id, {
      cellInches: 1,
      crisp: false,
      calibration: 1,
      diagonalInches: 27,
    });
    const scale = actualScaleFor({ cellPixels: 70, settings, display: DELL, devicePixelRatio: 1 });
    const ppi = Math.hypot(2560, 1440) / 27;
    expect(scale).toBeCloseTo(ppi / 70, 5);
    expect(actualScaleFor({ cellPixels: undefined, settings, display: DELL, devicePixelRatio: 1 })).toBeNull();
  });

  it('asks for a size when only the resolution is known', () => {
    const empty = { cellInches: 1, screens: {} };
    expect(screenSetupNeeded(empty, DELL)).toBe(true);
    expect(positiveDecimal('27,5')).toBe(27.5);
    expect(positiveDecimal('')).toBeUndefined();
    const saved = savePlayerScreen(storage(), DELL.id, {
      cellInches: 1,
      crisp: false,
      calibration: 1,
      diagonalInches: 27,
    });
    expect(screenSetupNeeded(saved, DELL)).toBe(false);
  });
});
