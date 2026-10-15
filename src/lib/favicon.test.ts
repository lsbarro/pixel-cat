// The tab icon's data URL. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faviconUrl } from './favicon.ts';
import { DISC_COLORS, discIndexForSeed } from './pixel-cat/index.ts';

const PREFIX = 'data:image/svg+xml,';
const body = (seed: bigint) => faviconUrl(seed).slice(PREFIX.length);
const discFill = (seed: bigint) => decodeURIComponent(body(seed)).match(/<circle [^>]*fill="([^"]+)"/)?.[1];

test('the icon is an SVG data URL', () => {
  assert.ok(faviconUrl(42n).startsWith(PREFIX));
});

test('the icon draws the cat on the disc its seed implies', () => {
  assert.equal(discFill(42n), DISC_COLORS[discIndexForSeed(42n)].hex);
});

test('the icon holds no quote, hash or angle bracket', () => {
  assert.doesNotMatch(body(42n), /["#<>]/);
});

test('the same seed gives the same icon', () => {
  assert.equal(faviconUrl(42n), faviconUrl(42n));
});

test('seeds on different discs give different disc colours', () => {
  assert.notEqual(42n % 6n, 43n % 6n);
  assert.notEqual(discFill(42n), discFill(43n));
});
