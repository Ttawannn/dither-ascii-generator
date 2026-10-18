# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # tsc --noEmit, then vite build → dist/
npm run typecheck  # type-check only
npm test           # Vitest, run once (npm run test:watch to watch)
npx vitest run src/ascii/grid.test.ts   # a single test file
npx vitest run -t "share links"         # tests whose name matches
```

Tests (`src/**/*.test.ts`, Node environment) cover only the pure logic: `sanitize`, presets and share links, palettes, error-diffusion kernels and `diffuse()`, the character library (`rampFor`, `pickLevels`), LFOs, effect order and parameters, animation lanes, and the ASCII grid and text export. Anything touching WebGL or the DOM has no tests; verify it in a browser. The deploy workflow runs `npm test` before building, so a failing test blocks the deploy. There is no linter. `/?sample` loads the built-in procedural test image on start, and `#s=<base64url>` applies a shared look.

TypeScript is v7 (the native compiler) and Vite is v8.

## Deploy and git

- Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml` (https://ttawannn.github.io/dither-ascii-generator/). `vite.config.ts` switches `base` to `/dither-ascii-generator/` only when `GITHUB_ACTIONS` is set.
- Commits are authored as **Ttawannn** (`133937402+Ttawannn@users.noreply.github.com`), set in the repo-local git config. The repo-local credential helper is `!gh auth git-credential`, so pushes use whichever `gh` account is active. It should be Ttawannn.
- Commit messages describe the phase or feature in an imperative summary with a bullet body. `PLAN.md` (Thai) is the roadmap and records what was done or deferred.
- Describe features on their own terms. Do not name, compare with, or credit other products anywhere in the repo: code, comments, docs, commit messages or UI text.

## Architecture

Everything runs client-side in one page with no framework. `src/main.ts` is the orchestrator: it builds the DOM, owns the current source, and decides which render path runs in `draw()`.

### State (`src/state.ts`)
- A single flat `Params` object in a `Store` with per-key subscribers. UI controls in `src/ui/controls.ts` (`slider`, `select`, `toggle`, `colorInput`, `textInput`, `showWhen`) bind straight to keys.
- Params persist to localStorage (`dag.params.v1`). Every external input goes through `sanitize()`: localStorage, saved presets (`dag.presets.v1`), and share links. It drops unknown keys and wrong types, checks enums (`ENUMS`) and hex colours, and clamps numbers to the slider spec ranges.
- **Adding a param:** add it to `Params`/`DEFAULTS`. Add a `SliderSpec` (which also defines its clamp range) or an `ENUMS` entry, then add it to the right key group (`ADJUST_KEYS` / `DITHER_KEYS` / `ASCII_KEYS`). `PRESET_KEYS` in `src/presets.ts` is built from those groups, so presets, share links and Reset buttons pick it up automatically.

### Render pipeline (`src/pipeline/gl.ts`, WebGL2)
```
source texture ─adjust.frag─▶ FBO (adjusted, at output or grid resolution)
  ├─ dither.frag ─▶ canvas                        ordered / pattern / noise / threshold (GPU)
  ├─ readPixels ─▶ diffusion.worker ─▶ result tex ─blit─▶ canvas    error diffusion (CPU)
  ├─ readPixels ─▶ ascii/grid.ts (glyph ids) ─ascii.frag + atlas─▶ canvas    ASCII
  └─ blit ─▶ canvas                               "original" view (Space / Original button)

