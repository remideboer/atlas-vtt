/**
 * Turns a saved explored-memory mask with the map. The mask is a PNG data URL in the map's
 * world. A mask that has not decoded yet is dropped: turning a picture that is not this map's
 * would paint memory on the wrong axis.
 */

import { getDomHost } from '../host/dom';
import type { MapOrientation } from '../grid/mapOrientation';

export function turnExploredMask(mask: string | null, quarter: MapOrientation): string | null {
  if (!mask || quarter === 0) return mask;
  const image = new Image();
  image.src = mask;
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
  const swap = quarter === 90 || quarter === 270;
  const width = swap ? image.naturalHeight : image.naturalWidth;
  const height = swap ? image.naturalWidth : image.naturalHeight;
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.translate(width / 2, height / 2);
  context.rotate((quarter * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
