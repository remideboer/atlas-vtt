import { getDomHost } from '../host/dom';
import type { MapPixels } from '../pixi/mapImage/mapImageView';

/** Longest side of the overview sampled for the rim colour. */
const SAMPLE_SIDE = 64;

/** Black when the map has no opaque edge to read. */
export const DEFAULT_OFF_MAP_COLOR = 0x000000;

/**
 * Average RGB of the one-pixel rim of an RGBA buffer. Fully transparent rim pixels are skipped.
 * Null when every rim pixel is transparent or the image has no size.
 */
export function edgeColorFromRgba(width: number, height: number, rgba: Uint8ClampedArray): number | null {
  if (width < 1 || height < 1) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    if (rgba[i + 3]! === 0) return;
    r += rgba[i]!;
    g += rgba[i + 1]!;
    b += rgba[i + 2]!;
    n += 1;
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }
  if (n === 0) return null;
  return ((Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)) >>> 0;
}

/** `0xRRGGBB` as a CSS hex colour. */
export function offMapColorHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** PIXI clear colour for a `0xRRGGBB` sample. */
export function offMapColorRgba(color: number): [number, number, number, number] {
  return [
    ((color >> 16) & 0xff) / 255,
    ((color >> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    1,
  ];
}

/** Predominant colour of the map's edge, from a small overview; null when it has no pixels to read. */
export async function edgeColorForPixels(pixels: MapPixels): Promise<number | null> {
  let bitmap: ImageBitmap | null;
  try {
    bitmap = await pixels.overview(SAMPLE_SIDE);
  } catch (error) {
    console.debug('[Atlas] The map image could not be read for the off-map colour:', error);
    return null;
  }
  if (!bitmap) return null;
  try {
    const canvas = getDomHost().createCanvas(undefined, { width: bitmap.width, height: bitmap.height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return edgeColorFromRgba(width, height, data);
  } catch (error) {
    console.debug('[Atlas] The map image could not be read for the off-map colour:', error);
    return null;
  } finally {
    bitmap.close();
  }
}
