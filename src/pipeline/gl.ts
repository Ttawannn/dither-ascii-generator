import type { Atlas } from '../ascii/atlas';
import type { AsciiGrid } from '../ascii/grid';
import { hexToRgb } from './palettes';
import type { Params } from '../state';
import { getAlgorithm } from './algorithms';
import { blueNoise } from './bluenoise';
import { baseSpread, MAX_PALETTE, type Palette } from './palettes';
import fullscreenVert from './shaders/fullscreen.vert?raw';
import adjustFrag from './shaders/adjust.frag?raw';
import ditherFrag from './shaders/dither.frag?raw';
import blitFrag from './shaders/blit.frag?raw';
import asciiFrag from './shaders/ascii.frag?raw';
import postFrag from './shaders/post.frag?raw';
import type { PostEffect } from './effects';

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
 *   adjusted ──dither──▶ canvas            (ordered / pattern / threshold, GPU)
 *   adjusted ──readPixels──▶ worker ──▶ result texture ──blit──▶ canvas   (error diffusion, CPU)
 *   adjusted ──blit──▶ canvas              (original view)
 *   adjusted (grid res) ──readPixels──▶ glyph grid (CPU) ──ascii──▶ canvas
 *
 * With post-effects on, "canvas" above is really an offscreen texture; endOutput() then runs
 * each effect, ping-ponging between two framebuffers, and the last one draws to the canvas.
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
  private postTex: WebGLTexture[] = [];
  private postFbo: WebGLFramebuffer[] = [];
  private postW = 0;
  private postH = 0;
  private effects: PostEffect[] = [];
  private effectSeed = 0;
  private opaque = true;
  private srcTex!: WebGLTexture;
  private adjTex!: WebGLTexture;
  private resultTex!: WebGLTexture;
  private noiseTex!: WebGLTexture;
  private gridTex!: WebGLTexture;
  private atlasTex!: WebGLTexture;
  private fbo!: WebGLFramebuffer;
  private atlasKey = '';
  private srcW = 0;
  private srcH = 0;
  private adjW = 0;
  private adjH = 0;
  private hasResult = false;
  private palBuf = new Float32Array(MAX_PALETTE * 3);
  private static noiseData: Uint8Array | null = null;

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

    // Mipmaps give a clean box-filtered downsample when pixel size > 1.
    this.srcTex = texture(gl, gl.LINEAR_MIPMAP_LINEAR);
    this.adjTex = texture(gl, gl.NEAREST);
    this.resultTex = texture(gl, gl.NEAREST);
    this.gridTex = texture(gl, gl.NEAREST);
    this.atlasTex = texture(gl, gl.NEAREST);
    this.noiseTex = texture(gl, gl.NEAREST, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    Renderer.noiseData ??= blueNoise(64);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, Renderer.noiseData);

    this.fbo = gl.createFramebuffer()!;
    this.postTex = [texture(gl, gl.LINEAR), texture(gl, gl.LINEAR)];
    this.postFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    // Cached sizes and uploads referred to the previous objects.
    this.adjW = this.adjH = 0;
    this.postW = this.postH = 0;
    this.atlasKey = '';
    this.hasResult = false;
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
    this.hasResult = false;
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
    gl.uniform1i(u('u_invert'), p.invert ? 1 : 0);
    gl.uniform1i(u('u_bypass'), bypass ? 1 : 0);
    gl.uniform1i(u('u_mirror'), p.mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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

  /** True when the canvas already has the current output size (resizing would clear it). */
  get canvasMatches(): boolean {
    return this.canvas.width === this.adjW && this.canvas.height === this.adjH;
  }

  /** Pass 2 (GPU): ordered / pattern / threshold dither to the canvas. `seed` 0 = static pattern. */
  renderDither(p: Params, palette: Palette, seed = 0): void {
    const gl = this.gl;
    const algo = getAlgorithm(p.algorithm);
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
    gl.uniform1f(u('u_cell'), p.cellSize);
    gl.uniform1f(u('u_angle'), (p.angle * Math.PI) / 180);
    gl.uniform1ui(u('u_seed'), seed + 1);
    gl.uniform2f(u('u_offset'), (seed * 29) % 64, (seed * 47) % 64);
    this.setPalette(u, palette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  /** Show a CPU-dithered frame. Without data, re-shows the last result (scaled to the current size). */
  renderResult(result?: { data: Uint8Array; width: number; height: number }): void {
    const gl = this.gl;
    if (result) {
      gl.bindTexture(gl.TEXTURE_2D, this.resultTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, result.width, result.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, result.data);
      this.hasResult = true;
    }
    this.blitToCanvas(this.hasResult ? this.resultTex : this.adjTex);
  }

  /** Show the adjusted image as-is. */
  renderAdjusted(): void {
    this.blitToCanvas(this.adjTex);
  }

  /** ASCII pass: glyph grid + atlas → canvas at cols×cellW by rows×cellH. */
  renderAscii(grid: AsciiGrid, atlas: Atlas, mode: string, fg: string, bg: string, transparent = false): void {
    const gl = this.gl;
    if (this.atlasKey !== atlas.key) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      this.atlasKey = atlas.key;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, grid.cells);

    this.beginOutput(grid.cols * atlas.cellW, grid.rows * atlas.cellH);
    const { prog, u } = this.ascii;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
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

  private blitToCanvas(tex: WebGLTexture): void {
    const gl = this.gl;
    this.beginOutput();
    const { prog, u } = this.blit;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform2f(u('u_outSize'), this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.endOutput();
  }

  /** Size the canvas and bind where the final image goes: the canvas, or the first post buffer. */
  private beginOutput(w = this.adjW, h = this.adjH): void {
    const gl = this.gl;
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
    const n = this.effects.length;
    if (!n) return;
    const gl = this.gl;
    const { prog, u } = this.post;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform2f(u('u_size'), this.postW, this.postH);
    gl.uniform1f(u('u_seed'), this.effectSeed);
    gl.uniform1i(u('u_opaque'), this.opaque ? 1 : 0);
    let src = 0;
    this.effects.forEach((fx, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, i === n - 1 ? null : this.postFbo[1 - src]);
      gl.bindTexture(gl.TEXTURE_2D, this.postTex[src]);
      gl.uniform1i(u('u_kind'), fx.kind);
      gl.uniform4fv(u('u_p'), fx.params);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = 1 - src;
    });
  }

  private setPalette(u: Program['u'], p: Palette): void {
    const gl = this.gl;
    const kind = p.kind === 'ramp' ? 0 : p.kind === 'set' ? 1 : 2;
    const count = Math.min(p.colors.length, MAX_PALETTE);
    this.palBuf.fill(0);
    for (let i = 0; i < count; i++) this.palBuf.set(p.colors[i], i * 3);
    gl.uniform1i(u('u_kind'), kind);
    gl.uniform3fv(u('u_pal'), this.palBuf);
    gl.uniform1i(u('u_palSize'), count);
    gl.uniform1f(u('u_levels'), p.levels);
  }
}
