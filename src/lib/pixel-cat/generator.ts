// A line-for-line port of the pixel cat generator in the two cats iPhone app (https://twocats.sbarro.dev).
// The app's Swift generator is the source of truth, and `fixtures.json`, dumped from it, pins every cat
// byte for byte. Never skip, add or reorder a random draw, and keep each floating-point expression
// grouped as the Swift is: results must be identical, not close.
//
// name → FNV-1a 64 hash → SplitMix64 stream → one cat, a white sprite with per-pixel alpha. Alpha 0 is a
// hole the avatar disc shows through; tones in between pick up the disc colour.
import { assertSeed, SplitMix64 } from './splitmix64.ts';
import { seedForName } from './name.ts';

export type CatStyle = 'flat' | 'tilted' | 'sculpted';
export type EyeKind = 'dot' | 'tall' | 'wide' | 'sleepy' | 'slant' | 'happy' | 'wink';
export type Coat = 'plain' | 'calico' | 'tabby' | 'points' | 'dark' | 'tuxedo';
type Mouth = 'none' | 'nose' | 'smile' | 'tinted';

/** A generated pixel cat: a white sprite with one alpha value per pixel. */
export interface PixelCat {
  style: CatStyle;
  width: number;
  height: number;
  /** Row-major alpha of white, `width * height` values. 0 is a hole. */
  alpha: Uint8Array;
}

/** What the generator chose for a cat, read off the draws it already makes. */
export interface PixelCatTraits {
  style: CatStyle;
  coat: Coat;
  eye: EyeKind;
  /** The head template's name; null for a sculpted cat, which has none. */
  template: string | null;
  /** `Style · Coat · <Eye> eyes · <Template> ears`, as the app's cat picker writes it. */
  line: string;
}

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function traitsLine(style: CatStyle, coat: Coat, eye: EyeKind, template: string | null): string {
  const parts = [capitalized(style)];
  if (coat === 'points') parts.push('Siamese');
  else if (coat !== 'plain') parts.push(capitalized(coat));
  parts.push(`${capitalized(eye)} eyes`);
  if (template !== null && template !== 'classic') parts.push(`${capitalized(template)} ears`);
  return parts.join(' · ');
}

// MARK: - Grid

/** A small integer grid, row-major. Indexing is flat and unchecked, as in Swift, so any aliasing matches. */
class Grid {
  readonly width: number;
  readonly height: number;
  cells: number[];

  constructor(width: number, height: number, fill = 0) {
    this.width = width;
    this.height = height;
    this.cells = new Array<number>(width * height).fill(fill);
  }

  get(y: number, x: number): number {
    return this.cells[y * this.width + x];
  }

  set(y: number, x: number, value: number): void {
    this.cells[y * this.width + x] = value;
  }

  copy(): Grid {
    const out = new Grid(this.width, this.height);
    out.cells = this.cells.slice();
    return out;
  }

  contains(y: number, x: number): boolean {
    return y >= 0 && y < this.height && x >= 0 && x < this.width;
  }

  #filled(y: number, x: number): number {
    return this.contains(y, x) && this.get(y, x) !== 0 ? 1 : 0;
  }

  /** Non-zero 4-neighbours. */
  n4(y: number, x: number): number {
    return this.#filled(y - 1, x) + this.#filled(y + 1, x) + this.#filled(y, x - 1) + this.#filled(y, x + 1);
  }

  /** Non-zero 8-neighbours. */
  n8(y: number, x: number): number {
    return (
      this.n4(y, x) +
      this.#filled(y - 1, x - 1) +
      this.#filled(y - 1, x + 1) +
      this.#filled(y + 1, x - 1) +
      this.#filled(y + 1, x + 1)
    );
  }

  mapped(transform: (value: number) => number): Grid {
    const out = this.copy();
    out.cells = this.cells.map(transform);
    return out;
  }

  /** Trimmed to the bounding box of non-zero cells. */
  cropped(): Grid {
    let minY = this.height;
    let maxY = -1;
    let minX = this.width;
    let maxX = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(y, x) === 0) continue;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    if (maxY < 0) return new Grid(1, 1);
    const out = new Grid(maxX - minX + 1, maxY - minY + 1);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        out.set(y, x, this.get(y + minY, x + minX));
      }
    }
    return out;
  }
}

// MARK: - Tables

