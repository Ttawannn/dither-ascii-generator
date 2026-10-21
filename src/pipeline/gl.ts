import type { Atlas } from '../ascii/atlas';
import type { AsciiGrid } from '../ascii/grid';
import { hexToRgb } from './palettes';
import type { Params } from '../state';
import { FOLLOWS_IMAGE, getAlgorithm } from './algorithms';
import { blueNoiseTile } from './bluenoise';
import { paletteLab } from './oklab';
import { baseSpread, MAX_PALETTE, type Palette } from './palettes';
import fullscreenVert from './shaders/fullscreen.vert?raw';
import adjustFrag from './shaders/adjust.frag?raw';
import ditherFrag from './shaders/dither.frag?raw';
import blitFrag from './shaders/blit.frag?raw';
import asciiFrag from './shaders/ascii.frag?raw';
import postFrag from './shaders/post.frag?raw';
import filterFrag from './shaders/filter.frag?raw';
import compositeFrag from './shaders/composite.frag?raw';
import sortFrag from './shaders/sort.frag?raw';
import sortOutputFrag from './shaders/sort-output.frag?raw';
import type { PostEffect } from './effects';

/** How layer 2 is blended over layer 1 (see composite.frag). */
export interface CompositeOptions {
  /** LAYER_BLENDS index. */
  blend: number;
  /** 0..1 */
  opacity: number;
  /** The mask pass, when the Mask limits layer 2 only; its params are reused. */
  mask: PostEffect | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

interface Program {
  prog: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

function program(gl: WebGL2RenderingContext, vert: string, frag: string): Program {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name)!;
  };
  return { prog, u };
}

function texture(gl: WebGL2RenderingContext, filter: number, wrap: number = gl.CLAMP_TO_EDGE): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
  return tex;
}

