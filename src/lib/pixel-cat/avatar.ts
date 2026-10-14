// The avatar disc, ported from the two cats iPhone app (https://twocats.sbarro.dev).
// A person's disc colour comes from a chosen cat seed when there is one, else from their name.
import { assertSeed } from './splitmix64.ts';

export interface DiscColor {
  name: string;
  hex: string;
}

/** The app's six jewel-tone disc colours, indexed by disc index. */
export const DISC_COLORS: readonly DiscColor[] = [
  { name: 'Forest', hex: '#0F3D2E' },
  { name: 'Sage', hex: '#4F8F75' },
  { name: 'Slate', hex: '#4A6FA5' },
  { name: 'Plum', hex: '#7B5A8C' },
  { name: 'Terracotta', hex: '#B85A4E' },
  { name: 'Amber', hex: '#C18A3B' },
];

/** A chosen seed sets the disc as well as the cat: `seed % 6`. */
export function discIndexForSeed(seed: bigint): number {
  assertSeed(seed);
  return Number(seed % BigInt(DISC_COLORS.length));
}

/**
 * The name's disc index. The name is hashed as given, not trimmed: the app passes the trimmed name, as it
 * is saved, so trim first (`trimName`) to match a stored person. The hash is Int (64-bit) arithmetic over
 * Unicode scalars, wrapping on overflow, and the index is the magnitude mod 6. Changing it changes everyone's
 * disc colour.
 */
export function discIndexForName(name: string): number {
  let h = 0n;
  for (const ch of name) {
    h = BigInt.asIntN(64, (h << 5n) - h + BigInt(ch.codePointAt(0)!));
  }
  const magnitude = h < 0n ? -h : h;
  return Number(magnitude % BigInt(DISC_COLORS.length));
}
