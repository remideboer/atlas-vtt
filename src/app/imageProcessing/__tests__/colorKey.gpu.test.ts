import { afterAll, describe, expect, it } from 'vitest';
import { disposeImageProcessing, optimizeImage } from '../imageProcessing';

/** White field with a coloured block, so a keyed result must stay that size and keep the block. */
async function markedPng(): Promise<Blob> {
  const canvas = new OffscreenCanvas(32, 32);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 32, 32);
  context.fillStyle = '#c04020';
  context.fillRect(8, 8, 16, 16);
  return canvas.convertToBlob({ type: 'image/png' });
}

describe('colour key keeps the picture', () => {
  afterAll(disposeImageProcessing);

  it('does not collapse a keyed image to one pixel', async () => {
    const { image } = await optimizeImage(await markedPng(), { maxWidth: 64, maxHeight: 64, quality: 1 }, {
      colorKey: { rgb: 0xffffff, tolerance: 8 },
    });
    const bitmap = await createImageBitmap(image);
    expect(bitmap.width).toBe(32);
    expect(bitmap.height).toBe(32);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const centre = context.getImageData(16, 16, 1, 1).data;
    const corner = context.getImageData(0, 0, 1, 1).data;
    expect(centre[3]).toBe(255);
    expect(centre[0]).toBeGreaterThan(100);
    expect(corner[3]).toBe(0);
  });
});
