import { describe, expect, it } from 'vitest';
import {
  calibrationFactor,
  calibrationSquareCssPixels,
  cellsAlong,
  cssPixelsPerWorldPixel,
  pixelsPerInch,
} from '../../src/app/player/actualSize';

describe('actual size', () => {
  it('reads PPI from the diagonal and the pixel resolution', () => {
    expect(pixelsPerInch({ widthPx: 2560, heightPx: 1440, diagonalInches: 27 })).toBeCloseTo(108.8, 1);
    expect(pixelsPerInch({ widthPx: 3840, heightPx: 2160, diagonalInches: 32 })).toBeCloseTo(137.7, 1);
  });

  it('does not treat an ultrawide as 16:9', () => {
    const ultrawide = pixelsPerInch({ widthPx: 3440, heightPx: 1440, diagonalInches: 34 });
    const sixteenByNine = pixelsPerInch({ widthPx: 2560, heightPx: 1440, diagonalInches: 34 });
    expect(ultrawide).not.toBeCloseTo(sixteenByNine ?? 0, 0);
  });

  it('prefers width and height in millimetres over the diagonal', () => {
    const ppi = pixelsPerInch({
      widthPx: 2560,
      heightPx: 1440,
      diagonalInches: 27,
      widthMm: 600,
      heightMm: 340,
    });
    expect(ppi).toBeCloseTo(2560 / (600 / 25.4), 5);
  });

  it('halves the CSS scale when each CSS pixel is two physical pixels', () => {
    const ppi = pixelsPerInch({ widthPx: 2560, heightPx: 1440, diagonalInches: 27 });
    const once = cssPixelsPerWorldPixel(70, 1, ppi ?? 0, 1);
    const twice = cssPixelsPerWorldPixel(70, 1, ppi ?? 0, 2);
    expect(twice).toBeCloseTo((once ?? 0) / 2, 5);
  });

  it('multiplies the PPI by a ruler measurement', () => {
    const raw = pixelsPerInch({ widthPx: 2560, heightPx: 1440, diagonalInches: 27 });
    const factor = calibrationFactor(2, 2.2);
    const calibrated = pixelsPerInch({
      widthPx: 2560,
      heightPx: 1440,
      diagonalInches: 27,
      calibration: factor ?? 0,
    });
    expect(factor).toBeCloseTo(2 / 2.2, 5);
    expect(calibrated).toBeCloseTo((raw ?? 0) * (factor ?? 0), 5);
  });

  it('counts the squares a 27 inch screen can hold at one inch', () => {
    const ppi = pixelsPerInch({ widthPx: 2560, heightPx: 1440, diagonalInches: 27 });
    expect(cellsAlong(2560, 1, ppi ?? 0)).toBeCloseTo(23.5, 1);
    expect(cellsAlong(1440, 1, ppi ?? 0)).toBeCloseTo(13.2, 1);
  });

  it('returns none for a missing grid, screen or ratio, and does not throw', () => {
    expect(pixelsPerInch({ widthPx: 100, heightPx: 100 })).toBeNull();
    expect(pixelsPerInch({ widthPx: 0, heightPx: 100, diagonalInches: 27 })).toBeNull();
    expect(cssPixelsPerWorldPixel(0, 1, 100, 1)).toBeNull();
    expect(cssPixelsPerWorldPixel(70, 1, 100, 0)).toBeNull();
    expect(calibrationFactor(2, 0)).toBeNull();
    expect(calibrationSquareCssPixels(2, 100, 0)).toBeNull();
    expect(cellsAlong(0, 1, 100)).toBeNull();
  });
});