const STYLES: readonly CatStyle[] = ['flat', 'tilted', 'sculpted'];
const STYLE_WEIGHTS = [50, 22, 28];

/** White at 43%: a coat tone that picks up the disc colour. */
const TONE = 110;

const COAT_LABEL = 1;
const MARK_LABEL = 2;

interface Template {
  /** Shown in the traits line ("Pointy ears"); never drawn. */
  name: string;
  /** Left half, mirrored. "0" never fur, "1" fur 50% of the time, "3" always fur. */
  half: readonly string[];
  /** Inclusive range for the left eye's top row. */
  eyeRows: readonly [number, number];
  /** Inclusive range for the left eye's left column. */
  eyeColumns: readonly [number, number];
  /** Rows above this are ears (Siamese points, inner ears, tabby forehead). */
  earRows: number;
}

const TEMPLATES: readonly Template[] = [
  {
    name: 'pointy',
    half: ['010000', '031000', '133100', '133311', '333333', '333333', '333333', '133333', '133333', '013333', '001133'],
    eyeRows: [5, 5],
    eyeColumns: [2, 3],
    earRows: 3,
  },
  {
    name: 'round',
    half: [
      '030000',
      '033000',
      '033310',
      '133333',
      '333333',
      '333333',
      '333333',
      '333333',
      '133333',
      '133333',
      '013333',
      '000133',
    ],
    eyeRows: [5, 5],
    eyeColumns: [2, 3],
    earRows: 3,
  },
  // today's 10×10 brand cat, loosened
  {
    name: 'classic',
    half: ['03000', '03300', '03331', '33333', '33333', '33333', '33333', '33333', '13333', '00133'],
    eyeRows: [5, 5],
    eyeColumns: [1, 2],
    earRows: 3,
  },
  // tall ears
  {
    name: 'lynx',
    half: [
      '010000',
      '030000',
      '033000',
      '033310',
      '333333',
      '333333',
      '333333',
      '333333',
      '333333',
      '133333',
      '013333',
      '000133',
    ],
    eyeRows: [5, 6],
    eyeColumns: [2, 3],
    earRows: 4,
  },
  // small folded ears
  {
    name: 'fold',
    half: ['003100', '033300', '133333', '333333', '333333', '333333', '333333', '133333', '013333', '001333'],
    eyeRows: [3, 4],
    eyeColumns: [2, 3],
    earRows: 1,
  },
];
const TEMPLATE_WEIGHTS = [3, 3, 2, 2, 2];
/** Folded ears vanish when the head is tilted. */
const TILT_TEMPLATE_WEIGHTS = [3, 3, 2, 2, 0];

interface EyeShape {
  kind: EyeKind;
  height: number;
  width: number;
  /** Hole cells of the left eye as [dy, dx]; the right eye is mirrored. */
  cells: readonly (readonly [number, number])[];
}

