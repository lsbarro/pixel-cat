// The generator page's current cat as a query string: `?name=<name>` or `?seed=<decimal>`, nothing for the
// default cat. Pure, so `npm test` covers it; the page script does the `history.replaceState`.
import {
  assertSeed,
  discIndexForName,
  discIndexForSeed,
  seedForName,
  trimName,
} from './pixel-cat/index.ts';

export type CatState = { kind: 'name'; name: string } | { kind: 'seed'; seed: bigint };

/** The cat the page shows when nothing is chosen. */
export const DEFAULT_NAME = 'pixel cat';

/** A u64 in decimal is at most 20 digits; anything longer is out of range before it is parsed. */
const DECIMAL_SEED = /^[0-9]{1,20}$/;

/** A decimal string as a seed, or `null` unless it is an integer in 0…2^64−1. */
export function parseSeed(text: string): bigint | null {
  if (!DECIMAL_SEED.test(text)) return null;
  const seed = BigInt(text);
  try {
    assertSeed(seed);
  } catch {
    return null;
  }
  return seed;
}

/**
 * The cat a query string names, or `null` for the default cat. `seed` wins over `name`, and a `seed` that is
 * present but invalid gives the default cat rather than falling through to `name`. A name is trimmed as the
 * app trims it, and a blank one is the default.
 */
export function parseState(search: string): CatState | null {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  if (seedText !== null) {
    const seed = parseSeed(seedText);
    return seed === null ? null : { kind: 'seed', seed };
  }
  const name = trimName(params.get('name') ?? '');
  return name === '' ? null : { kind: 'name', name };
}

/** The query string for a state, with its `?`, or `''` for the default cat. */
export function serializeState(state: CatState | null): string {
  if (state === null) return '';
  if (state.kind === 'seed') return `?seed=${state.seed}`;
  const name = trimName(state.name);
  return name === '' ? '' : `?${new URLSearchParams({ name })}`;
}

/** The seed and disc colour a state draws: a name hashes as the app hashes it, a seed is used as is. */
export function resolveState(state: CatState | null): { seed: bigint; discIndex: number } {
  if (state?.kind === 'seed') return { seed: state.seed, discIndex: discIndexForSeed(state.seed) };
  const name = state === null ? DEFAULT_NAME : trimName(state.name);
  return { seed: seedForName(name), discIndex: discIndexForName(name) };
}

/** Characters that no common filesystem allows in a filename, plus control characters. */
const UNSAFE_FILENAME = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

/** The start of a download's filename: the name with unsafe characters replaced by `-`, or `seed-<N>`. */
export function fileStem(state: CatState | null): string {
  if (state?.kind === 'seed') return `seed-${state.seed}`;
  const name = (state === null ? DEFAULT_NAME : trimName(state.name)).replace(UNSAFE_FILENAME, '-');
  // A name of only dots would be a hidden or relative-path filename.
  return /^\.*$/.test(name) ? 'cat' : name;
}
