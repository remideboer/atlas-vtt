import { colorKeyHex } from '../../../../imageProcessing/colorKey';
import { renderedImageRect, type ImageAspect } from './cropMath';
import type { ImagePosition } from './types';

export interface SamplePlacement {
  /** Well-relative crop placement when the card is framing; omit for contain/center. */
  crop?: { scale: number; position: ImagePosition; aspect: ImageAspect | null };
}

/**
 * Samples `#rrggbb` from `previewUrl` at a well click. Null when the click misses
 * the image or the image cannot be read.
 */
export function sampleImageColor(
  previewUrl: string,
  well: DOMRectReadOnly,
  clientX: number,
  clientY: number,
  placement: SamplePlacement,
): Promise<string | null> {
  if (!previewUrl) return Promise.resolve(null);
  const nx = (clientX - well.left) / well.width;
  const ny = (clientY - well.top) / well.height;
  if (!(nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      if (width < 1 || height < 1) {
        resolve(null);
        return;
      }
      const uv = placement.crop
        ? cropUv(nx, ny, placement.crop)
        : containUv(nx, ny, width, height);
      if (!uv) {
        resolve(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0);
      const x = Math.min(width - 1, Math.max(0, Math.floor(uv.u * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(uv.v * height)));
      const [r = 0, g = 0, b = 0] = ctx.getImageData(x, y, 1, 1).data;
      resolve(colorKeyHex((r << 16) | (g << 8) | b));
    };
    image.onerror = () => resolve(null);
    image.src = previewUrl;
  });
}

function cropUv(
  nx: number,
  ny: number,
  crop: { scale: number; position: ImagePosition; aspect: ImageAspect | null },
): { u: number; v: number } | null {
  const rect = renderedImageRect(crop.scale, crop.position, crop.aspect);
  const u = (nx - rect.left) / rect.width;
  const v = (ny - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

/** CSS `background-size: contain; background-position: center` mapping. */
function containUv(nx: number, ny: number, width: number, height: number): { u: number; v: number } | null {
  const imageAspect = width / height;
  let drawW: number;
  let drawH: number;
  if (imageAspect > 1) {
    drawW = 1;
    drawH = 1 / imageAspect;
  } else {
    drawH = 1;
    drawW = imageAspect;
  }
  const left = (1 - drawW) / 2;
  const top = (1 - drawH) / 2;
  const u = (nx - left) / drawW;
  const v = (ny - top) / drawH;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}