const EYE_SHAPES: readonly EyeShape[] = [
  { kind: 'dot', height: 1, width: 1, cells: [[0, 0]] },
  { kind: 'tall', height: 2, width: 1, cells: [[0, 0], [1, 0]] },
  { kind: 'wide', height: 2, width: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { kind: 'sleepy', height: 2, width: 2, cells: [[1, 0], [1, 1]] },
  { kind: 'slant', height: 2, width: 2, cells: [[0, 0], [1, 1]] },
  { kind: 'happy', height: 2, width: 3, cells: [[0, 1], [1, 0], [1, 2]] },
  { kind: 'wink', height: 2, width: 1, cells: [[0, 0], [1, 0]] },
];
const EYE_WEIGHTS = [3, 4, 3, 2, 3, 2, 1];
/** Diagonal and one-pixel eyes don't survive rotation. */
const TILT_EYE_WEIGHTS = [0, 4, 3, 2, 0, 0, 1];

const MOUTHS: readonly Mouth[] = ['none', 'nose', 'smile', 'tinted'];
const MOUTH_WEIGHTS = [4, 4, 2, 2];
/** Scale2x joins diagonal holes, so tilted cats get no mouth holes. */
const TILT_MOUTH_WEIGHTS = [4, 0, 0, 3];

const COATS: readonly Coat[] = ['plain', 'calico', 'tabby', 'points', 'dark', 'tuxedo'];
const COAT_WEIGHTS = [30, 24, 18, 10, 6, 12];

/** cos/sin of 8°, 10°, 12° and 14°: constants, so there's no runtime trig. */
const TILTS: readonly (readonly [number, number])[] = [
  [0.9902680687415704, 0.13917310096006544],
  [0.984807753012208, 0.17364817766693033],
  [0.9781476007338057, 0.20791169081775934],
  [0.9702957262759965, 0.24192189559966773],
];

// MARK: - Coats (cellular automata)

/** Deep-Fold/SpriteGenerator: noise, then 4 steps of an 8-neighbour rule (born if n > 5, dies if n < 4), confined to `fur`. */
function deepFold(fur: Grid, rng: SplitMix64, densityPercent: number, steps = 4): Grid {
  let a = new Grid(fur.width, fur.height);
  for (let y = 0; y < fur.height; y++) {
    for (let x = 0; x < fur.width; x++) {
      const r = rng.int(100);
      a.set(y, x, fur.get(y, x) !== 0 && r < densityPercent ? 1 : 0);
    }
  }
  for (let step = 0; step < steps; step++) {
    const b = new Grid(fur.width, fur.height);
    for (let y = 0; y < fur.height; y++) {
      for (let x = 0; x < fur.width; x++) {
        if (fur.get(y, x) === 0) continue;
        const n = a.n8(y, x);
        b.set(y, x, (a.get(y, x) !== 0 && n >= 4) || (a.get(y, x) === 0 && n > 5) ? 1 : 0);
      }
    }
    a = b;
  }
  return a;
}

/** yurkth/sprator on the left half (the mirrored cell isn't counted): born with at most one 4-neighbour, survives with 2–3; 2 steps; mirrored. */
function sprator(zone: Grid, rng: SplitMix64, steps = 2): Grid {
  const halfWidth = Math.trunc(zone.width / 2);
  let a = new Grid(halfWidth, zone.height);
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const r = rng.int(2);
      a.set(y, x, zone.get(y, x) !== 0 && r === 0 ? 1 : 0);
    }
  }
  for (let step = 0; step < steps; step++) {
    const b = new Grid(halfWidth, zone.height);
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        if (zone.get(y, x) === 0) continue;
        const n = a.n4(y, x);
        b.set(y, x, (a.get(y, x) !== 0 && (n === 2 || n === 3)) || (a.get(y, x) === 0 && n <= 1) ? 1 : 0);
      }
    }
    a = b;
  }
  const out = new Grid(zone.width, zone.height);
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < halfWidth; x++) {
      out.set(y, x, a.get(y, x));
      out.set(y, zone.width - 1 - x, a.get(y, x));
    }
  }
  return out;
}

// MARK: - Flat and tilted heads

interface Head {
  /** 0 empty or hole, 1 coat, 2 marking. */
  labels: Grid;
  coatAlpha: number;
  markAlpha: number;
  /** The choices made on the way, for the traits line. */
  template: string;
  eye: EyeKind;
  coat: Coat;
}

