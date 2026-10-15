/**
 * Drawing shared by the measure tool and the token drag ruler: the accent
 * path, its point markers, the measured shapes and the distance label on a pill.
 */

import { Text, type Graphics } from 'pixi.js';
import type { Point } from '../../grid/hexGeometry';
import { canvasBadgeColors, isDarkTheme } from './canvasBadgeColors';

/** The shapes the measure tool draws; a sphere is drawn as a circle. */
export type MeasureShape = 'line' | 'cone' | 'circle' | 'sphere';

/** A measurement as data: its shape, where it starts and where it was dragged to, in world pixels. */
export interface MeasureRecord {
  readonly shape: MeasureShape;
  readonly start: Point;
  readonly end: Point;
}

const POINT_RADIUS = 8;
const LABEL_FONT_SIZE = 16;

/** A zoom the drawing can divide by; anything else is treated as 1. */
function zoomOf(viewportScale: number): number {
  return viewportScale > 0 && Number.isFinite(viewportScale) ? viewportScale : 1;
}

/** World pixels that cover `screenPixels` at the current zoom, so a mark stays one size on screen. */
function worldPixels(screenPixels: number, viewportScale: number): number {
  return screenPixels / zoomOf(viewportScale);
}

/** A world coordinate snapped onto a whole screen pixel. */
function onScreenPixel(world: number, viewportScale: number): number {
  const zoom = zoomOf(viewportScale);
  return Math.round(world * zoom) / zoom;
}

/** A polyline with a soft shadow, an accent body and a bright core. */
export function drawMeasurePath(graphics: Graphics, color: number, points: readonly Point[], viewportScale = 1): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  const layers = [
    { width: worldPixels(6, viewportScale), color: 0x000000, alpha: 0.3 },
    { width: worldPixels(4, viewportScale), color, alpha: 0.8 },
    { width: worldPixels(2, viewportScale), color, alpha: 1 },
  ];
  for (const stroke of layers) {
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke(stroke);
  }
}

