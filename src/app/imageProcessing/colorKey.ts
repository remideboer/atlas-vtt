/** Default RGB Euclidean distance for a few nearby shades of the picked colour. */
export const COLOR_KEY_TOLERANCE = 8;

export interface ColorKey {
  /** Key colour as `0xRRGGBB`. */
  rgb: number;
  /** Euclidean RGB distance that still matches; default {@link COLOR_KEY_TOLERANCE}. */
  tolerance?: number;
}

/**
 * Makes every opaque pixel near the picked colour fully transparent.
 *
 * There is no flood fill: every pixel within tolerance of `key.rgb` is cleared
 * wherever it sits. Cleared pixels are stored as black with alpha 0 so a
 * premultiplied reader does not paint them grey.
 */
export function applyColorKey(data: ImageData, key: ColorKey): void {
  const kr = (key.rgb >> 16) & 0xff;
  const kg = (key.rgb >> 8) & 0xff;
  const kb = key.rgb & 0xff;
  const tolerance = key.tolerance ?? COLOR_KEY_TOLERANCE;
  const toleranceSq = tolerance * tolerance;
  const pixels = data.data;
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p + 3]! === 0) continue;
    const dr = pixels[p]! - kr;
    const dg = pixels[p + 1]! - kg;
    const db = pixels[p + 2]! - kb;
    if (dr * dr + dg * dg + db * db > toleranceSq) continue;
    pixels[p] = 0;
    pixels[p + 1] = 0;
    pixels[p + 2] = 0;
    pixels[p + 3] = 0;
  }
}

/** `#rrggbb` → `0xRRGGBB`, or null when the string is not a hex colour. */
export function parseColorKeyHex(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  return Number.parseInt(match[1]!, 16);
}

/** `0xRRGGBB` as `#rrggbb`. */
export function colorKeyHex(rgb: number): string {
  return `#${(rgb >>> 0).toString(16).padStart(6, '0')}`;
}