function flatHead(
  rng: SplitMix64,
  templateWeights: readonly number[],
  eyeWeights: readonly number[],
  mouthWeights: readonly number[],
): Head {
  const t = TEMPLATES[rng.weighted(templateWeights)];
  const half = t.half.map((row) => Array.from(row));
  const h = half.length;
  const hw = half[0].length;
  const w = hw * 2;

  // Silhouette: roll every half cell, then mirror.
  const fur = new Grid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < hw; x++) {
      const c = half[y][x];
      const r = rng.int(2);
      const on = c === '3' || (c === '1' && r === 0);
      fur.set(y, x, on ? 1 : 0);
      fur.set(y, w - 1 - x, on ? 1 : 0);
    }
  }

  // Eyes
  const holes = new Grid(w, h);
  const eye = EYE_SHAPES[rng.weighted(eyeWeights)];
  const ey = t.eyeRows[0] + rng.int(t.eyeRows[1] - t.eyeRows[0] + 1);
  let ex = t.eyeColumns[0] + rng.int(t.eyeColumns[1] - t.eyeColumns[0] + 1);
  if (ex + eye.width > hw - 1) {
    // keep a gap of at least two columns between the eyes
    ex = hw - 1 - eye.width;
  }
  const winkRight = rng.int(2) === 0;
  for (const [dy, dx] of eye.cells) {
    holes.set(ey + dy, ex + dx, 1);
    holes.set(ey + dy, w - 1 - (ex + dx), 1);
  }
  if (eye.kind === 'wink') {
    // one eye becomes a closed line
    const xl = ex;
    const xr = w - 1 - ex;
    if (winkRight) {
      holes.set(ey, xr, 0);
      holes.set(ey + 1, xr - 1, 1);
    } else {
      holes.set(ey, xl, 0);
      holes.set(ey + 1, xl + 1, 1);
    }
  }

  // Mouth and inner ears
  const mouth = MOUTHS[rng.weighted(mouthWeights)];
  const my = ey + 2 + rng.int(2); // right under the eyes, or a row lower
  const c0 = hw - 1;
  const c1 = hw;
  const tinted = new Grid(w, h);
  if (mouth === 'nose' && my < h - 1) {
    holes.set(my, c0, 1);
    holes.set(my, c1, 1);
  } else if (mouth === 'smile' && my + 1 < h - 1) {
    holes.set(my, c0 - 1, 1);
    holes.set(my, c1 + 1, 1);
    holes.set(my + 1, c0, 1);
    holes.set(my + 1, c1, 1);
  } else if (mouth === 'tinted' && my < h - 1) {
    tinted.set(my, c0, 1);
    tinted.set(my, c1, 1);
  }
  if (rng.int(100) < 35) {
    // inner ears: ear cells with fur on both sides
    for (let y = 0; y < t.earRows; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (fur.get(y, x) !== 0 && fur.get(y, x - 1) !== 0 && fur.get(y, x + 1) !== 0) tinted.set(y, x, 1);
      }
    }
  }
  const blaze = new Grid(w, h); // forehead stripe and chin patch
  if (rng.int(100) < 25) {
    for (let y = t.earRows; y < ey; y++) {
      blaze.set(y, c0, 1);
      blaze.set(y, c1, 1);
    }
  }
  if (rng.int(100) < 25) {
    let bottom = h - 1;
    for (let y = h - 1; y >= 0; y--) {
      let any = false;
      for (let x = 0; x < w; x++) {
        if (fur.get(y, x) !== 0) any = true;
      }
      if (any) {
        bottom = y;
        break;
      }
    }
    for (const y of [bottom - 1, bottom]) {
      for (let x = c0 - 1; x <= c1 + 1; x++) {
        blaze.set(y, x, 1);
      }
    }
  }

  const face = new Grid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      face.set(y, x, fur.get(y, x) !== 0 && holes.get(y, x) === 0 ? 1 : 0);
    }
  }

  // Coat
  const coat = COATS[rng.weighted(COAT_WEIGHTS)];
  let marks = new Grid(w, h);
  let coatAlpha = 255;
  let markAlpha = TONE;
  switch (coat) {
    case 'calico':
    case 'tuxedo': {
      const density = [42, 48, 54][rng.int(3)];
      marks = deepFold(face, rng, density);
      if (coat === 'tuxedo') {
        coatAlpha = TONE;
        markAlpha = 255;
      }
      break;
    }
    case 'tabby': {
      const zone = new Grid(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const forehead = t.earRows <= y && y < ey && 2 <= x && x < w - 2;
          const cheek = ey + eye.height + 1 <= y && y <= ey + eye.height + 3 && (x < 3 || x >= w - 3);
          zone.set(y, x, face.get(y, x) !== 0 && (forehead || cheek) ? 1 : 0);
        }
      }
      marks = sprator(zone, rng);
      break;
    }
    case 'points':
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ear = y < t.earRows;
          const muzzle = my - 1 <= y && y <= my + 2 && c0 - 2 <= x && x <= c1 + 2;
          marks.set(y, x, face.get(y, x) !== 0 && (ear || muzzle) ? 1 : 0);
        }
      }
      break;
    case 'dark':
      coatAlpha = TONE;
      markAlpha = 255;
      break;
    case 'plain':
      break;
  }

  if (coatAlpha === 255) {
    // tinted details only show on a white coat
    for (let i = 0; i < tinted.cells.length; i++) {
      if (tinted.cells[i] !== 0 || blaze.cells[i] !== 0) marks.cells[i] = 1;
    }
  } else if (coat === 'dark') {
    // a dark cat's blaze and chin are white
    for (let i = 0; i < blaze.cells.length; i++) {
      if (blaze.cells[i] !== 0) marks.cells[i] = 1;
    }
  }

  const labels = new Grid(w, h);
  for (let i = 0; i < labels.cells.length; i++) {
    if (face.cells[i] !== 0) labels.cells[i] = marks.cells[i] !== 0 ? MARK_LABEL : COAT_LABEL;
  }
  return { labels, coatAlpha, markAlpha, template: t.name, eye: eye.kind, coat };
}

