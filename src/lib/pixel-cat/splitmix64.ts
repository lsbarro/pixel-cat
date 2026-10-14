// FNV-1a 64 and SplitMix64, ported from the two cats iPhone app's generator (https://twocats.sbarro.dev).
// u64 maths needs BigInt: a JS number only holds 53 bits.

const MASK = 0xffffffffffffffffn;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x00000100000001b3n;
/** The state's per-output step (the golden-ratio constant). */
const INCREMENT = 0x9e3779b97f4a7c15n;
/** 2^53, as the Swift source writes it. */
const TWO_POW_53 = 9007199254740992.0;

/** Throws unless `seed` is an integer in 0…2^64−1, the range of Swift's UInt64. */
export function assertSeed(seed: bigint): void {
  if (typeof seed !== 'bigint' || seed < 0n || seed > MASK) {
    throw new RangeError(`A cat seed is an integer from 0 to ${MASK}, got ${String(seed)}`);
  }
}

/** FNV-1a 64 of `bytes`. */
export function fnv1a64(bytes: Uint8Array): bigint {
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash;
}

/**
 * SplitMix64. `int(n)` is `next() % n`; the tiny modulo bias doesn't matter here and keeps every
 * implementation trivially identical. Every draw the Swift generator makes must be made here, in the
 * same order, or the cats diverge.
 */
export class SplitMix64 {
  #state: bigint;

  constructor(seed: bigint) {
    assertSeed(seed);
    this.#state = seed;
  }

  next(): bigint {
    this.#state = (this.#state + INCREMENT) & MASK;
    let z = this.#state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return z ^ (z >> 31n);
  }

  int(n: number): number {
    return Number(this.next() % BigInt(n));
  }

  /** Uniform in [0, 1) from the top 53 bits. */
  unit(): number {
    return Number(this.next() >> 11n) * (1.0 / TWO_POW_53);
  }

  weighted(weights: readonly number[]): number {
    let r = this.int(weights.reduce((sum, w) => sum + w, 0));
    for (let i = 0; i < weights.length; i++) {
      if (r < weights[i]) return i;
      r -= weights[i];
    }
    throw new Error('weights must be positive');
  }
}
