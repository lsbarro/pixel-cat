// What the home page shows about a cat, as data: the "how it works" steps and the gallery tiles. Pure, so the
// page draws the same text at build time (for crawlers and no-JS readers) as its script does in the browser.
import { catAndTraitsForSeed } from './pixel-cat/generator.ts';
import {
  DISC_COLORS,
  discIndexForSeed,
  spriteSvg,
  traitsForSeed,
  trimName,
  type Coat,
  type DiscColor,
} from './pixel-cat/index.ts';
import { DEFAULT_NAME, resolveState, type CatState } from './share-state.ts';

/** Step 1 shows at most this many of the name's bytes. */
const SHOWN_BYTES = 18;

const COAT_LABEL: Record<Coat, string> = {
  plain: 'Plain',
  calico: 'Calico',
  tabby: 'Tabby',
  points: 'Siamese',
  dark: 'Dark',
  tuxedo: 'Tuxedo',
};

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const hex64 = (seed: bigint): string => `0x${seed.toString(16).padStart(16, '0')}`;

export interface HowItWorks {
  /** The trimmed name, or `null` for a cat chosen by seed. */
  name: string | null;
  /** "“Milo”" or "this seed", as in "From … to a cat". */
  subject: string;
  step1Title: string;
  step1Value: string;
  step1Body: string;
  /** The seed in decimal, and as `0x` + 16 hex digits. */
  seed: string;
  seedHex: string;
  step2Body: string;
  /** The generator's choices, in the order it draws them. */
  draws: { key: string; value: string }[];
  discIndex: number;
  disc: DiscColor;
  step4Body: string;
}

/** The five "how it works" steps for a state, from its name's bytes to its disc. */
export function howItWorks(state: CatState | null): HowItWorks {
  const { seed, discIndex } = resolveState(state);
  const name = state?.kind === 'seed' ? null : state === null ? DEFAULT_NAME : trimName(state.name);
  const disc = DISC_COLORS[discIndex];
  const traits = traitsForSeed(seed);
  const draws = [
    { key: 'Style', value: capitalized(traits.style) },
    { key: 'Coat', value: COAT_LABEL[traits.coat] },
    { key: 'Eyes', value: capitalized(traits.eye) },
  ];
  if (traits.template !== null) draws.push({ key: 'Ears', value: capitalized(traits.template) });

  if (name === null) {
    return {
      name,
      subject: 'this seed',
      step1Title: 'No name',
      step1Value: 'random seed',
      step1Body: 'A random cat has no name, so it starts from its seed.',
      seed: seed.toString(),
      seedHex: hex64(seed),
      step2Body: 'Any whole number from 0 to 2^64 − 1 is a cat.',
      draws,
      discIndex,
      disc,
      step4Body: `${disc.name}: the seed mod 6.`,
    };
  }
  const bytes = Array.from(new TextEncoder().encode(name), (byte) => byte.toString(16).padStart(2, '0'));
  return {
    name,
    subject: `“${name}”`,
    step1Title: 'The name, as bytes',
    step1Value: bytes.length > SHOWN_BYTES ? `${bytes.slice(0, SHOWN_BYTES).join(' ')} …` : bytes.join(' '),
    step1Body: 'Trimmed at either end, then read as UTF-8. Case counts.',
    seed: seed.toString(),
    seedHex: hex64(seed),
    step2Body: 'The bytes are hashed with FNV-1a 64.',
    draws,
    discIndex,
    disc,
    step4Body: `${disc.name}, from a second hash of the name.`,
  };
}

/**
 * An SVG as a `data:` URL for an `<img src>`. Only the characters a URL or an HTML attribute can't hold are
 * escaped, so the markup stays close to the SVG's own size.
 */
export function svgDataUrl(svg: string): string {
  const escaped = svg.replace(/[%#<>"]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `data:image/svg+xml,${escaped}`;
}

/** A gallery or wall tile: the white sprite on its disc colour, labelled with its traits. */
export interface CatTile {
  seed: bigint;
  discHex: string;
  label: string;
  spriteUrl: string;
}

export function catTile(seed: bigint): CatTile {
  const { cat, traits } = catAndTraitsForSeed(seed);
  return {
    seed,
    discHex: DISC_COLORS[discIndexForSeed(seed)].hex,
    label: traits.line,
    spriteUrl: svgDataUrl(spriteSvg(cat, { xmlns: true })),
  };
}

/** `#rrggbb` at `t` of the way from `base` (t = 0) to `hex` (t = 1). */
export function mix(hex: string, t: number, base: string): string {
  const channels = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const to = channels(hex);
  const from = channels(base);
  return `#${from.map((value, i) => Math.round(value + (to[i] - value) * t).toString(16).padStart(2, '0')).join('')}`;
}