function tiltedHead(rng: SplitMix64): Head {
  const head = flatHead(rng, TILT_TEMPLATE_WEIGHTS, TILT_EYE_WEIGHTS, TILT_MOUTH_WEIGHTS);
  const k = rng.int(TILTS.length);
  const sign = rng.int(2) === 0 ? 1 : -1;
  const [cosT, sinT0] = TILTS[k];
  const sinT = sinT0 * sign;
  const p = 4;
  const doubled = scale2x(padded(head.labels, p));
  const px = (p + head.labels.width / 2) * 2.0;
  const py = (p + head.labels.height) * 2.0;
  head.labels = tidyLabels(rotSprite(doubled, cosT, sinT, px, py)).cropped();
  return head;
}

/** Scale2x / EPX. Never adds colours, so labels stay labels. */
function scale2x(g: Grid): Grid {
  const out = new Grid(g.width * 2, g.height * 2);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const e = g.get(y, x);
      const b = y > 0 ? g.get(y - 1, x) : e;
      const h = y < g.height - 1 ? g.get(y + 1, x) : e;
      const d = x > 0 ? g.get(y, x - 1) : e;
      const f = x < g.width - 1 ? g.get(y, x + 1) : e;
      if (b !== h && d !== f) {
        out.set(2 * y, 2 * x, d === b ? d : e);
        out.set(2 * y, 2 * x + 1, b === f ? f : e);
        out.set(2 * y + 1, 2 * x, d === h ? d : e);
        out.set(2 * y + 1, 2 * x + 1, h === f ? f : e);
      } else {
        out.set(2 * y, 2 * x, e);
        out.set(2 * y, 2 * x + 1, e);
        out.set(2 * y + 1, 2 * x, e);
        out.set(2 * y + 1, 2 * x + 1, e);
      }
    }
  }
  return out;
}

function padded(g: Grid, p: number): Grid {
  const out = new Grid(g.width + 2 * p, g.height + 2 * p);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      out.set(y + p, x + p, g.get(y, x));
    }
  }
  return out;
}

/**
 * RotSprite: upscale 8× with Scale2x three times, rotate about the pivot (in `g`'s coordinates) with
 * nearest-neighbour, and take the centre sample of every 8×8 block.
 */
function rotSprite(g: Grid, cosT: number, sinT: number, pivotX: number, pivotY: number): Grid {
  const big = scale2x(scale2x(scale2x(g)));
  const out = new Grid(g.width, g.height);
  const cx = pivotX * 8.0;
  const cy = pivotY * 8.0;
  for (let j = 0; j < g.height; j++) {
    for (let i = 0; i < g.width; i++) {
      const bx = i * 8 + 4 + 0.5 - cx;
      const by = j * 8 + 4 + 0.5 - cy;
      const sx = Math.floor(cosT * bx + sinT * by + cx);
      const sy = Math.floor(-sinT * bx + cosT * by + cy);
      if (big.contains(sy, sx)) out.set(j, i, big.get(sy, sx));
    }
  }
  return out;
}

/** Drop lone pixels (at most one filled 4-neighbour) and fill pinholes (all four filled) with the more common neighbouring label. */
function tidyLabels(input: Grid): Grid {
  const g = input.copy();
  for (let pass = 0; pass < 2; pass++) {
    let src = g.copy();
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if (src.get(y, x) !== 0 && src.n4(y, x) <= 1) g.set(y, x, 0);
      }
    }
    src = g.copy();
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if (src.get(y, x) === 0 && src.n4(y, x) === 4) {
          const around = [src.get(y - 1, x), src.get(y + 1, x), src.get(y, x - 1), src.get(y, x + 1)];
          const marks = around.filter((v) => v === MARK_LABEL).length;
          const coat = around.filter((v) => v === COAT_LABEL).length;
          g.set(y, x, marks > coat ? MARK_LABEL : COAT_LABEL);
        }
      }
    }
  }
  return g;
}

// MARK: - Sculpted heads (3D → pixels)

interface V3 {
  x: number;
  y: number;
  z: number;
}

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: V3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