/** The point halfway along the path's length, where its distance label goes. */
export function pathMidpoint(points: readonly Point[]): Point | null {
  const segments = points.slice(1).map((end, i) => {
    const start = points[i]!;
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
  let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
  for (const { start, end, length } of segments) {
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    remaining -= length;
  }
  return points[0] ?? null;
}

/** Accent dot marking where a measurement starts, turns or ends. */
export function drawMeasurePoint(graphics: Graphics, color: number, point: Point, viewportScale = 1): void {
  const radius = worldPixels(POINT_RADIUS, viewportScale);
  const halo = worldPixels(3, viewportScale);
  graphics.circle(point.x, point.y, radius + halo).fill({ color: 0x000000, alpha: 0.3 });
  graphics.circle(point.x, point.y, radius).fill({ color, alpha: 0.9 });
  graphics.circle(point.x, point.y, Math.max(0, radius - worldPixels(1, viewportScale)))
    .stroke({ width: worldPixels(2, viewportScale), color, alpha: 1 });
}

/** A circular area around `center`: a translucent fill, an accent outline and a bright inner ring. */
export function drawMeasureCircle(graphics: Graphics, color: number, center: Point, radius: number, viewportScale = 1): void {
  const inset = worldPixels(1, viewportScale);
  graphics.circle(center.x, center.y, radius).fill({ color, alpha: 0.1 });
  graphics.circle(center.x, center.y, radius).stroke({ width: worldPixels(3, viewportScale), color, alpha: 0.8 });
  graphics.circle(center.x, center.y, Math.max(0, radius - inset))
    .stroke({ width: worldPixels(1.5, viewportScale), color, alpha: 1 });
}

/** A cone from `start` towards `end`, as long as the distance between them and `coneAngle` degrees wide. */
export function drawMeasureCone(graphics: Graphics, color: number, start: Point, end: Point, coneAngle: number, viewportScale = 1): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const halfAngle = coneAngle * Math.PI / 360;
  const baseAngle = Math.atan2(dy, dx);
  const leftAngle = baseAngle - halfAngle;
  const rightAngle = baseAngle + halfAngle;
  const leftX = start.x + distance * Math.cos(leftAngle);
  const leftY = start.y + distance * Math.sin(leftAngle);
  const rightX = start.x + distance * Math.cos(rightAngle);
  const rightY = start.y + distance * Math.sin(rightAngle);

  graphics.moveTo(start.x, start.y);
  graphics.lineTo(leftX, leftY);
  graphics.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
  graphics.lineTo(start.x, start.y);
  graphics.fill({ color, alpha: 0.1 });

  const width = worldPixels(3, viewportScale);
  for (const [x, y] of [[leftX, leftY], [rightX, rightY]] as const) {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(x, y);
    graphics.stroke({ width, color, alpha: 0.8 });
  }

  graphics.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
  graphics.stroke({ width, color, alpha: 0.8 });
}

/**
 * Draws `measurement` in `color`: a line with a dot at its end, a circle around its start, or a
 * cone `coneAngle` degrees wide; then the dot at its start.
 */
export function drawMeasurement(graphics: Graphics, color: number, measurement: MeasureRecord, coneAngle: number, viewportScale = 1): void {
  const { shape, start, end } = measurement;
  switch (shape) {
    case 'line':
      drawMeasurePath(graphics, color, [start, end], viewportScale);
      drawMeasurePoint(graphics, color, end, viewportScale);
      break;
    case 'circle':
    case 'sphere': {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      drawMeasureCircle(graphics, color, start, Math.sqrt(dx * dx + dy * dy), viewportScale);
      break;
    }
    case 'cone':
      drawMeasureCone(graphics, color, start, end, coneAngle, viewportScale);
      break;
  }
  drawMeasurePoint(graphics, color, start, viewportScale);
}

export function createMeasureLabelText(): Text {
  const text = new Text({ text: '', style: { fontSize: LABEL_FONT_SIZE, fill: canvasBadgeColors().stroke, fontWeight: 'normal' } });
  text.eventMode = 'none';
  text.anchor.set(0.5);
  return text;
}

/** Font size in world units that keeps the label 16 px on screen at any zoom. */
export function measureLabelFontSize(viewportScale: number): number {
  return LABEL_FONT_SIZE / zoomOf(viewportScale);
}

/** Centres `text` on `center`, inks it and draws its pill into `pill`, both in the canvas badges' theme colours. */
export function drawMeasureLabel(pill: Graphics, text: Text, center: Point, viewportScale: number): void {
  const scaleFactor = 1 / zoomOf(viewportScale);
  const placed = { x: onScreenPixel(center.x, viewportScale), y: onScreenPixel(center.y, viewportScale) };
  const { background, stroke } = canvasBadgeColors();
  if (text.style.fill !== stroke) text.style.fill = stroke;
  text.position.set(placed.x, placed.y);

  const bounds = text.getLocalBounds();
  const padding = 8 * scaleFactor;
  const width = bounds.width * text.scale.x + padding * 2;
  const height = Math.max(20 * scaleFactor, bounds.height * text.scale.y + 4 * scaleFactor);
  const x = placed.x - width / 2;
  const y = placed.y - height / 2;

  pill.clear();
  pill.roundRect(x, y, width, height, height / 2)
    .fill({ color: background, alpha: 0.95 })
    .stroke({ width: 0.5 * scaleFactor, color: stroke, alpha: isDarkTheme() ? 0.4 : 0.3 });
}

/** Calls `redraw` whenever Obsidian switches between its light and dark theme; returns what stops it. */
export function watchMeasureLabelTheme(redraw: () => void): () => void {
  let dark = isDarkTheme();
  const observer = new MutationObserver(() => {
    if (isDarkTheme() === dark) return;
    dark = isDarkTheme();
    redraw();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
