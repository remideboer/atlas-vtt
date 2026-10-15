import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Text, type FillInstruction } from 'pixi.js';
import { contrast } from '../../src/app/pixi/lighting/lightMarker';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** WCAG AA for normal text. */
const AA = 4.5;

const hero = {
  id: 'hero',
  kind: 'character' as const,
  x: 0,
  y: 0,
  imagePath: 'hero.png',
  name: 'Hero',
  showNameplate: true,
};

function setTheme(dark: boolean): void {
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('theme-light', !dark);
}

/** The nameplate as drawn: its text colour, alpha and badge fill. */
function drawnNameplate(dark: boolean): { ink: number; pill: number; alpha: number } {
  setTheme(dark);
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'nameplate-contrast');
  store.setState({
    persistenceEnabled: false,
    tokenSettings: { ...store.getState().tokenSettings, showNameplates: true },
  });
  const ui = new TokenUIRenderer(store);
  try {
    ui.update(hero, 70);
    const nameText = (ui as unknown as { nameText: Text }).nameText;
    const nameBadge = (ui as unknown as { nameBadge: { context: { instructions: Array<{ action: string; data: { style: { color: number } } }> } } }).nameBadge;
    const fill = nameBadge.context.instructions.find(
      (instruction): instruction is FillInstruction => instruction.action === 'fill',
    );
    if (!fill) throw new Error('the nameplate has no fill');
    return {
      ink: Number(nameText.style.fill),
      pill: fill.data.style.color,
      alpha: nameText.alpha,
    };
  } finally {
    ui.destroy();
  }
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
  } as CanvasRenderingContext2D);
  // jsdom cannot measure text; the badge size plays no part in its colours.
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 80, 20));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.classList.remove('theme-dark', 'theme-light');
});

describe('nameplate contrast', () => {
  it('reads at AA in the light theme: black on the light badge grey', () => {
    const { ink, pill, alpha } = drawnNameplate(false);
    expect({ ink, pill, alpha }).toEqual({ ink: 0x000000, pill: 0xe3e3e3, alpha: 1 });
    expect(contrast(ink, pill)).toBeGreaterThanOrEqual(AA);
  });

  it('keeps the dark theme readable: white on the dark badge grey', () => {
    const { ink, pill, alpha } = drawnNameplate(true);
    expect({ ink, pill, alpha }).toEqual({ ink: 0xffffff, pill: 0x2a2a2a, alpha: 1 });
    expect(contrast(ink, pill)).toBeGreaterThanOrEqual(AA);
  });
});
