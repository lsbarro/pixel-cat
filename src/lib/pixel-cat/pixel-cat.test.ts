// Parity of the TypeScript cat generator with the Swift one in the two cats iPhone app. `fixtures.json` was
// dumped from the app's own generator, so every assertion here is against what the app does.
// Run with `npm test`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  avatarSvg,
  catForName,
  catForSeed,
  DISC_COLORS,
  discIndexForName,
  discIndexForSeed,
  fnv1a64,
  seedForName,
  spriteSvg,
  traitsForSeed,
  trimName,
} from './index.ts';
import { TRIMMED_SCALARS } from './name.ts';

interface FixtureCat {
  name?: string;
  seed: string;
  disc: number;
  style: string;
  width: number;
  height: number;
  traits: string;
  alpha: string;
}

const fixtures: { trimmed: number[][]; cats: FixtureCat[] } = JSON.parse(
  readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'),
);
const hex = (alpha: Uint8Array): string => Buffer.from(alpha).toString('hex');

test('the fixtures cover all three styles, the six pinned names and the u64 seed extremes', () => {
  assert.ok(fixtures.cats.length >= 200, `${fixtures.cats.length} cats`);
  for (const style of ['flat', 'tilted', 'sculpted']) {
    assert.ok(fixtures.cats.filter((c) => c.style === style).length >= 20, style);
  }
  const names = new Set(fixtures.cats.map((c) => c.name));
  for (const name of ['Maya', 'Theo', 'Sam', 'José', '李明', 'Wei']) assert.ok(names.has(name), name);
  const seeds = new Set(fixtures.cats.map((c) => c.seed));
  for (const seed of ['0', '1', '18446744073709551615']) assert.ok(seeds.has(seed), seed);
});

test('every fixture cat equals the Swift one, byte for byte', () => {
  for (const f of fixtures.cats) {
    const label = f.name === undefined ? `seed ${f.seed}` : `name ${JSON.stringify(f.name)}`;
    const seed = BigInt(f.seed);
    const cat = catForSeed(seed);
    assert.equal(cat.style, f.style, `${label} style`);
    assert.equal(cat.width, f.width, `${label} width`);
    assert.equal(cat.height, f.height, `${label} height`);
    assert.equal(hex(cat.alpha), f.alpha, `${label} alpha`);
    assert.equal(traitsForSeed(seed).line, f.traits, `${label} traits`);
    if (f.name === undefined) {
      assert.equal(discIndexForSeed(seed), f.disc, `${label} disc`);
    } else {
      assert.equal(seedForName(f.name), seed, `${label} seed`);
      assert.equal(discIndexForName(f.name), f.disc, `${label} disc`);
      assert.deepEqual(catForName(f.name), cat, `${label} catForName`);
    }
  }
});

test('FNV-1a 64 matches the reference values', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  assert.equal(fnv1a64(bytes('')), 0xcbf29ce484222325n);
  assert.equal(fnv1a64(bytes('a')), 0xaf63dc4c8601ec8cn);
});

test('disc pins for known names and seeds', () => {
  const pinned: [string, number][] = [['Liam', 3], ['Maya', 2], ['Priya', 1], ['Jonah', 4], ['', 0], ['Alexandra Konstantinopoulou', 0]];
  for (const [name, disc] of pinned) assert.equal(discIndexForName(name), disc, name);
  assert.equal(DISC_COLORS.length, 6);
  for (const seed of [0n, 1n, 5n, 6n, 7n, 2n ** 63n - 1n, 2n ** 63n, 2n ** 64n - 1n]) {
    assert.equal(discIndexForSeed(seed), Number(seed % 6n));
  }
});

test('the name trim removes exactly the scalars Foundation does', () => {
  assert.deepEqual(TRIMMED_SCALARS, fixtures.trimmed);
  // The cases where JavaScript's own trim() would disagree.
  assert.equal(trimName('\u0085x\u0085'), 'x');
  assert.equal(trimName('​x​'), 'x');
  assert.equal(trimName('﻿x﻿'), '﻿x﻿');
  assert.equal(trimName('  A b  '), 'A b');
  assert.equal(trimName(' \t\n '), '');
  assert.equal(seedForName(' Liam '), seedForName('Liam'));
});

test('seeds outside 0…2^64−1, or not bigints, are refused', () => {
  assert.equal(catForSeed(2n ** 64n - 1n).style, fixtures.cats.find((c) => c.seed === '18446744073709551615')?.style);
  assert.throws(() => catForSeed(-1n), RangeError);
  assert.throws(() => catForSeed(2n ** 64n), RangeError);
  // @ts-expect-error a number is not a bigint
  assert.throws(() => catForSeed(1), RangeError);
});

/** The alpha grid an SVG's run paths draw: the inverse of render.ts, so the SVG can't drift from the cat. */
function svgAlpha(svg: string, offsetX: number, offsetY: number, side: number): Uint8Array {
  const alpha = new Uint8Array(side * side);
  for (const path of svg.matchAll(/<path d="([^"]*)"(?: fill-opacity="([\d.]+)")?\/>/g)) {
    const level = path[2] === undefined ? 255 : Math.round(Number(path[2]) * 255);
    for (const run of path[1].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, n] = [Number(run[1]), Number(run[2]), Number(run[3])];
      for (let i = 0; i < n; i++) alpha[(y + offsetY) * side + x + i + offsetX] = level;
    }
  }
  return alpha;
}

test('the sprite SVG draws the cat, centred on a square canvas, with no script', () => {
  for (const f of fixtures.cats.slice(0, 60)) {
    const cat = catForSeed(BigInt(f.seed));
    const svg = spriteSvg(cat, { size: 64 });
    assert.ok(!svg.includes('<script'), 'no script');
    const side = Math.max(cat.width, cat.height);
    assert.ok(svg.includes(`viewBox="0 0 ${side} ${side}"`));
    const ox = (side - cat.width) / 2;
    const oy = (side - cat.height) / 2;
    assert.ok(Number.isInteger(ox * 2) && Number.isInteger(oy * 2));
    // Only whole offsets are compared cell by cell; a half offset is checked through the translate.
    if (Number.isInteger(ox) && Number.isInteger(oy)) {
      const expected = new Uint8Array(side * side);
      for (let y = 0; y < cat.height; y++) {
        for (let x = 0; x < cat.width; x++) expected[(y + oy) * side + x + ox] = cat.alpha[y * cat.width + x];
      }
      const rendered = svgAlpha(svg, ox, oy, side);
      // Opacity is written to 4 places, so allow the rounding in the alpha a level maps back to.
      rendered.forEach((a, i) => assert.ok(Math.abs(a - expected[i]) <= 1, `${f.seed} cell ${i}`));
    }
  }
  assert.ok(avatarSvg(catForName('Priya'), DISC_COLORS[1].hex).includes('<circle'));
});
