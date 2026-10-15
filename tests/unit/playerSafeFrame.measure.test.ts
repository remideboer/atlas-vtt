import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FRAME, fakePlayerFrames, fakeViewport } from '../mocks/playerFrameSource';

const SETTINGS = { showTokenNameplates: true } as never;

/** The orchestrator with only what a player frame and a picture of the scene read. */
function harness(options: { tokens?: boolean; lighting?: boolean } = {}): {
  renderer: PixiRendererOrchestrator;
  hero: { visible: boolean };
  goblin: { visible: boolean };
  sight: (id: string) => 'seen' | 'unseen';
  seenInFrame: (id: string) => boolean;
} {
  const hero = { visible: true };
  const goblin = { visible: true };
  const sight = (id: string): 'seen' | 'unseen' => (id === 'hero' ? 'seen' : 'unseen');
  const seenInFrame = (id: string): boolean => id === 'hero';
  const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: fakeViewport },
    playerFrames: fakePlayerFrames(),
    tokenRenderer: options.tokens === false ? undefined : { getPlayerViewLayers: () => [], getGmViewLayers: () => [], playersSeeInFrame: () => seenInFrame },
    measureRenderer: {
      getPlayerViewLayers: (seen: (id: string) => boolean): LayerVisibility[] => [
        { layer: hero, visible: seen('hero') },
        { layer: goblin, visible: seen('goblin') },
      ],
      getGmViewLayers: (): LayerVisibility[] => [{ layer: hero, visible: true }, { layer: goblin, visible: true }],
    },
    dmScreenOverlays: new Set(),
    lightingFeature: options.lighting ? { controller: { playerSight: () => sight, playerLayers: (): LayerVisibility[] => [] } } : undefined,
  });
  return { renderer, hero, goblin, sight, seenInFrame };
}

describe('withPlayerSafeFrame and the measurements', () => {
  it('hides a measurement of a token the players do not see, and keeps one they do see', () => {
    const { renderer, hero, goblin } = harness({ lighting: true });
    const during: boolean[] = [];
    renderer.withPlayerSafeFrame(() => during.push(hero.visible, goblin.visible), SETTINGS, FRAME);
    expect(during).toEqual([true, false]);
    expect([hero.visible, goblin.visible]).toEqual([true, true]);
  });

  it('hides every measurement while there is no token renderer', () => {
    const { renderer, hero, goblin } = harness({ tokens: false });
    const during: boolean[] = [];
    renderer.withPlayerSafeFrame(() => during.push(hero.visible, goblin.visible), SETTINGS, FRAME);
    expect(during).toEqual([false, false]);
    expect([hero.visible, goblin.visible]).toEqual([true, true]);
  });

  it('keeps the measurements as the GM sees them in a picture of the scene', () => {
    const { renderer, hero, goblin } = harness();
    hero.visible = false;
    goblin.visible = false;
    const during = renderer.captureSceneFrame({} as never, () => hero.visible && goblin.visible);
    expect(during).toBe(true);
    expect(hero.visible).toBe(false);
    expect(goblin.visible).toBe(false);
  });
});

describe('the measure renderer\'s wiring', () => {
  it('reads the tokens when asked, follows the players\' view and subscribes once', () => {
    const listeners: Array<() => void> = [];
    const unsubscribe = vi.fn();
    const refreshVisibility = vi.fn();
    const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
      obsApp: createInMemoryApp().app,
      store: { getState: () => ({ objects: { tokens: {} }, tokenSettings: { tokenRingSize: 1 } }) },
      gridSystem: { getOptions: () => ({ size: 70 }) },
      tokenRenderer: { onPlayersViewChange: vi.fn((listener: () => void) => { listeners.push(listener); return unsubscribe; }) },
      measureRenderer: { refreshVisibility, playersView: null },
    });
    const wire = (renderer as unknown as { wireMeasureRendererProvider(): void }).wireMeasureRendererProvider.bind(renderer);
    wire();
    wire();
    expect(listeners).toHaveLength(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    listeners[1]!();
    expect(refreshVisibility).toHaveBeenCalledTimes(1);
    expect((renderer as unknown as { measureRenderer: { playersView: unknown } }).measureRenderer.playersView).not.toBeNull();
  });
});

describe('measurePlayersView', () => {
  const store = {
    getState: () => ({
      objects: { tokens: { goblin: { id: 'goblin', kind: 'token', imagePath: '', x: 100, y: 100, size: 1, isHidden: true } } },
      tokenSettings: { tokenRingSize: 1.5 },
    }),
  } as never;

  it('places every token at its sprite and ring size, and asks the tokens\' sight only when called', () => {
    const lighting = vi.fn(() => undefined);
    const seenOnCanvas = (): boolean => true;
    const tokens = {
      getTokenSprites: () => ({ goblin: { x: 120, y: 100 } }),
      playersSeeInFrame: vi.fn(() => () => false),
      playersSeeOnCanvas: vi.fn(() => seenOnCanvas),
    };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => tokens as never, lighting });
    expect(lighting).not.toHaveBeenCalled();
    const radius = (computeTokenPixelSize(70, 1) / 2) * 1.5;
    expect(view.footprints()).toEqual([{ id: 'goblin', x: 120, y: 100, radius }, { id: 'goblin', x: 100, y: 100, radius }]);
    view.seenAtStart();
    expect(lighting).toHaveBeenCalledTimes(1);
    expect(tokens.playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(view.seenOnCanvas()).toBe(seenOnCanvas);
  });

  it('fails closed without a token renderer: nothing seen in a frame, the GM view on the canvas', () => {
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => undefined, lighting: () => undefined });
    expect(view.seenAtStart()('goblin')).toBe(false);
    expect(view.seenOnCanvas()).toBeNull();
  });
});
