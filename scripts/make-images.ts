// Draws the site's static images into public/: the 1200×630 share image (og.png), the SVG favicon and the
// apple-touch-icon. Run with `npm run images` after changing the generator or this script, and commit the
// output; the site build only copies the files. No image library: cats are pixels, the title is a pixel
// font, and the PNG encoder is a few lines over node:zlib.
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { avatarSvg, catForName, DISC_COLORS, discIndexForName, type PixelCat } from '../src/lib/pixel-cat/index.ts';
import { avatarLayout, spriteRgba } from '../src/lib/raster.ts';
import { DEFAULT_NAME } from '../src/lib/share-state.ts';

const PUBLIC = new URL('../public/', import.meta.url);

/** One name per disc colour, in disc order, two of each style. */
const OG_NAMES = ['Simba', 'Oliver', 'Maya', 'Cleo', 'Alex', 'Chloe'];

const CANVAS = '#f3f6f3';
const BRAND = '#0f3d2e';
const MUTED = '#5e6360';

type Rgb = readonly [number, number, number];

const rgb = (hex: string): Rgb => {
  const channel = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
  return [channel(1), channel(3), channel(5)];
};

/** An opaque RGB image. */
class Image {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, background: string) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    this.fillRect(0, 0, width, height, background);
  }

  /** Blends `color` over pixel (x, y) at `alpha` (0…1). Pixels off the image are ignored. */
  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const i = (y * this.width + x) * 3;
    for (let c = 0; c < 3; c++) this.data[i + c] = Math.round(color[c] * alpha + this.data[i + c] * (1 - alpha));
  }

  fillRect(left: number, top: number, width: number, height: number, hex: string): void {
    const color = rgb(hex);
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) this.blend(x, y, color, 1);
  }

  /** A disc of diameter `size` at (left, top), its edge antialiased by 4×4 supersampling. */
  fillDisc(left: number, top: number, size: number, hex: string): void {
    const color = rgb(hex);
    const r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let inside = 0;
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const dx = x + (sx + 0.5) / 4 - r;
            const dy = y + (sy + 0.5) / 4 - r;
            if (dx * dx + dy * dy <= r * r) inside++;
          }
        }
        this.blend(left + x, top + y, color, inside / 16);
      }
    }
  }

  /** The white cat, laid out as on a `size`-px avatar whose top-left is (left, top). */
  drawCat(cat: PixelCat, left: number, top: number, size: number): void {
    const layout = avatarLayout(cat, size);
    const rgba = spriteRgba(cat, layout.scale);
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const alpha = rgba[(y * layout.width + x) * 4 + 3] / 255;
        this.blend(left + layout.left + x, top + layout.top + y, [255, 255, 255], alpha);
      }
    }
  }

  png(): Buffer {
    const rows = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      // Each row starts with its filter type, 0 (none).
      rows.set(this.data.subarray(y * this.width * 3, (y + 1) * this.width * 3), y * (this.width * 3 + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, deflate, standard filtering, not interlaced
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// MARK: - Pixel font

/** Lowercase glyphs on a 9-row grid: rows 0–1 ascenders, 2–6 x-height (baseline under row 6), 7–8 descenders. */
const GLYPHS: Record<string, readonly string[]> = {
  a: ['', '', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['', '', '.###', '#...', '#...', '#...', '.###'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['', '', '.###.', '#...#', '#####', '#....', '.####'],
  i: ['#', '', '#', '#', '#', '#', '#'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  o: ['', '', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['', '', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  r: ['', '', '#.##', '##..', '#...', '#...', '#...'],
  s: ['', '', '.###', '#...', '.##.', '...#', '###.'],
  t: ['.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##'],
  v: ['', '', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  x: ['', '', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '.': ['', '', '', '', '', '', '#'],
  ' ': ['...'],
};
const GLYPH_ROWS = 9;

const glyphWidth = (ch: string): number => Math.max(...GLYPHS[ch].map((row) => row.length));
/** The text's width in font pixels, with one pixel between letters. */
const textWidth = (text: string): number => [...text].reduce((sum, ch) => sum + glyphWidth(ch), 0) + text.length - 1;

function drawText(image: Image, text: string, left: number, top: number, scale: number, hex: string): void {
  let x = left;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] === '#') image.fillRect(x + gx * scale, top + gy * scale, scale, scale, hex);
      }
    });
    x += (glyphWidth(ch) + 1) * scale;
  }
}

// MARK: - Images

function shareImage(): Image {
  const image = new Image(1200, 630, CANVAS);
  const title = 'pixel cat';
  const titleScale = 16;
  const url = 'pixelcat.sbarro.dev';
  const urlScale = 5;
  const disc = 160;
  const gap = 24;
  const titleHeight = GLYPH_ROWS * titleScale;
  const urlHeight = GLYPH_ROWS * urlScale;
  const contentHeight = titleHeight + 48 + disc + 56 + urlHeight;
  const top = Math.floor((image.height - contentHeight) / 2);

  drawText(image, title, Math.floor((image.width - textWidth(title) * titleScale) / 2), top, titleScale, BRAND);

  const rowTop = top + titleHeight + 48;
  const rowLeft = Math.floor((image.width - (OG_NAMES.length * disc + (OG_NAMES.length - 1) * gap)) / 2);
  OG_NAMES.forEach((name, i) => {
    const left = rowLeft + i * (disc + gap);
    image.fillDisc(left, rowTop, disc, DISC_COLORS[discIndexForName(name)].hex);
    image.drawCat(catForName(name), left, rowTop, disc);
  });

  const urlTop = rowTop + disc + 56;
  drawText(image, url, Math.floor((image.width - textWidth(url) * urlScale) / 2), urlTop, urlScale, MUTED);
  return image;
}

/** The default cat on a full-bleed square of its disc colour; iOS rounds the corners itself. */
function touchIcon(): Image {
  const size = 180;
  const image = new Image(size, size, DISC_COLORS[discIndexForName(DEFAULT_NAME)].hex);
  image.drawCat(catForName(DEFAULT_NAME), 0, 0, size);
  return image;
}

const favicon = avatarSvg(catForName(DEFAULT_NAME), DISC_COLORS[discIndexForName(DEFAULT_NAME)].hex, { xmlns: true });

writeFileSync(new URL('og.png', PUBLIC), shareImage().png());
writeFileSync(new URL('apple-touch-icon.png', PUBLIC), touchIcon().png());
writeFileSync(new URL('favicon.svg', PUBLIC), `${favicon}\n`);
console.log('Wrote public/og.png, public/apple-touch-icon.png and public/favicon.svg');
