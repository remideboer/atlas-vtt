import { describe, expect, it } from 'vitest';
import { TOKEN_SIZE_OPTIONS, tokenDiameterInCells, tokenSizeFromCreatureSize } from '../../src/app/pixi/token-renderer/tokenSizing';

describe('token size options', () => {
  it('names the footprint each stored multiplier renders', () => {
    expect(tokenDiameterInCells(0.5)).toBe(0.5);
    for (const option of TOKEN_SIZE_OPTIONS) {
      const cells = tokenDiameterInCells(option.size);
      const footprint = cells === 0.5 ? '½×½' : `${cells}×${cells}`;
      expect(option.label).toContain(footprint);
    }
  });

  it('maps creature size words to stored multipliers and ignores unknown values', () => {
    expect(tokenSizeFromCreatureSize('Large')).toBe(1.5);
    expect(tokenSizeFromCreatureSize(' huge or larger ')).toBe(2);
    expect(tokenSizeFromCreatureSize('Tiny')).toBe(0.5);
    expect(tokenSizeFromCreatureSize('Small')).toBe(1);
    expect(tokenSizeFromCreatureSize('Colossal')).toBeUndefined();
    expect(tokenSizeFromCreatureSize(undefined)).toBeUndefined();
  });
});
