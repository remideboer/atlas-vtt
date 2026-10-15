import { afterEach, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { HP, STRESS } from '../mocks/resourceFixtures';

afterEach(() => vi.restoreAllMocks());

it('shows players the resources their definitions allow, whatever the DM hides on the map', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as any);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as any);
  const store = createStore(() => ({ tokenSettings: { showNameplates: false, hiddenResources: ['hp', 'stress'] }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as any);
  ui.resourceDefsProvider = () => [{ ...HP, visibleToPlayers: true }, { ...STRESS, visibleToPlayers: false }];
  const token = { id: 'hero', kind: 'character', name: 'Hero', showNameplate: true, statblockPath: 'hero.md',
    resources: { hp: { current: 8, max: 10 }, stress: { current: 2, max: 6 } } } as any;
  const original = store.getState();
  try {
    // The DM hides both bars on this map, and still shows a nameplate the token opted into
    ui.update(token, 70);
    expect(ui.getResourceSlots()).toEqual([]);
    expect((ui as any).nameText.visible).toBe(true);

    ui.update(token, 70, { showTokenNameplates: true });
    expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['hp']);
    expect((ui as any).nameText.visible).toBe(true);

    ui.update(token, 70, { showTokenNameplates: false });
    expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['hp']);
    expect((ui as any).nameText.visible).toBe(false);
    expect(store.getState()).toBe(original);
  } finally { ui.destroy(); }
});

it('shows players a nameplate only when the GM map shows it and their switch is on', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as any);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as any);
  const store = createStore(() => ({ tokenSettings: { showNameplates: false }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as any);
  ui.resourceDefsProvider = () => [{ ...HP, visibleToPlayers: true }];
  const resources = { hp: { current: 8, max: 10 } };
  const unnamed = { id: 'hero', kind: 'character', name: 'Hero', showNameplate: false, resources } as any;
  const optedIn = { ...unnamed, showNameplate: true };
  try {
    ui.update(unnamed, 70, { showTokenNameplates: true });
    expect((ui as any).nameText.visible).toBe(false);

    store.setState({ tokenSettings: { showNameplates: true }, grid: { size: 70 } });
    ui.update(unnamed, 70, { showTokenNameplates: true });
    expect((ui as any).nameText.visible).toBe(true);

    store.setState({ tokenSettings: { showNameplates: false }, grid: { size: 70 } });
    ui.update(optedIn, 70, { showTokenNameplates: true });
    expect((ui as any).nameText.visible).toBe(true);

    ui.update(optedIn, 70, { showTokenNameplates: false });
    expect((ui as any).nameText.visible).toBe(false);

    ui.update({ ...optedIn, hideNameplateFromPlayers: true }, 70);
    expect((ui as any).nameText.visible).toBe(true);
    ui.update({ ...optedIn, hideNameplateFromPlayers: true }, 70, { showTokenNameplates: true });
    expect((ui as any).nameText.visible).toBe(false);
  } finally { ui.destroy(); }
});
