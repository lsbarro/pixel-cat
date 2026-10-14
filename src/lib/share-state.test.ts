// The page's URL state: what `?name=` and `?seed=` parse to, and back. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discIndexForName, discIndexForSeed, seedForName } from './pixel-cat/index.ts';
import { DEFAULT_NAME, fileStem, parseState, resolveState, serializeState, type CatState } from './share-state.ts';

const MAX = 18446744073709551615n;

test('a name, seed 0 and seed 2^64−1 round-trip through the query string', () => {
  const states: CatState[] = [
    { kind: 'name', name: 'Liam' },
    { kind: 'name', name: 'Mary Jo & co?' },
    { kind: 'name', name: 'Zoë 🐈' },
    { kind: 'seed', seed: 0n },
    { kind: 'seed', seed: MAX },
  ];
  for (const state of states) assert.deepEqual(parseState(serializeState(state)), state);
  assert.equal(serializeState({ kind: 'seed', seed: MAX }), '?seed=18446744073709551615');
});

test('a seed outside 0…2^64−1 or not a decimal integer gives the default cat', () => {
  for (const seed of ['-1', '18446744073709551616', 'abc', '', '1e3', '0x10', ' 5', '1.0', '9'.repeat(400)]) {
    assert.equal(parseState(`?seed=${encodeURIComponent(seed)}`), null, seed);
  }
});

test('an invalid seed does not fall through to the name', () => {
  assert.equal(parseState('?seed=abc&name=Liam'), null);
  assert.deepEqual(parseState('?name=Liam&seed=7'), { kind: 'seed', seed: 7n });
});

test('a name is trimmed as the app trims it, and a blank one is the default', () => {
  assert.deepEqual(parseState('?name=%20Liam%0A'), { kind: 'name', name: 'Liam' });
  assert.equal(parseState('?name=%20%E2%80%8B'), null);
  assert.equal(parseState(''), null);
  assert.equal(serializeState(null), '');
  assert.equal(serializeState({ kind: 'name', name: '  ' }), '');
  assert.equal(serializeState({ kind: 'name', name: ' Liam ' }), '?name=Liam');
});

test('resolveState hashes a name and its disc as the app does, and uses a seed as is', () => {
  assert.deepEqual(resolveState({ kind: 'name', name: ' Liam ' }), {
    seed: seedForName('Liam'),
    discIndex: discIndexForName('Liam'),
  });
  assert.deepEqual(resolveState(null), { seed: seedForName(DEFAULT_NAME), discIndex: discIndexForName(DEFAULT_NAME) });
  assert.deepEqual(resolveState({ kind: 'seed', seed: MAX }), { seed: MAX, discIndex: discIndexForSeed(MAX) });
});

test('fileStem keeps a name safe for a filename and names a seed by its number', () => {
  assert.equal(fileStem({ kind: 'name', name: 'Liam' }), 'Liam');
  assert.equal(fileStem({ kind: 'name', name: 'a/b\\c:d*e?f"g<h>i|j\tk' }), 'a-b-c-d-e-f-g-h-i-j-k');
  assert.equal(fileStem({ kind: 'name', name: '..' }), 'cat');
  assert.equal(fileStem({ kind: 'seed', seed: 42n }), 'seed-42');
  assert.equal(fileStem(null), DEFAULT_NAME);
});
