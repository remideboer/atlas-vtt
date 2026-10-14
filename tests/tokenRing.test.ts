import { describe, it, expect, beforeEach } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../src/app/storeFactory';
import { createInMemoryApp } from './mocks/inMemoryVault';

/** Basic unit tests around token ring colour state */

describe('Token ring colour', () => {
  let store: ViewAtlasStore;

  beforeEach(() => {
    const { app } = createInMemoryApp();
    store = createViewAtlasStore(app, 'token-ring-test');
    store.getState().setPersistenceEnabled(false);
  });

  it('assigns ringColor and turns the ring on via setTokenRing', () => {
    const id = store.getState().addToken({ x: 0, y: 0, imagePath: 'dummy.png', showRing: false });
    store.getState().setTokenRing(id, '#ff0000');
    const token = store.getState().objects.tokens[id];
    expect(token.ringColor).toBe('#ff0000');
    expect(token.showRing).toBe(true);
  });

  it('hides the ring when null (None) is provided', () => {
    const id = store.getState().addToken({ x: 0, y: 0, imagePath: 'dummy.png', ringColor: '#00ff00' });
    store.getState().setTokenRing(id, null);
    const token = store.getState().objects.tokens[id];
    expect(token.ringColor).toBeUndefined();
    expect(token.showRing).toBe(false);
  });
});