/** cos/sin tables for the camera. */
const YAWS: readonly (readonly [number, number])[] = [
  [0.9689124217106447, 0.24740395925452294],
  [0.9393727128473789, 0.34289780745545134],
  [0.9004471023526769, 0.43496553411123023],
];
const PITCHES: readonly (readonly [number, number])[] = [
  [0.9950041652780258, 0.09983341664682815],
  [0.9887710779360422, 0.14943813247359922],
  [0.9800665778412416, 0.19866933079506122],
];
const ROLLS: readonly (readonly [number, number])[] = [
  [1.0, 0.0],
  [0.9887710779360422, 0.14943813247359922],
  [0.9887710779360422, -0.14943813247359922],
];

/** Pixel eyes stamped where each 3D eye projects; dx is mirrored per side. */
const EYE_STAMPS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0], [1, 0]], // tall
  [[0, 0], [0, 1], [1, 0], [1, 1]], // wide
  [[1, 0], [1, 1]], // sleepy
];
/** `SculptParams.eyeKind` and `.coat` as traits, by index. */
const SCULPTED_EYES: readonly EyeKind[] = ['tall', 'wide', 'sleepy'];
const SCULPTED_COATS: readonly Coat[] = ['plain', 'plain', 'calico', 'points'];

interface SculptParams {
  rx: number;
  ry: number;
  earBaseX: number;
  earTipX: number;
  earTipY: number;
  earRadius: number;
  muzzle: number;
  eyeX: number;
  eyeY: number;
  eyeKind: number;
  nose: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  faceLeft: boolean;
  /** 0, 1 plain; 2 calico; 3 points */
  coat: number;
}

/** Nine `unit()` draws first, then the integers, each in this order. */
function sculptParams(rng: SplitMix64): SculptParams {
  const rnd = (lo: number, hi: number): number => lo + (hi - lo) * rng.unit();
  const rx = rnd(0.92, 1.08);
  const ry = rnd(0.74, 0.88);
  const earBaseX = rnd(0.48, 0.62);
  const earTipX = rnd(0.7, 0.92);
  const earTipY = rnd(1.1, 1.4);
  const earRadius = rnd(0.3, 0.42);
  const muzzle = rnd(0.8, 1.2);
  const eyeX = rnd(0.34, 0.44);
  const eyeY = rnd(0.02, 0.14);
  const eyeKind = rng.int(3);
  const nose = rng.int(3) !== 0;
  const yaw = rng.int(3);
  const pitch = rng.int(3);
  const roll = rng.int(3);
  const faceLeft = rng.int(2) === 0;
  const coat = rng.int(4);
  return { rx, ry, earBaseX, earTipX, earTipY, earRadius, muzzle, eyeX, eyeY, eyeKind, nose, yaw, pitch, roll, faceLeft, coat };
}

function sdEllipsoid(p: V3, c: V3, r: V3): number {
  const q = v3((p.x - c.x) / r.x, (p.y - c.y) / r.y, (p.z - c.z) / r.z);
  const k0 = length(q);
  const k1 = length(v3(q.x / r.x, q.y / r.y, q.z / r.z));
  return (k0 * (k0 - 1.0)) / Math.max(k1, 1e-9);
}

function sdCone(p: V3, base: V3, tip: V3, r0: number, r1: number): number {
  const ba = sub(tip, base);
  const pa = sub(p, base);
  const h = Math.min(Math.max(dot(pa, ba) / dot(ba, ba), 0.0), 1.0);
  return length(sub(pa, scale(ba, h))) - (r0 + (r1 - r0) * h);
}

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0.0), 1.0);
  return b * (1.0 - h) + a * h - k * h * (1.0 - h);
}

function earSDF(p: V3, s: SculptParams, sx: number): number {
  return sdCone(p, v3(s.earBaseX * sx, 0.45, 0.05), v3(s.earTipX * sx, s.earTipY, 0.05), s.earRadius, 0.02);
}

function headSDF(p: V3, s: SculptParams): number {
  let d = sdEllipsoid(p, v3(0.0, 0.0, 0.0), v3(s.rx, s.ry, 0.85));
  d = smoothMin(d, earSDF(p, s, -1.0), 0.08);
  d = smoothMin(d, earSDF(p, s, 1.0), 0.08);
  const m = s.muzzle;
  return smoothMin(d, sdEllipsoid(p, v3(0.0, -0.25, 0.55), v3(0.42 * m, 0.28 * m, 0.35)), 0.12);
}

