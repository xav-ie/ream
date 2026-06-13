import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';

// Static site served by the Go backend out of ./dist. The API lives on the
// same origin under /api, so no base/site rewriting is needed.
export default defineConfig({
  // injectReset:false — global.css carries our own minimal reset, matching the
  // reference site's setup and avoiding a hard dep on @unocss/reset's subpath.
  integrations: [UnoCSS({ injectReset: false })],
  build: {
    // Single small CSS bundle inlined into each <head> — no extra request.
    inlineStylesheets: 'always',
  },
});
