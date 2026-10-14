import type { ImageJob, ImageJobResult, ImageLayout, ThumbnailSpec } from './imageJob';
import { applyColorKey } from './colorKey';
import { WEBP_MAX_SIDE } from './decodeLimits';
import { fitSize, frameImageRect, frameSize, scaleDown, type Size } from './imageLayout';
import { imageHeader, type ImageFormat } from './imageDimensions';

const KEPT_FORMATS: ReadonlySet<ImageFormat> = new Set(['png', 'jpeg', 'webp']);

/**
 * Runs inside an image worker: one decode per job, scaling on a 2D canvas,
 * WebP encoding on the worker's thread (browsers encode on the CPU only).
 * Nothing here may touch the DOM or Obsidian.
 */

const WEBP = 'image/webp';

/** Raised when the worker cannot read the source format, so the main thread can decode it instead. */
export class SourceDecodeError extends Error {}

type Drawable = ImageBitmap | OffscreenCanvas;

/**
 * A JPEG decoded at `size` by DCT scaling, which reads only what that size
 * needs; null where WebCodecs is missing, so the caller decodes it whole.
 */
async function decodeScaledJpeg(source: Blob, size: Size): Promise<ImageBitmap | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  const decoder = new ImageDecoder({ data: source.stream(), type: 'image/jpeg', desiredWidth: size.width, desiredHeight: size.height });
  try {
    const { image } = await decoder.decode();
    try {
      return await createImageBitmap(image);
    } finally {
      image.close();
    }
  } finally {
    decoder.close();
  }
}

async function decode(job: ImageJob): Promise<ImageBitmap> {
  const { source, scaledDecode } = job;
  if (source instanceof ImageBitmap) return source;
  try {
    return (scaledDecode && await decodeScaledJpeg(source, scaledDecode.decoded)) ?? await createImageBitmap(source);
  } catch (error) {
    throw new SourceDecodeError(error instanceof Error ? error.message : 'Could not decode the image.');
  }
}

/**
 * The browser picks the backing: with GPU raster the scaling runs on the GPU
 * and only the small result is read back for encoding, which measured faster
 * than a software canvas. `high` is Chromium's best downscaling filter; the
 * canvas default, `low`, aliases.
 */
function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface for the image.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  // Larger sides would be cropped without an error; every layout keeps within it, this makes sure.
  if (canvas.width > WEBP_MAX_SIDE || canvas.height > WEBP_MAX_SIDE) {
    throw new Error(`A WebP image can be at most ${WEBP_MAX_SIDE} pixels a side, not ${canvas.width} × ${canvas.height}.`);
  }
  const blob = await canvas.convertToBlob({ type: WEBP, quality });
  if (blob.type !== WEBP) throw new Error('This system cannot encode WebP images.');
  return blob;
}

/**
 * `source` halved until it is less than four times `size`, so the final draw
 * reduces it at most fourfold. A single draw over a larger reduction samples
 * too few source pixels and aliases.
 */
function reduced(source: Drawable, size: Size): Drawable {
  let current = source;
  while (Math.min(current.width / size.width, current.height / size.height) >= 4) {
    const half = new OffscreenCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    context(half).drawImage(current, 0, 0, half.width, half.height);
    freeIntermediate(current, source);
    current = half;
  }
  return current;
}

/** Releases a halving step's pixels now instead of at garbage collection; for maps they are tens of megabytes. */
function freeIntermediate(drawable: Drawable, source: Drawable): void {
  if (drawable !== source && drawable instanceof OffscreenCanvas) {
    drawable.width = 0;
    drawable.height = 0;
  }
}

function renderFit(source: Drawable, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const scaled = reduced(source, size);
  context(canvas).drawImage(scaled, 0, 0, size.width, size.height);
  freeIntermediate(scaled, source);
  return canvas;
}

function renderFrame(source: Drawable, layout: Extract<ImageLayout, { kind: 'frame' }>): OffscreenCanvas {
  const frame = frameSize(source, layout.placement, layout.minSize, layout.maxSize);
  const rect = frameImageRect(source, layout.placement, frame);
  const canvas = new OffscreenCanvas(frame, frame);
  const scaled = reduced(source, rect);
  context(canvas).drawImage(scaled, rect.left, rect.top, rect.width, rect.height);
  freeIntermediate(scaled, source);
  return canvas;
}

function scaledCopy(source: Drawable, spec: ThumbnailSpec): OffscreenCanvas {
  return renderFit(source, fitSize(source, { kind: 'fit', maxWidth: spec.size, maxHeight: spec.size }));
}

async function renderCopy(source: Drawable, spec: ThumbnailSpec | undefined): Promise<Blob | null> {
  return spec ? encode(scaledCopy(source, spec), spec.quality) : null;
}