function sculptedHead(rng: SplitMix64): { grid: Grid; params: SculptParams } {
  const s = sculptParams(rng);
  const [cy, sy0] = YAWS[s.yaw];
  const sy = s.faceLeft ? -sy0 : sy0;
  const [cp, sp] = PITCHES[s.pitch];
  const fwd = v3(-sy * cp, -sp, -cy * cp);
  let right = v3(cy, 0.0, -sy);
  let up = v3(
    right.y * fwd.z - right.z * fwd.y,
    right.z * fwd.x - right.x * fwd.z,
    right.x * fwd.y - right.y * fwd.x,
  );
  if (up.y < 0) up = scale(up, -1.0);
  const [cr, sr] = ROLLS[s.roll];
  [right, up] = [add(scale(right, cr), scale(up, sr)), sub(scale(up, cr), scale(right, sr))];
  const rawLight = v3(s.faceLeft ? 0.55 : -0.55, 0.7, 0.45);
  const lightLength = length(rawLight);
  const light = v3(rawLight.x / lightLength, rawLight.y / lightLength, rawLight.z / lightLength);

  const res = 14;
  const extent = 2.7;
  const center = v3(0.0, 0.2, 0.0);
  const shade = new Grid(res, res, -1); // -1 miss, 0...2 light band, 3 hole
  const ears = new Grid(res, res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const u = ((i + 0.5) / res - 0.5) * extent;
      const w = (0.5 - (j + 0.5) / res) * extent;
      const o = sub(add(add(center, scale(right, u)), scale(up, w)), scale(fwd, 5.0));
      let t = 0.0;
      let hit = false;
      for (let step = 0; step < 96; step++) {
        const d = headSDF(add(o, scale(fwd, t)), s);
        if (d < 1e-3) {
          hit = true;
          break;
        }
        t += d * 0.9;
        if (t > 10.0) break;
      }
      if (!hit) continue;
      const p = add(o, scale(fwd, t));
      const e = 1e-3;
      const n = v3(
        headSDF(v3(p.x + e, p.y, p.z), s) - headSDF(v3(p.x - e, p.y, p.z), s),
        headSDF(v3(p.x, p.y + e, p.z), s) - headSDF(v3(p.x, p.y - e, p.z), s),
        headSDF(v3(p.x, p.y, p.z + e), s) - headSDF(v3(p.x, p.y, p.z - e), s),
      );
      const ndl = dot(n, light) / (length(n) + 1e-12);
      shade.set(j, i, ndl > 0.45 ? 0 : ndl > 0.05 ? 1 : 2);
      ears.set(j, i, p.y > 0.62 ? 1 : 0);
    }
  }
  const hitGrid = shade.mapped((v) => (v >= 0 ? 1 : 0));

  const pixelOf = (e: V3): [number, number] => {
    const d = sub(e, center);
    const i = Math.floor((dot(d, right) / extent + 0.5) * res);
    const j = Math.floor((0.5 - dot(d, up) / extent) * res);
    return [j, i];
  };
  const interior = (j: number, i: number): boolean => {
    if (!(j >= 1 && j < res - 1 && i >= 1 && i < res - 1)) return false;
    return (
      hitGrid.get(j, i) !== 0 &&
      hitGrid.get(j - 1, i) !== 0 &&
      hitGrid.get(j + 1, i) !== 0 &&
      hitGrid.get(j, i - 1) !== 0 &&
      hitGrid.get(j, i + 1) !== 0
    );
  };
  const touches = (j: number, i: number, cells: readonly (readonly [number, number])[]): boolean =>
    cells.some((c) => Math.abs(j - c[0]) <= 1 && Math.abs(i - c[1]) <= 1);

  const radii = v3(s.rx, s.ry, 0.85);
  let eyeCells: [number, number][] = [];
  for (const sx of [-1.0, 1.0]) {
    const x = s.eyeX * sx;
    const y = s.eyeY;
    const q = 1.0 - (x / radii.x) * (x / radii.x) - (y / radii.y) * (y / radii.y);
    const eyePoint = v3(x, y, radii.z * Math.sqrt(Math.max(q, 0.0)));
    const normal = v3(eyePoint.x / (radii.x * radii.x), eyePoint.y / (radii.y * radii.y), eyePoint.z / (radii.z * radii.z));
    if (-dot(normal, fwd) / length(normal) < 0.25) continue; // eye faces away
    let [j0, i0] = pixelOf(eyePoint);
    const side = sx < 0 ? -1 : 1;
    const stamp = EYE_STAMPS[s.eyeKind];
    // an eye on the silhouette edge steps one pixel toward the face centre
    if (!stamp.every((c) => interior(j0 + c[0], i0 + c[1] * side))) {
      i0 -= side;
    }
    const placed: [number, number][] = [];
    for (const [dy, dx] of stamp) {
      const j = j0 + dy;
      const i = i0 + dx * side;
      // never touch the other eye, or the two merge into one long hole
      if (interior(j, i) && !touches(j, i, eyeCells)) {
        shade.set(j, i, 3);
        placed.push([j, i]);
      }
    }
    eyeCells = eyeCells.concat(placed);
  }
  if (s.nose) {
    const m = s.muzzle;
    const z = 0.55 + 0.35 * Math.sqrt(Math.max(1.0 - (0.08 / (0.28 * m)) * (0.08 / (0.28 * m)), 0.0));
    const [j, i] = pixelOf(v3(0.0, -0.17, z));
    if (interior(j, i) && !touches(j, i, eyeCells)) {
      shade.set(j, i, 3);
    }
  }

  const bandAlpha = [255, 200, 140];
  const fur = shade.mapped((v) => (v >= 0 && v <= 2 ? 1 : 0));
  let marks = new Grid(res, res);
  switch (s.coat) {
    case 2:
      marks = deepFold(fur, rng, 48);
      break;
    case 3:
      marks = ears;
      break;
    default:
      break;
  }
  const out = new Grid(res, res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const v = shade.get(j, i);
      if (v < 0 || v === 3) continue;
      let a = bandAlpha[v];
      if (marks.get(j, i) !== 0) a = Math.trunc((a * 60) / 100);
      out.set(j, i, a);
    }
  }
  return { grid: out.cropped(), params: s };
}