every output pass ─(effects on)─▶ post texture ─post.frag × N (ping-pong)─▶ canvas
```
- **Texture orientation is the main trap.** Only uploaded sources (images and video frames, top row first) are sampled via the flipped `v_uv` from `fullscreen.vert`. FBO and worker-result textures are bottom-up (`readPixels` layout). Passes that read them use `texelFetch(..., ivec2(gl_FragCoord.xy))` or `gl_FragCoord / size`. The CPU code (worker, `buildGrid`) walks rows as `h - 1 - y` to process in visual order.
- The canvas holds processed pixels at output resolution and is upscaled by CSS (`image-rendering: pixelated`, or smooth in ASCII mode). `src/ui/viewer.ts` zooms and pans it relative to the *source* size.
- `draw()` is synchronous, and `requestRender()` coalesces calls into one rAF.
- The WebGL context can be lost (mobile tab in the background, GPU reset). `Renderer.createResources()` builds every GPU object, and `main.ts` calls `renderer.restore()` plus `setSource()` on `webglcontextrestored`. Any new texture, program or framebuffer must be created there, or it will be dead after a restore.
- Error diffusion is async. `Diffuser` (`src/pipeline/diffuser.ts`) keeps one job in flight and replaces pending jobs with the latest one. The algorithm itself is the pure `diffuse()` in `diffuse.ts`; `diffusion.worker.ts` only wraps it, so tests can import it. While a job runs, `draw()` leaves the previous frame on screen. `diffuser.idle()` resolves once the newest result has been drawn.
- Algorithms (`algorithms.ts`) map to a `u_algo` index in `dither.frag`; diffusion entries have no `shader` index and use `KERNELS`. Palettes (`palettes.ts`) come in three kinds:
  - `ramp`: picked by luminance index
  - `set`: nearest colour
  - `rgb`: per-channel levels

  Each kind is implemented twice, in the shader and in the worker. Keep them in sync.
- Blue noise is generated at startup (void-and-cluster, `bluenoise.ts`) rather than shipped as an asset.
- Post-effects (`effects.ts`, `post.frag`): every output pass calls `beginOutput()` / `endOutput()`. With effects on, `beginOutput` targets an offscreen texture, and `endOutput` runs the enabled effects in order, ping-ponging two framebuffers, with the last one drawing to the canvas. `main.ts` calls `renderer.setEffects()` at the start of each `draw()`, with an empty list for the original view. A new output pass must use the same begin/end pair. Effects work on premultiplied RGBA and must keep `rgb <= a`.
- Effect settings are flat params like the rest (`fxGlow`, `fxGlowRadius`, …). The order is the string param `fxOrder` (comma-separated ids), which `sanitize()` repairs with `normalizeOrder()`. To add an effect: an `EFFECTS` entry with a new `u_kind`, its branch in `post.frag`, an enable flag plus `FX_SLIDERS` entries in `state.ts`, and the keys in `FX_KEYS`.

### ASCII (`src/ascii/`)
- The adjusted image is rendered at grid resolution: 1 px per cell, or 2×4 per cell for braille. `buildGrid` turns it into glyph ids (ramp, dither, Sobel edge glyphs `- / | \`) plus per-cell colours, packed as RGBA (alpha = glyph id) for `ascii.frag`.
- Character sets live in `charsets.ts` (48 sets in 11 groups). Set order doesn't matter: `atlas.ts` measures each glyph's ink, drops glyphs that render as the font's missing-glyph box, and sorts the ramp sparse → dense. Atlas glyph ids: sorted ramp first (`rampSize`), then the 4 edge glyphs. Ids are 8-bit, so a ramp is capped at `MAX_RAMP` (252).
- Glyph atlases are built asynchronously because fonts load async (non-Latin glyphs come from Noto fallbacks in `FALLBACK_FONTS`, fetched per Unicode range on demand). `currentAtlas()` returns null and triggers a re-render once the atlas is ready. Shade blocks and braille dots are drawn procedurally, not from the font.
- Depth and Offset don't rebuild the atlas: `pickLevels()` chooses which sorted glyphs act as brightness levels, and `buildGrid` shifts the level (wrapping) by the offset. Both can be driven by LFOs (`lfo.ts`) that read `clock()` in `main.ts`; during export the clock is the frame time, so animated exports are deterministic.
- Palette colour mode snaps cell colours to a palette in `buildGrid`; the shader then treats it as image colour. A transparent background makes `ascii.frag` output premultiplied alpha. The WebGL context is created with `alpha: true` for this, and every other pass must keep writing alpha 1.
- Text and HTML exports use `lastAscii`, which pairs a grid with the atlas it was built against. Keep that pairing: glyph ids index into that atlas's glyph list.

### Sources and animation
- `src/source/` exposes one `Source` shape for images (`ImageBitmap`), video files and webcam (`HTMLVideoElement`). Video elements are attached to the DOM (invisible) so browsers keep decoding. `draw()` re-uploads the current video frame each time, and `requestVideoFrameCallback` drives re-renders.
- "Boil" is a global `seed` in `main.ts` (0 = static) advanced by a timer. It shifts the ordered-dither pattern (`u_offset`), jitters error-diffusion input (worker `noise`), and jitters ASCII glyph choice.
- Animation lanes (`anim.ts`) drive any setting in `ANIMATABLE` (`state.ts`) with an LFO or two keyframes. They are stored as JSON in the string param `animLanes`, which `sanitize()` repairs with `parseLanes()`. `draw()` never renders `store.params` directly: it renders `animatedParams(store.params)`, where the animated values are computed at `clock()`. Code on the render path must use the `p` it is given, not `store.params`, or animation won't reach it. Sliders keep showing their own (unanimated) value.
- Lane cards edit the JSON without rebuilding themselves (`editingLanes`), so a slider being dragged keeps its pointer; any outside change (preset, share link, Reset) rebuilds them.

### UI theme
- Colours are CSS custom properties on `:root`; the parchment theme overrides them under `:root[data-theme='parchment']` and swaps `--display` (logo and section titles) to Grenze Gotisch. Use the tokens (`--dot`, `--overlay`, `--scrim`, `--checker-*`…) rather than hard-coded colours. The theme is a per-browser preference in `localStorage['dag.theme']`, applied by an inline script in `index.html` before first paint. It is deliberately not a `Params` key, so presets and share links don't carry it.

### Export (`src/export/`)
- PNG and SVG come from the canvas. Animated formats (`animation.ts`: GIF via gifenc, WebM/MP4 via mediabunny + WebCodecs) render frames deterministically through a `FrameSequence`:
  - video files: seeked frame by frame
  - webcam: captured in real time
  - stills: stepped through boil seeds

  Each frame runs `renderNow()`, which waits for the atlas and the diffuser before capturing.
- `animation.ts` is loaded with a dynamic `import()` so the initial bundle stays small. Don't import it statically from `main.ts`. In dev, the first dynamic import of new deps makes Vite reload the page once.
- Video exports force even dimensions and cap each side at 4096. With a transparent ASCII background, GIF uses 1-bit transparency, WebM tries VP9 with alpha and falls back to filling the background colour (`matte`), and MP4 always uses the matte.

## Verifying in the Claude browser pane

When the pane is hidden, rAF is heavily throttled, so `draw()` may not run between scripted steps. Screenshots and zooms pump frames. Export paths call `draw()` directly and are not affected. Intercept downloads by stubbing `HTMLAnchorElement.prototype.click` rather than saving files.
