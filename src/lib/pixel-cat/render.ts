// Inline-SVG renderings of a generated cat. Free of Node imports, so it loads at build time and in the browser.
import type { PixelCat } from './generator.ts';

/** The cat's longer side takes this share of the disc, as the app draws its avatar. */
export const AVATAR_CAT_FRACTION = 0.62;

export interface SvgOptions {
  /** The cat's fill. The sprite is white with alpha, so the default is white; `currentColor` follows the text colour. */
  fill?: string;
  /** Rendered width and height in px. Omitted, the SVG fills its container. */
  size?: number;
  /** Extra attributes on the `<svg>` (`class`, `role`, `aria-label`, …). Values are escaped. */
  attrs?: Record<string, string>;
  /** Add `xmlns`, which a standalone `.svg` file needs and inline HTML does not. */
  xmlns?: boolean;
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Numbers as short as they can be written: `0.5`, not `0.5000`. */
const num = (n: number): string => String(+n.toFixed(4));

/** The distinct non-zero alpha levels in the cat, most opaque first. */
function levels(cat: PixelCat): number[] {
  return [...new Set(cat.alpha)].filter((a) => a !== 0).sort((a, b) => b - a);
}

/** One path of horizontal runs (`M x y h n v1 h-n z`) for every cell at `level`, in cat-pixel units. */
function runsPath(cat: PixelCat, level: number): string {
  let d = '';
  for (let y = 0; y < cat.height; y++) {
    for (let x = 0; x < cat.width; x++) {
      if (cat.alpha[y * cat.width + x] !== level) continue;
      let end = x;
      while (end + 1 < cat.width && cat.alpha[y * cat.width + end + 1] === level) end++;
      const run = end - x + 1;
      d += `M${x} ${y}h${run}v1h${-run}z`;
      x = end;
    }
  }
  return d;
}

/** A `<path>` per alpha level; a level below 255 becomes `fill-opacity`, so the tones stay tones. */
function catPaths(cat: PixelCat): string {
  return levels(cat)
    .map((a) => `<path d="${runsPath(cat, a)}"${a === 255 ? '' : ` fill-opacity="${num(a / 255)}"`}/>`)
    .join('');
}

function svgOpen(viewBox: string, options: SvgOptions, fill: string): string {
  const attrs: Record<string, string> = {
    ...(options.xmlns ? { xmlns: 'http://www.w3.org/2000/svg' } : {}),
    viewBox,
    ...(options.size === undefined ? {} : { width: String(options.size), height: String(options.size) }),
    'shape-rendering': 'crispEdges',
    fill,
    ...options.attrs,
  };
  return `<svg ${Object.entries(attrs)
    .map(([name, value]) => `${name}="${escapeAttr(value)}"`)
    .join(' ')}>`;
}

/**
 * The sprite: the cat alone, centred on a square canvas of its longer side. A hole is transparent; tones
 * in between are the fill at partial opacity.
 */
export function spriteSvg(cat: PixelCat, options: SvgOptions = {}): string {
  const side = Math.max(cat.width, cat.height);
  const ox = (side - cat.width) / 2;
  const oy = (side - cat.height) / 2;
  const paths = catPaths(cat);
  const body = ox === 0 && oy === 0 ? paths : `<g transform="translate(${num(ox)} ${num(oy)})">${paths}</g>`;
  return `${svgOpen(`0 0 ${side} ${side}`, options, options.fill ?? '#fff')}${body}</svg>`;
}

/**
 * The avatar: the cat on its disc, as the app draws it. The disc fills a 100×100 viewBox; the cat's
 * longer side is `AVATAR_CAT_FRACTION` of it, centred. A raster avatar would round that to a whole-number
 * scale so the pixels are identical squares; this vector one keeps the exact fraction.
 */
export function avatarSvg(cat: PixelCat, discHex: string, options: SvgOptions = {}): string {
  const k = (100 * AVATAR_CAT_FRACTION) / Math.max(cat.width, cat.height);
  const tx = (100 - cat.width * k) / 2;
  const ty = (100 - cat.height * k) / 2;
  return (
    svgOpen('0 0 100 100', options, options.fill ?? '#fff') +
    `<circle cx="50" cy="50" r="50" fill="${escapeAttr(discHex)}"/>` +
    `<g transform="translate(${num(tx)} ${num(ty)}) scale(${num(k)})">${catPaths(cat)}</g></svg>`
  );
}