/**
 * Passes:
 *   source texture ──adjust──▶ adjusted FBO (output resolution)
 *   adjusted ──filter H──▶ temp ──filter V──▶ adjusted   (denoise, then blur; only when on)
 *   adjusted ──dither──▶ canvas            (ordered / pattern / threshold, GPU)
 *   adjusted ──readPixels──▶ worker ──▶ result texture ──blit──▶ canvas   (error diffusion, CPU)
 *   adjusted ──blit──▶ canvas              (original view)
 *   adjusted (grid res) ──readPixels──▶ glyph grid (CPU) ──ascii──▶ canvas
 *
 * With post-effects on, "canvas" above is really an offscreen texture; endOutput() then runs
 * each effect, ping-ponging between two framebuffers, and the last one draws to the canvas.
 * Glow first renders a bright pass into its own mipmapped texture and samples that.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxTextureSize: number;
  // GPU objects, rebuilt by createResources() after a context loss.
  private adjust!: Program;
  private dither!: Program;
  private blit!: Program;
  private ascii!: Program;
  private post!: Program;
  private filter!: Program;
  private sort!: Program;
  private sortOutput!: Program;
  private sortTex: WebGLTexture[] = [];
  private sortFbo: WebGLFramebuffer[] = [];
  private sortW = 0;
  private sortH = 0;
  private tmpTex!: WebGLTexture;
  private tmpFbo!: WebGLFramebuffer;
  /** Blurred adjusted image for patterns that follow the image (Follow image). */
  private smoothTex!: WebGLTexture;
  private smoothFbo!: WebGLFramebuffer;
  private smoothW = 0;
  private smoothH = 0;
  private tmpW = 0;
  private tmpH = 0;
  private postTex: WebGLTexture[] = [];
  private postFbo: WebGLFramebuffer[] = [];
  private glowTex!: WebGLTexture;
  private glowFbo!: WebGLFramebuffer;
  private postW = 0;
  private postH = 0;
  private effects: PostEffect[] = [];
  private effectSeed = 0;
  private opaque = true;
  /** Source is shown mirrored (webcam); the mask pass samples the source the same way. */
  private mirror = false;
  private srcTex!: WebGLTexture;
  private adjTex!: WebGLTexture;
  private resultTex: WebGLTexture[] = [];
  private noiseTex!: WebGLTexture;
  private gridTex!: WebGLTexture;
  private atlasTex: WebGLTexture[] = [];
  private composite!: Program;
  // Layers: when `layerTarget` is set, output passes render into that layer's texture instead of
  // the canvas, and compositeLayers() blends them to the canvas (through the effects).
  private layerTex: WebGLTexture[] = [];
  private layerFbo: WebGLFramebuffer[] = [];
  private layerSize: [number, number][] = [
    [0, 0],
    [0, 0],
  ];
  private layerTarget: number | null = null;
  private lastComposite: CompositeOptions | null = null;
  /** Size of the target the current output pass draws into. */
  private outW = 0;
  private outH = 0;
  private fbo!: WebGLFramebuffer;
  private atlasKey = ['', ''];
  private srcW = 0;
  private srcH = 0;
  private adjW = 0;
  private adjH = 0;
  private hasResult = [false, false];
  private palBuf = new Float32Array(MAX_PALETTE * 3);

  constructor(readonly canvas: HTMLCanvasElement) {
    // alpha: true only matters for ASCII with a transparent background; every other pass writes alpha 1.
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.createResources();
  }

  /** True while the browser has taken the GPU context away (tab backgrounded, driver reset…). */
  get contextLost(): boolean {
    return this.gl.isContextLost();
  }

  /** Call on `webglcontextrestored`, then upload the source again with setSource(). */
  restore(): void {
    this.srcW = this.srcH = 0;
    this.createResources();
  }

  private createResources(): void {
    const gl = this.gl;
    this.adjust = program(gl, fullscreenVert, adjustFrag);
    this.dither = program(gl, fullscreenVert, ditherFrag);
    this.blit = program(gl, fullscreenVert, blitFrag);
    this.ascii = program(gl, fullscreenVert, asciiFrag);
    this.post = program(gl, fullscreenVert, postFrag);
    this.filter = program(gl, fullscreenVert, filterFrag);
    this.sort = program(gl, fullscreenVert, sortFrag);
    this.sortOutput = program(gl, fullscreenVert, sortOutputFrag);
    this.sortTex = [texture(gl, gl.NEAREST), texture(gl, gl.NEAREST)];
    this.sortFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    this.sortW = this.sortH = 0;

    // Mipmaps give a clean box-filtered downsample when pixel size > 1.
    this.srcTex = texture(gl, gl.LINEAR_MIPMAP_LINEAR);
    this.adjTex = texture(gl, gl.NEAREST);
    this.resultTex = [texture(gl, gl.NEAREST), texture(gl, gl.NEAREST)];
    this.gridTex = texture(gl, gl.NEAREST);
    this.atlasTex = [texture(gl, gl.NEAREST), texture(gl, gl.NEAREST)];
    this.composite = program(gl, fullscreenVert, compositeFrag);
    this.layerTex = [texture(gl, gl.NEAREST), texture(gl, gl.NEAREST)];
    this.layerFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    this.noiseTex = texture(gl, gl.NEAREST, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, blueNoiseTile());

    this.fbo = gl.createFramebuffer()!;
    this.tmpTex = texture(gl, gl.NEAREST);
    this.tmpFbo = gl.createFramebuffer()!;
    this.smoothTex = texture(gl, gl.NEAREST);
    this.smoothFbo = gl.createFramebuffer()!;
    this.postTex = [texture(gl, gl.LINEAR), texture(gl, gl.LINEAR)];
    this.postFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    this.glowTex = texture(gl, gl.LINEAR_MIPMAP_LINEAR);
    this.glowFbo = gl.createFramebuffer()!;
    // Cached sizes and uploads referred to the previous objects.
    this.adjW = this.adjH = 0;
    this.tmpW = this.tmpH = 0;
    this.smoothW = this.smoothH = 0;
    this.postW = this.postH = 0;
    this.atlasKey = ['', ''];
    this.hasResult = [false, false];
    this.layerSize = [
      [0, 0],
      [0, 0],
    ];
    this.lastComposite = null;
  }

  get hasSource(): boolean {
    return this.srcW > 0;
  }

  get sourceSize(): [number, number] {
    return [this.srcW, this.srcH];
  }

  setSource(src: TexImageSource, w: number, h: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.srcW = w;
    this.srcH = h;
    this.hasResult = [false, false];
  }

  /** Processed (output) resolution for the given pixel size. */
  outputSize(pixelSize: number): [number, number] {
    return [Math.max(1, Math.round(this.srcW / pixelSize)), Math.max(1, Math.round(this.srcH / pixelSize))];
  }

  /** Pass 1: source → adjusted FBO, at the dither output resolution unless `size` is given. */
  renderAdjust(p: Params, bypass: boolean, size?: [number, number]): void {
    const gl = this.gl;
    const [w, h] = size ?? this.outputSize(p.pixelSize);
    if (w !== this.adjW || h !== this.adjH) {
      gl.bindTexture(gl.TEXTURE_2D, this.adjTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.adjTex, 0);
      this.adjW = w;
      this.adjH = h;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    const { prog, u } = this.adjust;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform1i(u('u_src'), 0);
    gl.uniform2f(u('u_texel'), 1 / w, 1 / h);
    gl.uniform1f(u('u_brightness'), p.brightness / 100);
    gl.uniform1f(u('u_contrast'), p.contrast / 100);
    gl.uniform1f(u('u_gamma'), p.gamma);
    gl.uniform1f(u('u_saturation'), p.saturation / 100);
    gl.uniform1f(u('u_sharpen'), p.sharpen / 100);
    gl.uniform3f(u('u_tone'), p.shadows / 100, p.midtones / 100, p.highlights / 100);
    gl.uniform1f(u('u_hue'), (p.hue * Math.PI) / 180);
    gl.uniform1i(u('u_invert'), p.invert ? 1 : 0);
    gl.uniform1i(u('u_bypass'), bypass ? 1 : 0);
    gl.uniform1i(u('u_mirror'), p.mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.mirror = p.mirror;

    if (bypass) return;
    const amount = p.denoise / 100;
    if (amount > 0) this.filterAdjusted(1, 1 + 3 * amount, 0.02 + 0.18 * amount);
    const radius = (p.blur / 100) * 0.03 * Math.max(w, h);
    if (radius >= 0.5) this.filterAdjusted(0, radius, 0);
  }

  /** (Re)allocate an RGBA8 render target when the adjusted size changed. */
  private sizeTarget(tex: WebGLTexture, fbo: WebGLFramebuffer, w: number, h: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }

  /** Separable filter on the adjusted image, in place. */
  private filterAdjusted(mode: number, radius: number, range: number): void {
    this.separable(this.adjTex, this.fbo, mode, radius, range);
  }

  /** Separable filter of an adjusted-size texture: horizontal into the temp target, vertical into `dst`. */
  private separable(src: WebGLTexture, dst: WebGLFramebuffer, mode: number, radius: number, range: number): void {
    const gl = this.gl;
    const [w, h] = [this.adjW, this.adjH];
    if (w !== this.tmpW || h !== this.tmpH) {
      this.sizeTarget(this.tmpTex, this.tmpFbo, w, h);
      this.tmpW = w;
      this.tmpH = h;
    }
    const { prog, u } = this.filter;
    gl.useProgram(prog);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform1i(u('u_mode'), mode);
    gl.uniform1f(u('u_radius'), radius);
    gl.uniform1f(u('u_range'), range);
    const passes: [WebGLTexture, WebGLFramebuffer, number, number][] = [
      [src, this.tmpFbo, 1, 0],
      [this.tmpTex, dst, 0, 1],
    ];
    for (const [src, dst, dx, dy] of passes) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform2i(u('u_dir'), dx, dy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /** Pixels of the adjusted image (RGBA, bottom row first). */
  readAdjusted(): Uint8Array {
    const gl = this.gl;
    const out = new Uint8Array(this.adjW * this.adjH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.readPixels(0, 0, this.adjW, this.adjH, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  get adjustedSize(): [number, number] {
    return [this.adjW, this.adjH];
  }

  /**
   * Post-effects for the following output passes (empty = draw straight to the canvas).
   * `opaque` is false when the output has a transparent background.
   */
  setEffects(effects: PostEffect[], seed: number, opaque: boolean): void {
    this.effects = effects;
    this.effectSeed = seed;
    this.opaque = opaque;
  }

  /** True when the output target already has the current output size (resizing would clear it). */
  get canvasMatches(): boolean {
    if (this.layerTarget !== null) {
      const [w, h] = this.layerSize[this.layerTarget];
      return w === this.adjW && h === this.adjH;
    }
    return this.canvas.width === this.adjW && this.canvas.height === this.adjH;
  }

  // ---------- layers ----------

  /** Send the following output passes to layer `i`'s texture (null: back to the canvas). */
  setLayerTarget(i: number | null, smooth = false): void {
    this.layerTarget = i;
    if (i === null) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex[i]);
    const filter = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  /** Blend layer 2 over layer 1 to the canvas, through the effect chain. */
  compositeLayers(options: CompositeOptions): void {
    this.lastComposite = options;
    this.drawComposite();
  }

  /** Composite again with the last options (after one layer changed on its own, e.g. a worker result). */
  recomposite(): void {
    if (this.lastComposite) this.drawComposite();
  }

  private drawComposite(): void {
    const gl = this.gl;
    const o = this.lastComposite!;
    const [[aw, ah], [bw, bh]] = this.layerSize;
    // Composite at the larger of the two layer sizes; the other is scaled to match.
    const [w, h] = aw * ah >= bw * bh ? [aw, ah] : [bw, bh];
    if (!w || !h) return;
    this.layerTarget = null;
    this.beginOutput(w, h);
    const { prog, u } = this.composite;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex[1]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('u_a'), 0);
    gl.uniform1i(u('u_b'), 1);
    gl.uniform1i(u('u_src'), 3);
    gl.uniform1i(u('u_srcMirror'), this.mirror ? 1 : 0);
    gl.uniform2f(u('u_size'), w, h);
    gl.uniform1i(u('u_blend'), o.blend);
    gl.uniform1f(u('u_opacity'), o.opacity);
    gl.uniform2i(u('u_has'), aw > 0 ? 1 : 0, bw > 0 ? 1 : 0);
    gl.uniform1i(u('u_maskOn'), o.mask ? 1 : 0);
    gl.uniform4fv(u('u_mp'), o.mask?.params ?? [0, 0, 0, 0]);
    gl.uniform4fv(u('u_mq'), o.mask?.extra ?? [0, 0, 0, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  /** Pass 2 (GPU): ordered / pattern / threshold dither to the canvas. `seed` 0 = static pattern. */
  renderDither(p: Params, palette: Palette, seed = 0): void {
    const gl = this.gl;
    const algo = getAlgorithm(p.algorithm);
    // Follow image: blur the adjusted image over ~1.5 cells; its brightness shifts the pattern.
    const follow = FOLLOWS_IMAGE.includes(p.algorithm) ? p.patternFollow / 100 : 0;
    if (follow > 0) {
      if (this.adjW !== this.smoothW || this.adjH !== this.smoothH) {
        this.sizeTarget(this.smoothTex, this.smoothFbo, this.adjW, this.adjH);
        this.smoothW = this.adjW;
        this.smoothH = this.adjH;
      }
      this.separable(this.adjTex, this.smoothFbo, 0, Math.max(1, p.cellSize * 1.5), 0);
    }
    this.beginOutput();
    const { prog, u } = this.dither;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.adjTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(u('u_src'), 0);
    gl.uniform1i(u('u_noise'), 1);
    gl.uniform1i(u('u_algo'), algo.shader ?? 0);
    gl.uniform1f(u('u_spread'), (p.strength / 100) * baseSpread(palette));
    gl.uniform1f(u('u_threshold'), p.threshold / 100);
    gl.uniform1i(u('u_linear'), p.linearLight ? 1 : 0);
    gl.uniform1i(
      u('u_mixing'),
      p.paletteMixing === 'pattern' && p.strength > 0 && (algo.group === 'ordered' || algo.group === 'pattern') ? 1 : 0,
    );
    gl.uniform1i(u('u_shape'), Math.max(0, ['round', 'ellipse', 'square', 'diamond'].indexOf(p.halftoneShape)));
    gl.uniform1f(u('u_cell'), p.cellSize);
    gl.uniform1f(u('u_angle'), (p.angle * Math.PI) / 180);
    gl.uniform1ui(u('u_seed'), seed + 1);
    gl.uniform2f(u('u_offset'), (seed * 29) % 64, (seed * 47) % 64);
    gl.uniform2f(u('u_size'), this.adjW, this.adjH);
    gl.uniform1f(u('u_hexRings'), p.hexRings / 100);
    gl.uniform1f(u('u_follow'), follow);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, follow > 0 ? this.smoothTex : this.adjTex);
    gl.uniform1i(u('u_smooth'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(u('u_orb'), p.orbSize, p.orbCount, p.orbIntensity / 100, p.orbRandom / 100);
    gl.uniform1i(u('u_orbVertical'), p.orbVertical ? 1 : 0);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    gl.uniform4f(u('u_cmykAngles'), rad(p.cmykAngleC), rad(p.cmykAngleM), rad(p.cmykAngleY), rad(p.cmykAngleK));
    gl.uniform3f(u('u_cmyk'), p.cmykDotGain / 100, p.cmykGcr / 100, p.cmykSupersample);
    this.setPalette(u, palette, p.perceptual);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  /**
   * Show a CPU-dithered frame of layer `layer` on the current target. Without data, re-shows that
   * layer's last result (scaled to the current size).
   */
  renderResult(result?: { data: Uint8Array; width: number; height: number }, layer = 0): void {
    const gl = this.gl;
    if (result) {
      gl.bindTexture(gl.TEXTURE_2D, this.resultTex[layer]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, result.width, result.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, result.data);
      this.hasResult[layer] = true;
    }
    this.blitToCanvas(
      this.hasResult[layer] ? this.resultTex[layer] : this.adjTex,
      result ? [result.width, result.height] : undefined,
    );
  }

  /** Show the adjusted image as-is. */
  renderAdjusted(): void {
    this.blitToCanvas(this.adjTex);
  }

  /** ASCII pass: glyph grid + atlas → canvas at cols×cellW by rows×cellH. Each layer keeps its own atlas texture. */
  renderAscii(
    grid: AsciiGrid,
    atlas: Atlas,
    mode: string,
    fg: string,
    bg: string,
    transparent = false,
    layer = 0,
  ): void {
    const gl = this.gl;
    if (this.atlasKey[layer] !== atlas.key) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex[layer]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      this.atlasKey[layer] = atlas.key;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, grid.cells);

    this.beginOutput(grid.cols * atlas.cellW, grid.rows * atlas.cellH);
    const { prog, u } = this.ascii;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex[layer]);
    gl.uniform1i(u('u_grid'), 0);
    gl.uniform1i(u('u_atlas'), 1);
    gl.uniform2i(u('u_cell'), atlas.cellW, atlas.cellH);
    gl.uniform1i(u('u_rows'), grid.rows);
    // Palette mode is image colour with the cell colours already snapped to the palette in buildGrid.
    gl.uniform1i(u('u_colorMode'), mode === 'color' || mode === 'palette' ? 1 : mode === 'colorBg' ? 2 : 0);
    gl.uniform1i(u('u_transparent'), transparent && mode !== 'colorBg' ? 1 : 0);
    gl.uniform3fv(u('u_fg'), hexToRgb(fg));
    gl.uniform3fv(u('u_bg'), hexToRgb(bg));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  private blitToCanvas(tex: WebGLTexture, size?: [number, number]): void {
    const gl = this.gl;
    this.beginOutput(...(size ?? [this.adjW, this.adjH]));
    const { prog, u } = this.blit;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform2f(u('u_outSize'), this.outW, this.outH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  /** Size the canvas and bind where the final image goes: the canvas, or the first post buffer. */
  private beginOutput(w = this.adjW, h = this.adjH): void {
    const gl = this.gl;
    this.outW = w;
    this.outH = h;
    if (this.layerTarget !== null) {
      const i = this.layerTarget;
      const [lw, lh] = this.layerSize[i];
      if (lw !== w || lh !== h) {
        this.sizeTarget(this.layerTex[i], this.layerFbo[i], w, h);
        this.layerSize[i] = [w, h];
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.layerFbo[i]);
      gl.viewport(0, 0, w, h);
      return;
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.effects.length) {
      if (this.postW !== w || this.postH !== h) {
        for (let i = 0; i < 2; i++) {
          gl.bindTexture(gl.TEXTURE_2D, this.postTex[i]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.postFbo[i]);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.postTex[i], 0);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.glowTex, 0);
        this.postW = w;
        this.postH = h;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.postFbo[0]);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, w, h);
  }

  /** Run the post-effect chain; the last effect draws to the canvas. */
  private endOutput(): void {
    if (this.layerTarget !== null) return; // layers get the effects once, after compositing
    const n = this.effects.length;
    if (!n) return;
    const gl = this.gl;
    const { prog, u } = this.post;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform1i(u('u_glow'), 1);
    gl.uniform2f(u('u_size'), this.postW, this.postH);
    gl.uniform1f(u('u_seed'), this.effectSeed);
    gl.uniform1i(u('u_opaque'), this.opaque ? 1 : 0);
    // The mask pass reads the untouched source on unit 3.
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('u_src'), 3);
    gl.uniform1i(u('u_srcMirror'), this.mirror ? 1 : 0);
    let src = 0;
    this.effects.forEach((fx, i) => {
      if (fx.kind === 8) {
        this.sortPixels(this.postTex[src], i === n - 1 ? null : this.postFbo[1 - src], fx);
        src = 1 - src;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
        // sortPixels uses its own programs, viewport and units.
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.viewport(0, 0, this.postW, this.postH);
        return;
      }
      gl.uniform4fv(u('u_p'), fx.params);
      gl.uniform4fv(u('u_q'), fx.extra);
      if (fx.mask) {
        gl.uniform3fv(u('u_maskColor'), fx.mask.color);
        gl.uniform1i(u('u_maskView'), fx.mask.view ? 1 : 0);
      }
      if (fx.bright) {
        // Bright pass into the glow texture, then mipmaps so wide glows can read coarse levels.
        // Unit 1 must not hold the glow texture while rendering into it (feedback loop).
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo);
        gl.bindTexture(gl.TEXTURE_2D, this.postTex[src]);
        gl.uniform1i(u('u_kind'), 100);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, i === n - 1 ? null : this.postFbo[1 - src]);
      gl.bindTexture(gl.TEXTURE_2D, this.postTex[src]);
      gl.uniform1i(u('u_kind'), fx.kind);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = 1 - src;
    });
  }

  /** Segmented bitonic sort. RGBA32UI records retain the exact premultiplied colour and stable ties. */
  private sortPixels(input: WebGLTexture, output: WebGLFramebuffer | null, fx: PostEffect): void {
    const gl = this.gl;
    const [w, h] = [this.postW, this.postH];
    const vertical = fx.params[3] > 0;
    const length = Math.max(2, Math.min(512, Math.round(fx.params[2])));
    const padded = 2 ** Math.ceil(Math.log2(length));
    const sw = vertical ? w : Math.ceil(w / length) * padded;
    const sh = vertical ? Math.ceil(h / length) * padded : h;
    if (this.sortW !== sw || this.sortH !== sh) {
      for (let i = 0; i < 2; i++) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.sortTex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, sw, sh, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sortFbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sortTex[i], 0);
      }
      this.sortW = sw;
      this.sortH = sh;
    }
    const { prog, u } = this.sort;
    gl.useProgram(prog);
    gl.viewport(0, 0, sw, sh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(u('u_color'), 0);
    gl.uniform1i(u('u_records'), 1);
    gl.uniform2i(u('u_size'), w, h);
    gl.uniform1i(u('u_length'), length);
    gl.uniform1i(u('u_padded'), padded);
    gl.uniform1i(u('u_vertical'), vertical ? 1 : 0);
    gl.uniform1i(u('u_reverse'), fx.extra[0] > 0 ? 1 : 0);
    gl.uniform2f(u('u_range'), Math.min(fx.params[0], fx.params[1]), Math.max(fx.params[0], fx.params[1]));
    let src = 0;
    const pass = (mode: number, step = 0, stage = 0) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sortTex[src]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sortFbo[1 - src]);
      gl.uniform1i(u('u_mode'), mode);
      gl.uniform1i(u('u_step'), step);
      gl.uniform1i(u('u_stage'), stage);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = 1 - src;
    };
    pass(0);
    for (let step = 1; step < padded; step *= 2) pass(1, step);
    for (let stage = 2; stage <= padded; stage *= 2)
      for (let step = stage / 2; step >= 1; step /= 2) pass(2, step, stage);
    gl.useProgram(this.sortOutput.prog);
    const su = this.sortOutput.u;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sortTex[src]);
    gl.uniform1i(su('u_records'), 1);
    gl.uniform1i(su('u_length'), length);
    gl.uniform1i(su('u_padded'), padded);
    gl.uniform1i(su('u_vertical'), vertical ? 1 : 0);
    gl.uniform1i(su('u_height'), h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setPalette(u: Program['u'], p: Palette, perceptual: boolean): void {
    const gl = this.gl;
    const kind = p.kind === 'ramp' ? 0 : p.kind === 'set' ? 1 : 2;
    const count = Math.min(p.colors.length, MAX_PALETTE);
    this.palBuf.fill(0);
    for (let i = 0; i < count; i++) this.palBuf.set(p.colors[i], i * 3);
    gl.uniform1i(u('u_kind'), kind);
    gl.uniform3fv(u('u_pal'), this.palBuf);
    const lab = perceptual && kind === 1;
    gl.uniform1i(u('u_perceptual'), lab ? 1 : 0);
    if (lab) gl.uniform3fv(u('u_palLab'), paletteLab(this.palBuf));
    gl.uniform1i(u('u_palSize'), count);
    gl.uniform1f(u('u_levels'), p.levels);
  }
}
