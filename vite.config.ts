import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/dither-ascii-generator/' : '/',
});
