// The home page's "how it works" steps and gallery tiles. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catForSeed,
  DISC_COLORS,
  discIndexForName,
  discIndexForSeed,
  seedForName,
  spriteSvg,
  traitsForSeed,
} from './pixel-cat/index.ts';
import { catTile, howItWorks, mix, svgDataUrl } from './page.ts';
import { DEFAULT_NAME } from './share-state.ts';

test('the default cat is the default name, as bytes', () => {
  const steps = howItWorks(null);
  assert.equal(steps.name, DEFAULT_NAME);
  assert.equal(steps.subject, '“pixel cat”');
  assert.equal(steps.step1Value, '70 69 78 65 6c 20 63 61 74');
  assert.equal(steps.seed, seedForName(DEFAULT_NAME).toString());
  assert.equal(steps.discIndex, discIndexForName(DEFAULT_NAME));
  assert.equal(steps.step4Body, `${steps.disc.name}, from a second hash of the name.`);
});

test('a name is trimmed, and only its first 18 bytes are shown', () => {
  assert.equal(howItWorks({ kind: 'name', name: '  Zoë ' }).step1Value, '5a 6f c3 ab');
  const long = howItWorks({ kind: 'name', name: 'abcdefghijklmnopqrstuvwxyz' });
  assert.equal(long.subject, '“abcdefghijklmnopqrstuvwxyz”');
  assert.equal(long.step1Value, '61 62 63 64 65 66 67 68 69 6a 6b 6c 6d 6e 6f 70 71 72 …');
  assert.equal(howItWorks({ kind: 'name', name: 'abcdefghijklmnopqr' }).step1Value.endsWith('…'), false);
});

test('a seed has no name, a padded hex seed and the seed-mod-6 disc', () => {
  const steps = howItWorks({ kind: 'seed', seed: 255n });
  assert.equal(steps.name, null);
  assert.equal(steps.subject, 'this seed');
  assert.equal(steps.step1Title, 'No name');
  assert.equal(steps.seed, '255');
  assert.equal(steps.seedHex, '0x00000000000000ff');
  assert.equal(steps.discIndex, 255 % 6);
  assert.equal(steps.step4Body, `${DISC_COLORS[3].name}: the seed mod 6.`);
  assert.equal(howItWorks({ kind: 'seed', seed: 2n ** 64n - 1n }).seedHex, '0xffffffffffffffff');
});

test('the draws follow the traits, with Siamese for points and no ears on a sculpted cat', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => BigInt(i));
  const sculpted = seeds.find((seed) => traitsForSeed(seed).style === 'sculpted');
  const points = seeds.find((seed) => traitsForSeed(seed).coat === 'points');
  assert.ok(sculpted !== undefined && points !== undefined);
  assert.deepEqual(
    howItWorks({ kind: 'seed', seed: sculpted }).draws.map((draw) => draw.key),
    ['Style', 'Coat', 'Eyes'],
  );
  const pointsDraws = howItWorks({ kind: 'seed', seed: points }).draws;
  assert.equal(pointsDraws.find((draw) => draw.key === 'Coat')?.value, 'Siamese');
});

test('an SVG data URL decodes back to the SVG and holds no quote, hash or angle bracket', () => {
  const svg = spriteSvg(catForSeed(42n), { xmlns: true });
  const url = svgDataUrl(svg);
  const body = url.slice('data:image/svg+xml,'.length);
  assert.equal(decodeURIComponent(body), svg);
  assert.doesNotMatch(body, /["#<>]/);
});

test('a tile has its disc colour and traits line', () => {
  const tile = catTile(7n);
  assert.equal(tile.discHex, DISC_COLORS[1].hex);
  assert.equal(tile.label, traitsForSeed(7n).line);
  assert.ok(tile.spriteUrl.startsWith('data:image/svg+xml,'));
});

test('a tile is the same as building it from the separate cat and traits', () => {
  for (const seed of [0n, 7n, 42n, 2n ** 64n - 1n]) {
    assert.deepEqual(catTile(seed), {
      seed,
      discHex: DISC_COLORS[discIndexForSeed(seed)].hex,
      label: traitsForSeed(seed).line,
      spriteUrl: svgDataUrl(spriteSvg(catForSeed(seed), { xmlns: true })),
    });
  }
});

test('mix goes from the base colour to the colour', () => {
  assert.equal(mix('#0b2e22', 0, '#f3f6f3'), '#f3f6f3');
  assert.equal(mix('#0b2e22', 1, '#f3f6f3'), '#0b2e22');
  assert.equal(mix('#FFFFFF', 0.5, '#000000'), '#808080');
});
