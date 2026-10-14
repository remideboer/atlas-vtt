import { describe, expect, it } from 'vitest';
import {
  applyColorKey,
  colorKeyHex,
  COLOR_KEY_TOLERANCE,
  parseColorKeyHex,
} from '../../src/app/imageProcessing/colorKey';

function image(width: number, height: number, values: number[]): ImageData {
  const data = new Uint8ClampedArray(values);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

function rgba(values: number[]): ImageData {
  return image(values.length / 4, 1, values);
}

function alphaAt(img: ImageData, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]!;
}

describe('parseColorKeyHex / colorKeyHex', () => {
  it('round-trips a hex colour', () => {
    expect(parseColorKeyHex('#ff8800')).toBe(0xff8800);
    expect(colorKeyHex(0xff8800)).toBe('#ff8800');
  });

  it('rejects malformed colours', () => {
    expect(parseColorKeyHex('ff8800')).toBeNull();
    expect(parseColorKeyHex('#fff')).toBeNull();
    expect(parseColorKeyHex('')).toBeNull();
  });
});

describe('applyColorKey', () => {
  it('makes an exact edge match fully transparent on an opaque image', () => {
    const img = image(2, 1, [255, 0, 0, 255, 0, 255, 0, 255]);
    applyColorKey(img, { rgb: 0xff0000, tolerance: 0 });
    expect([...img.data]).toEqual([0, 0, 0, 0, 0, 255, 0, 255]);
  });

  it('leaves colours beyond tolerance unchanged', () => {
    const img = rgba([0, 0, 255, 200]);
    applyColorKey(img, { rgb: 0xff0000 });
    expect([...img.data]).toEqual([0, 0, 255, 200]);
  });

  it('skips already-transparent pixels and leaves non-key alpha alone', () => {
    const img = image(2, 1, [255, 255, 255, 0, 0, 128, 0, 200]);
    applyColorKey(img, { rgb: 0xffffff });
    expect([...img.data]).toEqual([255, 255, 255, 0, 0, 128, 0, 200]);
  });

  it('keys matching pixels wherever they sit', () => {
    const img = image(3, 1, [
      0, 0, 0, 0,
      255, 255, 255, 255,
      0, 255, 0, 255,
    ]);
    applyColorKey(img, { rgb: 0xffffff, tolerance: 0 });
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 1, 0)).toBe(0);
    expect(alphaAt(img, 2, 0)).toBe(255);
  });

  it('keys matching pixels even when a dark rim separates them from existing transparency', () => {
    const W = [255, 255, 255, 255];
    const K = [0, 0, 0, 255];
    const img = image(5, 5, [
      ...W, ...W, ...W, ...W, ...W,
      ...W, ...K, ...K, ...K, ...W,
      ...W, ...K, ...W, ...K, ...W,
      ...W, ...K, ...K, ...K, ...W,
      ...W, ...W, ...W, ...W, ...W,
    ]);
    applyColorKey(img, { rgb: 0xffffff, tolerance: 0 });
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 2, 2)).toBe(0);
    expect(alphaAt(img, 1, 1)).toBe(255);
  });

  it('does not key a pale interior farther than the default tolerance', () => {
    const white = [255, 255, 255, 255];
    const dark = [20, 20, 20, 255];
    const pale = [240, 240, 240, 255];
    const rows: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const edge = x === 0 || y === 0 || x === 4 || y === 4;
        const frame = !edge && (x === 1 || y === 1 || x === 3 || y === 3);
        rows.push(...(edge ? white : frame ? dark : pale));
      }
    }
    const img = image(5, 5, rows);
    applyColorKey(img, { rgb: 0xffffff });
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 2, 2)).toBe(255);
    expect(alphaAt(img, 1, 1)).toBe(255);
  });

  it('clears a few nearby shades of the picked colour, but not farther ones', () => {
    const near = COLOR_KEY_TOLERANCE;
    const img = image(2, 1, [
      255 - near, 255, 255, 255,
      255 - near - 1, 255, 255, 180,
    ]);
    applyColorKey(img, { rgb: 0xffffff });
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 1, 0)).toBe(180);
  });
});
