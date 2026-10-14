// The PNG downloads' pixels and layout. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVATAR_CAT_FRACTION, catForName, catForSeed } from './pixel-cat/index.ts';
import { avatarLayout, spriteLayout, spriteRgba } from './raster.ts';

test("spriteRgba repeats each of Liam's pixels 3×3, white with the cat's alpha", () => {
  const cat = catForName('Liam');
  const rgba = spriteRgba(cat, 3);
  const width = cat.width * 3;
  assert.equal(rgba.length, width * cat.height * 3 * 4);
  for (let y = 0; y < cat.height * 3; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      assert.deepEqual([...rgba.subarray(i, i + 3)], [255, 255, 255]);
      assert.equal(rgba[i + 3], cat.alpha[Math.floor(y / 3) * cat.width + Math.floor(x / 3)]);
    }
  }
});

test('spriteRgba at scale 1 is the alpha grid itself', () => {
  const cat = catForName('Liam');
  const alpha = spriteRgba(cat).filter((_, i) => i % 4 === 3);
  assert.deepEqual([...alpha], [...cat.alpha]);
  assert.throws(() => spriteRgba(cat, 0), RangeError);
  assert.throws(() => spriteRgba(cat, 1.5), RangeError);
});

test('the sprite is centred at the largest whole-number scale, the spare pixel trailing horizontally', () => {
  const cat = { style: 'flat' as const, width: 12, height: 11, alpha: new Uint8Array(132) };
  // 256 / 12 = 21.3, so scale 21: 252 × 231 px.
  assert.deepEqual(spriteLayout(cat, 256), { scale: 21, width: 252, height: 231, left: 2, top: 13 });
  // The vertical margin of 25 rounds the app's way: 13 above, 12 below.
  assert.equal(256 - 231 - 13, 12);
  assert.throws(() => spriteLayout(cat, 11), RangeError);
  assert.throws(() => spriteLayout(cat, 256.5), RangeError);
});

test("the avatar cat's longer side is about AVATAR_CAT_FRACTION of the disc, in whole pixels", () => {
  for (const size of [256, 512, 1024]) {
    for (let seed = 0n; seed < 50n; seed++) {
      const cat = catForSeed(seed);
      const l = avatarLayout(cat, size);
      assert.ok(Number.isInteger(l.scale) && l.scale >= 1);
      assert.equal(l.width, cat.width * l.scale);
      assert.equal(l.height, cat.height * l.scale);
      const longer = Math.max(l.width, l.height);
      assert.ok(longer <= size * AVATAR_CAT_FRACTION, `${longer} of ${size}`);
      assert.ok(longer + Math.max(cat.width, cat.height) > size * AVATAR_CAT_FRACTION - 1, `${longer} of ${size}`);
      assert.ok(Math.abs(l.left + l.width / 2 - size / 2) <= 0.5);
      assert.ok(Math.abs(l.top + l.height / 2 - size / 2) <= 0.5);
    }
  }
});
