import { describe, expect, it } from 'vitest';
import { edgeColorFromRgba, offMapColorHex, offMapColorRgba } from '../../src/app/player/mapEdgeColor';

/** RGBA bytes for a `width` × `height` image filled with `fill`, then rim painted with `rim`. */
function rimImage(width: number, height: number, fill: [number, number, number, number], rim: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onRim = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const pixel = onRim ? rim : fill;
      const i = (y * width + x) * 4;
      data[i] = pixel[0];
      data[i + 1] = pixel[1];
      data[i + 2] = pixel[2];
      data[i + 3] = pixel[3];
    }
  }
  return data;
}

describe('edgeColorFromRgba', () => {
  it('averages the rim and ignores the centre', () => {
    // Green rim, red centre: the off-map colour follows the edge.
    expect(edgeColorFromRgba(4, 4, rimImage(4, 4, [255, 0, 0, 255], [0, 200, 0, 255]))).toBe(0x00c800);
  });

  it('skips transparent rim pixels', () => {
    const data = rimImage(3, 3, [0, 0, 0, 0], [10, 20, 30, 255]);
    // Clear the top row so only the remaining rim counts.
    for (let x = 0; x < 3; x++) {
      const i = x * 4;
      data[i + 3] = 0;
    }
    expect(edgeColorFromRgba(3, 3, data)).toBe(0x0a141e);
  });

  it('returns null when every rim pixel is transparent', () => {
    expect(edgeColorFromRgba(2, 2, rimImage(2, 2, [1, 2, 3, 255], [0, 0, 0, 0]))).toBeNull();
  });
});

describe('offMapColor helpers', () => {
  it('writes a CSS hex and a PIXI clear colour', () => {
    expect(offMapColorHex(0x0a141e)).toBe('#0a141e');
    expect(offMapColorRgba(0xff0000)).toEqual([1, 0, 0, 1]);
  });
});
