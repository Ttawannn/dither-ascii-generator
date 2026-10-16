# Dither / ASCII

Browser-based dither and ASCII art generator for images, videos and webcam. Runs entirely client-side (WebGL2), deployable to GitHub Pages.

**Live:** https://ttawannn.github.io/dither-ascii-generator/

![Dither / ASCII screenshot](docs/screenshot.png)

## Features

- **Sources:** image upload / drag-drop / paste, video files, webcam (with mirror)
- **Dither:** Bayer 2/4/8, blue noise, halftone dot & line, crosshatch, random noise, threshold, and error diffusion (Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra ×3)
- **Palettes:** mono / duotone with levels, Game Boy, CGA, PICO-8, C64, RGB levels, median-cut from the image
- **ASCII:** standard, detailed, blocks, braille, binary or custom ramps; edge glyphs; 4 fonts; mono, image-colour or colour-background modes
- **Animation:** "boil" — the pattern shifts every frame, on stills or video
- **Presets:** built-in looks, save your own, share a look as a link
- **Export:** PNG (1–8×), SVG, GIF, WebM, MP4, plus ASCII as text / HTML / clipboard

## Develop

```bash
npm install
npm run dev
```

`npm run build` type-checks and writes the static site to `dist/`.

Open `/?sample` to start with the built-in test image.

## Deploy to GitHub Pages

1. Push this repo to GitHub as `dither-ascii-generator` (the name is used as the base path in `vite.config.ts`).
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.

## Shortcuts

| Key | Action |
|---|---|
| Hold `Space` (or the Original button) | Show original |
| `F` / double-click preview | Fit to view |
| `1` | 100% zoom |
| Wheel / drag | Zoom / pan |
| `D` / `A` | Dither / ASCII mode |
| `K` | Play / pause video |
| `B` | Toggle boil |
| `O` | Open file |
| `E` | Export |
| `?` | Shortcut help |
| Double-click slider | Reset that value |
| `Ctrl+V` | Paste image |

## Browser support

Needs WebGL2 (all current browsers). WebM / MP4 export uses WebCodecs: Chrome, Edge, Safari 16.4+ and Firefox 130+.
