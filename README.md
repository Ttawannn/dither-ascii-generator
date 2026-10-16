# Dither / ASCII

A browser-based generator that turns images, videos and your webcam into **dithered pixel art** and **ASCII art**, live as you adjust. Everything runs client-side on WebGL2, so there's no server and nothing to install. It is hosted on GitHub Pages.

**Try it:** https://ttawannn.github.io/dither-ascii-generator/

![Dither / ASCII screenshot](docs/screenshot.png)

## Highlights

- Real-time preview of every setting, including on video and webcam
- 17 dither algorithms, from ordered Bayer and blue noise to classic error diffusion
- 7 palette options: retro systems, duotone colour picks, or colours extracted from your image
- ASCII mode with braille, block and edge-aware glyphs, 4 fonts and full-colour output
- A "boil" animation that brings still images to life
- Export to PNG, SVG, GIF, WebM or MP4, or copy the ASCII as text
- Presets you can save and share as a link

Your files never leave your device. All processing happens in the browser.

## How to use

1. **Load a source.** Drag an image or video onto the page, paste an image with `Ctrl+V`, click **Upload**, or start the **Webcam**. **Sample** loads a built-in test image.
2. **Pick a mode.** Use the **Dither** or **ASCII** tabs at the top, or press `D` / `A`.
3. **Tune it.** Use **Adjust** for brightness, contrast, gamma, saturation, sharpen and invert, then **Effect** for the mode-specific settings. Hold `Space` (or the **Original** button) to compare with the source.
4. **Export.** Choose a format in the **Export** section and press **Export**.

New to it? Start from one of the **Presets** (Mac 1-bit, Game Boy, Newsprint, Terminal, Braille, Matrix…) and tweak from there.

## Dither mode

| Group | Algorithms | Extra controls |
|---|---|---|
| Ordered | Bayer 2×2, 4×4, 8×8, blue noise | Strength |
| Pattern | Halftone dot, halftone line, crosshatch | Strength, cell size, angle |
| Error diffusion | Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, Sierra two-row, Sierra Lite | Diffusion amount, serpentine scan |
| Other | Random noise, threshold | Strength / threshold |

**Palettes:**
- Mono / Duotone: any two colours, 2–16 levels, with quick colour presets
- Retro systems: Game Boy, CGA, PICO-8, Commodore 64
- RGB levels: per-channel colour steps
- From image: median-cut extraction of 2–16 colours

**Pixel size** (1–16) sets how chunky the result is.

Ordered and pattern dithers run on the GPU. Error diffusion runs in a Web Worker, so the UI stays responsive.

## ASCII mode

- **Character sets:**
  - Standard: ` .:-=+*#%@`
  - Detailed: 70 characters
  - Blocks: `░▒▓█`
  - Braille: 2×4 dots per character, for much finer detail
  - Binary
  - Your own custom ramp
- **Edge glyphs:** draws `- / | \` along edges for a hand-drawn look
- **Dither:** ordered dither applied before choosing characters
- **Layout:** column count, font (JetBrains Mono, IBM Plex Mono, VT323, Courier), font size and line height
- **Colour:**
  - Mono, with text and background colours and a swap button
  - Image colour per character
  - Image colour as the cell background

Copy the result to the clipboard, or save it as `.txt` or as a standalone coloured `.html` page.

## Video, webcam and animation

- **Video files:** play/pause (`K`), scrub, loop and sound in the bottom bar. Every frame is processed live.
- **Webcam:** a live feed with a **Mirror** toggle (on by default for the camera). The browser asks for camera permission first.
- **Boil:** turn it on under **Animation** to make the dither pattern or ASCII characters shift over time (1–30 fps), even on a still image.

## Export

| Format | What you get |
|---|---|
| PNG | The current frame, scaled 1–8× with crisp pixels |
| SVG | A vector version of low-colour dither output (up to 32 colours) |
| GIF | An animation from a video, the webcam, or a still image with Boil on |
| WebM / MP4 | The same as GIF, encoded as video (needs WebCodecs, see below) |
| Copy / .txt / .html | ASCII mode only: the characters as text |

For animated formats, set the **duration** (up to 30 s) and **frame rate** (5–30 fps). Video files export from the current playhead, one frame at a time, so the result is smooth even when live preview is slow. Press the button again to cancel.

## Presets and sharing

- Click a built-in preset to apply a complete look.
- Type a name and press **Save** to keep your own presets in this browser.
- **Copy share link** puts your current settings into the URL (`#s=…`). Anyone opening the link gets the same look.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Hold `Space` | Show original |
| `F` / double-click preview | Fit to view |
| `1` | 100% zoom |
| Wheel / drag | Zoom / pan |
| `D` / `A` | Dither / ASCII mode |
| `K` | Play / pause video |
| `B` | Toggle boil |
| `O` | Open file |
| `E` | Export |
| `?` | Show all shortcuts |
| Double-click a slider | Reset that value |
| `Ctrl+V` | Paste image |

## Browser support

Any current browser with **WebGL2** (Chrome, Edge, Firefox, Safari). WebM / MP4 export uses **WebCodecs**: Chrome, Edge, Safari 16.4+ and Firefox 130+. GIF export works everywhere.

## Development

Built with [Vite](https://vitejs.dev/) and TypeScript, no UI framework. GIF encoding uses [gifenc](https://github.com/mattdesl/gifenc). WebM / MP4 muxing uses [Mediabunny](https://mediabunny.dev/).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Open `/?sample` to start with the built-in test image.

```
src/
  main.ts       app wiring, render loop, export flow
  state.ts      settings store and validation
  presets.ts    built-in / saved presets and share links
  pipeline/     WebGL2 renderer, shaders, palettes, error-diffusion worker
  ascii/        character sets, glyph atlas, character grid
  source/       image, video and webcam sources
  export/       PNG, SVG, GIF, WebM / MP4
  ui/           controls, preview zoom/pan, video transport bar
```

### Deploy your own copy to GitHub Pages

1. Fork or push this repo to GitHub as `dither-ascii-generator`. The name is used as the base path in `vite.config.ts`, so change it there if you rename the repo.
2. In the repo, go to **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.