/**
 * The thumbnail and preview of `output`. A preview at least as large as the
 * thumbnail is its source, so a large map is reduced once rather than twice.
 */
async function renderCopies(output: Drawable, job: ImageJob): Promise<Pick<ImageJobResult, 'thumbnail' | 'preview'>> {
  const previewCanvas = job.preview ? scaledCopy(output, job.preview) : null;
  const preview = previewCanvas && job.preview ? await encode(previewCanvas, job.preview.quality) : null;
  const thumbnailSource = previewCanvas && job.thumbnail && Math.max(previewCanvas.width, previewCanvas.height) >= job.thumbnail.size
    ? previewCanvas : output;
  const thumbnail = job.thumbnail ? await encode(scaledCopy(thumbnailSource, job.thumbnail), job.thumbnail.quality) : null;
  return { thumbnail, preview };
}

/**
 * A source that needs no scaling is kept as it is: re-encoding would only lose quality, and
 * players notice. Only formats every Atlas view shows are kept; others (GIF, BMP) are encoded,
 * and so is everything but a WebP where the job's result must be one.
 */
async function keepsSource(job: ImageJob, source: Blob, bitmap: ImageBitmap): Promise<boolean> {
  if (job.colorKey) return false;
  const { layout } = job;
  if (layout.kind !== 'fit') return false;
  const fitted = fitSize(bitmap, layout);
  if (fitted.width !== bitmap.width || fitted.height !== bitmap.height) return false;
  const format = (await imageHeader(source))?.format;
  return job.webpOnly ? format === 'webp' : format !== undefined && KEPT_FORMATS.has(format);
}

/**
 * Pixels near the key colour become transparent. Returns a bitmap made from the
 * keyed pixels. Drawing a canvas that was only written with `putImageData` drops
 * the picture in Chromium's GPU raster (the encode then comes out fully clear).
 * Closes `bitmap`.
 */
async function withColorKey(bitmap: ImageBitmap, key: NonNullable<ImageJob['colorKey']>): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create a drawing surface for the image.');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyColorKey(imageData, key);
  const keyed = await createImageBitmap(imageData);
  bitmap.close();
  return keyed;
}

/**
 * The natural size of the source as it is shown. Header sizes are stored
 * sizes, while decoders apply a JPEG's EXIF rotation: a bitmap decoded with
 * swapped sides is a turned image. The bitmap has the scaled size, or the
 * full one where `ImageDecoder` is missing and the JPEG was decoded whole.
 */
function shownSource(bitmap: ImageBitmap, scaledDecode: ImageJob['scaledDecode']): Size {
  // A plain copy: colour key closes the bitmap before layout, and a closed bitmap reports 0×0.
  if (!scaledDecode) return { width: bitmap.width, height: bitmap.height };
  const { source, decoded } = scaledDecode;
  const swaps = (size: Size): boolean => bitmap.width === size.height && bitmap.height === size.width;
  const turned = bitmap.width !== bitmap.height && (swaps(decoded) || swaps(source));
  return turned
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/** A fit is sized from the natural source, so a JPEG decoded at a smaller scale comes out as a whole decode would. */
function render(drawable: Drawable, source: Size, layout: ImageLayout): OffscreenCanvas {
  return layout.kind === 'fit' ? renderFit(drawable, fitSize(source, layout)) : renderFrame(drawable, layout);
}

export async function renderImageJob(job: ImageJob): Promise<ImageJobResult> {
  let bitmap: ImageBitmap | null = await decode(job);
  let keyed: ImageBitmap | null = null;
  try {
    const source = shownSource(bitmap, job.scaledDecode);
    if (job.source instanceof Blob && !job.scaledDecode && await keepsSource(job, job.source, bitmap)) {
      return { image: job.source, sourcePreview: await renderCopy(bitmap, job.sourcePreview), ...await renderCopies(bitmap, job) };
    }
    if (job.colorKey) {
      keyed = await withColorKey(bitmap, job.colorKey);
      bitmap = null;
    }
    const drawable = keyed ?? bitmap;
    if (!drawable) throw new Error('Could not decode the image.');
    // Card crop editor and thumbnails use the keyed pixels so the preview matches the save.
    const sourcePreview = await renderCopy(drawable, job.sourcePreview);
    const canvas = render(drawable, source, job.layout);
    const scaledDown = scaleDown(job.layout, source, canvas);
    // The output no longer needs the decoded source; free it before the slow encode.
    drawable.close();
    bitmap = null;
    keyed = null;
    return { image: await encode(canvas, job.quality), sourcePreview, ...await renderCopies(canvas, job), scaledDown };
  } finally {
    bitmap?.close();
    keyed?.close();
  }
}
