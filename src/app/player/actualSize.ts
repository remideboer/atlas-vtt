/** One inch in millimetres. */
export const MM_PER_INCH = 25.4;

/** Physical size of one grid cell when the GM has not chosen another. */
export const DEFAULT_CELL_INCHES = 1;

/** Diagonals offered in the screen setup, in inches. */
export const DIAGONAL_PRESETS = [24, 27, 32, 43, 55] as const;

/** The square drawn on the player screen while the GM measures it, in inches. */
export const CALIBRATION_INCHES = 2;

/** A number a size or a ratio can be: positive, finite, and safe to divide by. */
function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isFinite(1 / value);
}

/**
 * Physical pixels per inch. Width and height in millimetres win over the diagonal when both
 * are set: `widthPx / (widthMm / 25.4)`. Otherwise the diagonal and the pixel resolution,
 * whose shape is the screen's own. `calibration` multiplies the result; absent is 1.
 * None when the size is missing or not a real length.
 */
export function pixelsPerInch(screen: {
  widthPx: number;
  heightPx: number;
  diagonalInches?: number;
  widthMm?: number;
  heightMm?: number;
  calibration?: number;
}): number | null {
  const { widthPx, heightPx, diagonalInches, widthMm, heightMm } = screen;
  let ppi: number | null = null;
  if (widthMm !== undefined && heightMm !== undefined && isPositive(widthMm) && isPositive(heightMm) && isPositive(widthPx)) {
    ppi = widthPx / (widthMm / MM_PER_INCH);
  } else if (diagonalInches !== undefined && isPositive(diagonalInches) && isPositive(widthPx) && isPositive(heightPx)) {
    ppi = Math.hypot(widthPx, heightPx) / diagonalInches;
  }
  if (ppi === null) return null;
  const calibration = screen.calibration ?? 1;
  return isPositive(calibration) ? ppi * calibration : null;
}

/**
 * How far a measurement moves the PPI. A square that was meant to be `expectedInches` and
 * measured `measuredInches` multiplies the PPI by `expected / measured`.
 */
export function calibrationFactor(expectedInches: number, measuredInches: number): number | null {
  if (!isPositive(expectedInches) || !isPositive(measuredInches)) return null;
  return expectedInches / measuredInches;
}

/**
 * CSS pixels of the player window per world pixel, so one grid cell of `cellPixels` world
 * pixels is `cellInches` on the screen. The window's `devicePixelRatio` turns physical pixels
 * into CSS pixels. None when any input is not a real size.
 */
export function cssPixelsPerWorldPixel(
  cellPixels: number,
  cellInches: number,
  ppi: number,
  devicePixelRatio: number,
): number | null {
  if (!isPositive(cellPixels) || !isPositive(cellInches) || !isPositive(ppi) || !isPositive(devicePixelRatio)) return null;
  return (cellInches * ppi) / cellPixels / devicePixelRatio;
}

/** How many cells of `cellInches` fit along `pixels` physical pixels. */
export function cellsAlong(pixels: number, cellInches: number, ppi: number): number | null {
  if (!isPositive(pixels) || !isPositive(cellInches) || !isPositive(ppi)) return null;
  return pixels / (cellInches * ppi);
}

/** CSS pixels of a square that should measure `inches` at `ppi`. */
export function calibrationSquareCssPixels(inches: number, ppi: number, devicePixelRatio: number): number | null {
  if (!isPositive(inches) || !isPositive(ppi) || !isPositive(devicePixelRatio)) return null;
  return (inches * ppi) / devicePixelRatio;
}
