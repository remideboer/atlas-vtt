import { describe, expect, it } from 'vitest';
import { fogCoveringMap } from '../../src/app/types/fogTypes';

describe('fog covering the map', () => {
  it('is one paint rectangle over the map image', () => {
    expect(fogCoveringMap({ x: 12, y: -4, width: 1000, height: 800 })).toEqual({
      type: 'rectangle',
      x: 12,
      y: -4,
      width: 1000,
      height: 800,
      isErasing: false,
    });
  });

  it('does nothing when the scene has no map image', () => {
    expect(fogCoveringMap(null)).toBeNull();
    expect(fogCoveringMap({ x: 0, y: 0, width: 0, height: 800 })).toBeNull();
  });
});
