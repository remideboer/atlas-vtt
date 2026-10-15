import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';

vi.mock('../../src/app/pixi/token-renderer/InstanceBadge', () => ({
  updateInstanceBadge: (tokenGroup: Container, instanceNumber: number, size: number, visible: boolean): void => {
    let badge = tokenGroup.getChildByLabel('instanceBadge');
    if (!badge) {
      badge = new Container();
      badge.label = 'instanceBadge';
      tokenGroup.addChild(badge);
    }
    badge.visible = visible;
    Object.assign(badge, { instanceNumber, badgeSize: size });
  },
}));

interface StampedRing extends Graphics { ringSize: number }
interface StampedBadge extends Container { instanceNumber: number; badgeSize: number }

function stampRing(container: Container, color: string, size: number): StampedRing {
  const ring = new Graphics() as StampedRing;
  ring.label = 'tokenRing';
  ring.tint = Number.parseInt(color.replace('#', ''), 16);
  ring.ringSize = size;
  container.addChild(ring);
  return ring;
}

function ringHarness(tokens: Record<string, object>, sprites: Record<string, Container>, tokenRingSize = 1): {
  tokenRings: Record<string, StampedRing>;
} {
  return Object.assign(Object.create(TokenRenderer.prototype) as object, {
    spriteFactory: { createTokenRing: stampRing, updateTokenSize: (): void => undefined },
    downedTokenOverlay: { refresh: (): void => undefined },
    store: { getState: () => ({
      tokenSettings: { showNameplates: false, hiddenResources: [], tokenRingSize, showInstanceBadges: true },
      objects: { tokens },
    }) },
    tokenRings: {} as Record<string, StampedRing>,
    tokenSprites: sprites,
    gridSystem: { getOptions: () => ({ size: 70, type: 'square' }) },
    uiManager: { syncUIScale: (): void => undefined },
    notifyPlayersView: (): void => undefined,
  });
}

describe('TokenRenderer ring updates', () => {
  it('keeps the ring at the token\'s colour and the size the settings give it', () => {
    const tokenGroup = new Container();
    const harness = ringHarness({
      tokenA: { id: 'tokenA', imagePath: 'shared.png', instanceNumber: 2 },
      tokenB: { id: 'tokenB', imagePath: 'shared.png', instanceNumber: 1 },
    }, { tokenA: tokenGroup }, 1.4);

    (TokenRenderer.prototype as unknown as { updateTokenRing(...args: unknown[]): void }).updateTokenRing.call(
      harness, 'tokenA', tokenGroup, 120, '#00ff99',
    );

    const ring = tokenGroup.getChildByLabel('tokenRing') as StampedRing;
    expect(ring).toBe(harness.tokenRings.tokenA);
    expect(ring.tint).toBe(0x00ff99);
    expect(ring.ringSize).toBe(168);
    const badge = tokenGroup.getChildByLabel('instanceBadge') as StampedBadge;
    expect(badge.visible).toBe(true);
    expect(badge.instanceNumber).toBe(2);
    expect(badge.badgeSize).toBe(168);
  });

  it('still draws a ring when the token has no colour of its own', () => {
    const tokenId = 'token-default-ring';
    const tokenGroup = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    sprite.label = 'tokenSprite';
    tokenGroup.addChild(sprite);
    const harness = ringHarness({
      [tokenId]: { id: tokenId, kind: 'character', imagePath: 'atlas-vtt/assets/foo.webp', size: 1 },
    }, { [tokenId]: tokenGroup });

    (TokenRenderer.prototype as unknown as { updateAllTokenSizes(): void }).updateAllTokenSizes.call(harness);

    const ring = tokenGroup.getChildByLabel('tokenRing') as StampedRing;
    expect(ring).toBe(harness.tokenRings[tokenId]);
    expect(ring.tint).toBe(0xffffff);
    expect(ring.ringSize).toBe(computeTokenPixelSize(70, 1));
  });
});

describe('TokenRenderer and the collection of its map', () => {
  const harness = (isDestroyed: boolean) => ({
    isDestroyed,
    uiManager: { refreshConditions: vi.fn(), refreshResources: vi.fn() },
    fillMissingResources: vi.fn(),
  });

  it('redraws conditions and resources and starts missing ones once the collection\'s rules are known or change', () => {
    const renderer = harness(false);
    (TokenRenderer.prototype as any).refreshCollectionRules.call(renderer);
    expect(renderer.uiManager.refreshConditions).toHaveBeenCalledOnce();
    expect(renderer.uiManager.refreshResources).toHaveBeenCalledOnce();
    expect(renderer.fillMissingResources).toHaveBeenCalledOnce();
  });

  it('does nothing after the view closed', () => {
    const renderer = harness(true);
    (TokenRenderer.prototype as any).refreshCollectionRules.call(renderer);
    expect(renderer.uiManager.refreshResources).not.toHaveBeenCalled();
    expect(renderer.fillMissingResources).not.toHaveBeenCalled();
  });
});
