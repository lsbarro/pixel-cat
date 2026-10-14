// What the app does to a display name before it draws a cat: trim, then hash the UTF-8 bytes
// (PixelCatGenerator.seed(forName:)). Case and Unicode normalisation are significant.
import { fnv1a64 } from './splitmix64.ts';

// The scalars Foundation's `.whitespacesAndNewlines` trims, as inclusive [first, last] ranges. It is not
// JavaScript's `trim()` set: Foundation trims U+0085 and U+200B and keeps U+FEFF. `fixtures.json` carries the
// list as Swift reports it for every code point, and the parity test checks this table against it.
export const TRIMMED_SCALARS: readonly (readonly [number, number])[] = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200b],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

export function isTrimmedScalar(codePoint: number): boolean {
  return TRIMMED_SCALARS.some(([first, last]) => codePoint >= first && codePoint <= last);
}

/** The name as the app saves it: Foundation whitespace and newlines removed from both ends. */
export function trimName(name: string): string {
  const scalars = Array.from(name);
  let start = 0;
  let end = scalars.length;
  while (start < end && isTrimmedScalar(scalars[start].codePointAt(0)!)) start++;
  while (end > start && isTrimmedScalar(scalars[end - 1].codePointAt(0)!)) end--;
  return scalars.slice(start, end).join('');
}

/** FNV-1a 64 of the trimmed name's UTF-8 bytes. */
export function seedForName(name: string): bigint {
  return fnv1a64(new TextEncoder().encode(trimName(name)));
}
