import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes sw.js at build time with the list of files to cache for offline use. The Noto fallback
 * subsets (large, only needed for non-Latin character sets) and legacy .woff files are left out;
 * the worker caches those when they are first used.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'sw.js' && !/\.woff$/.test(f) && !/noto-sans|plex-sans-thai-(?!thai)/.test(f));
      const precache = [...new Set(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', ...files])];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync('pwa/sw-template.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = '${version}';\n\n${template}`,
      });
    },
  };
}

// GitHub Pages serves the site from /<repo-name>/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/dither-ascii-generator/' : '/',
  plugins: [serviceWorker()],
});
