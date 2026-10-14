// The pixel cat generator in TypeScript: name or seed → cat, plus the avatar disc and SVG renderings.
// A port of the generator in the two cats iPhone app (https://twocats.sbarro.dev); see the README.
export { catForName, catForSeed, traitsForSeed } from './generator.ts';
export type { CatStyle, Coat, EyeKind, PixelCat, PixelCatTraits } from './generator.ts';
export { DISC_COLORS, discIndexForName, discIndexForSeed } from './avatar.ts';
export type { DiscColor } from './avatar.ts';
export { seedForName, trimName } from './name.ts';
export { AVATAR_CAT_FRACTION, avatarSvg, spriteSvg } from './render.ts';
export type { SvgOptions } from './render.ts';
export { assertSeed, fnv1a64 } from './splitmix64.ts';
