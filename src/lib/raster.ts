// Raster renderings of a generated cat for the page's PNG downloads, ported from the two cats site's sharp
// version. Pure: the page draws the pixels on a <canvas>. Cat pixels are scaled by a whole number with no
// smoothing, so every one stays an identical square, and the cat is centred the way the app's store-assets
// export draws it.
import type { PixelCat } from './pixel-cat/index.ts';
import { AVATAR_CAT_FRACTION } from './pixel-cat/index.ts';

/** White RGBA with the cat's alpha, each cat pixel repeated `scale`×`scale` times: 4 bytes per pixel, row-major. */
export function spriteRgba(cat: PixelCat, scale = 1): Uint8ClampedArray<ArrayBuffer> {
  if (!Number.isInteger(scale) || scale < 1) throw new RangeError(`scale must be a whole number ≥ 1, got ${scale}`);
  const width = cat.width * scale;
  const rgba = new Uint8ClampedArray(width * cat.height * scale * 4).fill(255);
  for (let y = 0; y < cat.height * scale; y++) {
    const row = Math.floor(y / scale) * cat.width;
    for (let x = 0; x < width; x++) rgba[(y * width + x) * 4 + 3] = cat.alpha[row + Math.floor(x / scale)];
  }
  return rgba;
}

/** Where the scaled cat goes on a `size`×`size` canvas, in canvas px. */
export interface CatLayout {
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Where a `length`-px cat goes on a `size`-px canvas. The leading margin is the smaller half, and the spare
 * pixel of an odd margin goes to the trailing side; on the vertical axis the app (CoreGraphics, origin at the
 * bottom) rounds the other way, so pass `fromEnd` there.
 */
function margin(size: number, length: number, fromEnd = false): number {
  const small = Math.floor((size - length) / 2);
  return fromEnd ? size - length - small : small;
}

function layout(cat: PixelCat, size: number, scale: number): CatLayout {
  if (!Number.isInteger(size) || scale < 1) {
    throw new RangeError(`size must be a whole number of px, at least ${Math.max(cat.width, cat.height)} for this cat`);
  }
  const width = cat.width * scale;
  const height = cat.height * scale;
  return { scale, width, height, left: margin(size, width), top: margin(size, height, true) };
}

/** The sprite: the cat alone, centred at the largest whole-number scale that fits. */
export function spriteLayout(cat: PixelCat, size: number): CatLayout {
  return layout(cat, size, Math.floor(size / Math.max(cat.width, cat.height)));
}

/** The avatar: the cat's longer side at about `AVATAR_CAT_FRACTION` of the disc, at a whole-number scale, centred. */
export function avatarLayout(cat: PixelCat, size: number): CatLayout {
  return layout(cat, size, Math.max(1, Math.floor(Math.trunc(size * AVATAR_CAT_FRACTION) / Math.max(cat.width, cat.height))));
}
