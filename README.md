# Dither / ASCII

Browser-based dither and ASCII art generator. Runs entirely client-side (WebGL2), deployable to GitHub Pages.

See [PLAN.md](PLAN.md) for the roadmap.

## Develop

```bash
npm install
npm run dev
```

`npm run build` type-checks and writes the static site to `dist/`.

## Deploy to GitHub Pages

1. Push this repo to GitHub as `dither-ascii-generator` (the name is used as the base path in `vite.config.ts`).
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.

## Shortcuts

| Key | Action |
|---|---|
| Hold `Space` | Show original |
| `F` / double-click preview | Fit to view |
| `1` | 100% zoom |
| Wheel / drag | Zoom / pan |
| Double-click slider | Reset that value |
| `Ctrl+V` | Paste image |