// MARK: - Entry points

function pixelCat(style: CatStyle, grid: Grid): PixelCat {
  return { style, width: grid.width, height: grid.height, alpha: Uint8Array.from(grid.cells) };
}

const labelAlpha = (head: Head, value: number): number =>
  value === COAT_LABEL ? head.coatAlpha : value === MARK_LABEL ? head.markAlpha : 0;

function generate(seed: bigint): { cat: PixelCat; traits: PixelCatTraits } {
  assertSeed(seed);
  const rng = new SplitMix64(seed);
  const style = STYLES[rng.weighted(STYLE_WEIGHTS)];
  switch (style) {
    case 'flat': {
      const head = flatHead(rng, TEMPLATE_WEIGHTS, EYE_WEIGHTS, MOUTH_WEIGHTS);
      return {
        cat: pixelCat(style, head.labels.cropped().mapped((v) => labelAlpha(head, v))),
        traits: headTraits(style, head),
      };
    }
    case 'tilted': {
      const head = tiltedHead(rng);
      return {
        cat: pixelCat(style, head.labels.mapped((v) => labelAlpha(head, v))),
        traits: headTraits(style, head),
      };
    }
    case 'sculpted': {
      const { grid, params } = sculptedHead(rng);
      const coat = SCULPTED_COATS[params.coat];
      const eye = SCULPTED_EYES[params.eyeKind];
      return {
        cat: pixelCat(style, grid),
        traits: { style, coat, eye, template: null, line: traitsLine(style, coat, eye, null) },
      };
    }
  }
}

function headTraits(style: CatStyle, head: Head): PixelCatTraits {
  return {
    style,
    coat: head.coat,
    eye: head.eye,
    template: head.template,
    line: traitsLine(style, head.coat, head.eye, head.template),
  };
}

/** The cat for a seed (a u64 as a bigint). */
export function catForSeed(seed: bigint): PixelCat {
  return generate(seed).cat;
}

/** The cat for a display name. Leading and trailing whitespace is ignored; everything else, including case, is significant. */
export function catForName(name: string): PixelCat {
  return catForSeed(seedForName(name));
}

/** The traits of `catForSeed`: the same generation, so it costs one cat. */
export function traitsForSeed(seed: bigint): PixelCatTraits {
  return generate(seed).traits;
}

/** `catForSeed` and `traitsForSeed` from one generation, for a caller that needs both. */
export function catAndTraitsForSeed(seed: bigint): { cat: PixelCat; traits: PixelCatTraits } {
  return generate(seed);
}
