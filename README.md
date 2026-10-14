# pixel cat

Every person in the [two cats](https://twocats.sbarro.dev) iPhone app gets a pixel cat, generated from
their name. This repo is the same generator as open-source TypeScript, plus the site at
[pixelcat.sbarro.dev](https://pixelcat.sbarro.dev) that shows it off. The same name always gives the same
cat.

## Run it

Needs Node >= 22.18.

```sh
npm ci
npm run dev     # the site at http://localhost:4321
npm test        # the generator against fixtures.json, plus the site's helpers
npm run build   # static site into dist/
```

`npm run check` type-checks the project. `npm run images` redraws the share image and icons in `public/`;
commit what it writes.

## The library

Everything lives in `src/lib/pixel-cat/` and is imported from its `index.ts`. It has no dependencies and no
Node-only imports, so it runs in the browser as well as in Node.

```ts
import { avatarSvg, catForName, DISC_COLORS, discIndexForName, spriteSvg } from './src/lib/pixel-cat/index.ts';

const cat = catForName('Priya');
const sprite = spriteSvg(cat, { size: 256, fill: '#222' });
const avatar = avatarSvg(cat, DISC_COLORS[discIndexForName('Priya')].hex);
```

| Export | What it does |
| --- | --- |
| `catForName(name)` | The cat for a name. The name is trimmed first, the way the app saves it. |
| `catForSeed(seed)` | The cat for a seed: a `bigint` from 0 to 2^64 − 1. |
| `traitsForSeed(seed)` | What the generator chose for that seed: style, coat and eye kind. |
| `seedForName(name)` | The seed a name hashes to (FNV-1a 64 of the trimmed name's UTF-8 bytes). |
| `trimName(name)` | Removes the whitespace the app removes. It is not `String.prototype.trim()`: it also strips U+0085 and U+200B and keeps U+FEFF. |
| `discIndexForName(name)` | Which of the six avatar disc colours a name gets. The name is hashed as given, so `trimName` it first. |
| `discIndexForSeed(seed)` | The disc colour for a chosen seed: `seed % 6`. |
| `DISC_COLORS` | The six disc colours, each with a `name` and a `hex`. |
| `spriteSvg(cat, options?)` | The cat alone as an inline SVG string, centred on a square canvas. |
| `avatarSvg(cat, discHex, options?)` | The cat on its disc as an inline SVG string. |
| `fnv1a64(bytes)` | FNV-1a 64 of a `Uint8Array`, as a `bigint`. |
| `assertSeed(seed)` | Throws a `RangeError` unless the seed is a `bigint` from 0 to 2^64 − 1. |

A cat is `{ style, width, height, alpha }`: a white sprite with one alpha value per pixel, row-major. Alpha 0
is a hole that the avatar disc shows through. `options` for the SVG functions are `fill` and `size`.

## Matches the app exactly

`src/lib/pixel-cat/fixtures.json` was dumped from the app's own generator: 276 cats, each with its seed,
traits and every pixel, plus the whitespace table the name trim follows. `npm test` checks that this
TypeScript produces every one of them byte for byte. The generator's random draws and floating-point
arithmetic are kept in the app's order for that reason, so change them and the tests will say so.

The `.ts` files stay in the erasable subset of TypeScript (no enums, namespaces or parameter properties), so
Node runs them directly.

## Licence

[MIT](LICENSE).
