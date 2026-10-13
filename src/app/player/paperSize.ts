import type { GridState } from '../types/gridTypes';
import type { Size } from '../types/playerFrame';

/** A map's size on paper. Width sets the scale when it is filled; height is used only when width is blank. */
export interface PaperSize {
  widthInches?: number;
  heightInches?: number;
}

/** Builds a paper size from optional axes without writing `undefined` (exactOptionalPropertyTypes). */
export function paperSizeOf(widthInches?: number, heightInches?: number): PaperSize {
  const paper: PaperSize = {};
  if (widthInches !== undefined) paper.widthInches = widthInches;
  if (heightInches !== undefined) paper.heightInches = heightInches;
  return paper;
}

/** The axis that sets actual size, and the map pixels that axis covers. Null when neither axis is a positive size. */
export interface PaperSpan {
  inches: number;
  pixels: number;
}

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Width when it is filled, otherwise height. One camera scale cannot honour both axes unless the
 * image has that shape, so the other number is stored and not used for the scale.
 */
export function paperSpan(paper: PaperSize | null | undefined, map: Size | null | undefined): PaperSpan | null {
  if (!paper || !map) return null;
  if (isPositive(paper.widthInches) && isPositive(map.width)) return { inches: paper.widthInches, pixels: map.width };
  if (isPositive(paper.heightInches) && isPositive(map.height)) return { inches: paper.heightInches, pixels: map.height };
  return null;
}

/** True when either axis is a positive size, which is enough to apply the paper size on its own. */
export function hasPaperSize(paper: PaperSize | null | undefined): boolean {
  return isPositive(paper?.widthInches) || isPositive(paper?.heightInches);
}

/**
 * The grid with `paper` written on it. An axis that is not a positive size is removed.
 * The same grid comes back when nothing would change.
 */
export function gridWithPaper(grid: GridState, paper: PaperSize): GridState {
  const width = isPositive(paper.widthInches) ? paper.widthInches : undefined;
  const height = isPositive(paper.heightInches) ? paper.heightInches : undefined;
  if (grid.paperWidthInches === width && grid.paperHeightInches === height) return grid;
  const next = { ...grid };
  if (width === undefined) delete next.paperWidthInches;
  else next.paperWidthInches = width;
  if (height === undefined) delete next.paperHeightInches;
  else next.paperHeightInches = height;
  return next;
}

/** The paper size stored on a scene grid, or null when neither axis is a positive size. */
export function paperFromGrid(grid: Pick<GridState, 'paperWidthInches' | 'paperHeightInches'> | null | undefined): PaperSize | null {
  if (!grid) return null;
  const paper: PaperSize = {};
  if (isPositive(grid.paperWidthInches)) paper.widthInches = grid.paperWidthInches;
  if (isPositive(grid.paperHeightInches)) paper.heightInches = grid.paperHeightInches;
  return paper.widthInches !== undefined || paper.heightInches !== undefined ? paper : null;
}
