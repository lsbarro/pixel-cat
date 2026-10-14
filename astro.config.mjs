// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://pixelcat.sbarro.dev',
  build: {
    // Every page's CSS is a few KB, so inlining it saves a render-blocking request per stylesheet.
    inlineStylesheets: 'always',
  },
  integrations: [sitemap()],
  vite: {
    // Pin the tsconfig so the build doesn't pick up a tsconfig.json from a parent directory.
    tsconfig: './tsconfig.json',
  },
});
