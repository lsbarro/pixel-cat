// The tab icon: a cat on its disc, drawn in the browser so each visit can show a different one.
import { avatarSvg, catForSeed, DISC_COLORS, discIndexForSeed } from './pixel-cat/index.ts';
import { svgDataUrl } from './page.ts';

/** A seed's cat on the disc the seed implies (seed mod 6), as a `data:` URL for a `<link rel="icon">`. */
export function faviconUrl(seed: bigint): string {
  return svgDataUrl(avatarSvg(catForSeed(seed), DISC_COLORS[discIndexForSeed(seed)].hex, { xmlns: true }));
}
