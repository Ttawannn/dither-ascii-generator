import type { Params } from '../state';
import { getAlgorithm } from './algorithms';
import { blueNoise } from './bluenoise';
import { baseSpread, MAX_PALETTE, type Palette } from './palettes';
import fullscreenVert from './shaders/fullscreen.vert?raw';
import adjustFrag from './shaders/adjust.frag?raw';
import ditherFrag from './shaders/dither.frag?raw';
import blitFrag from './shaders/blit.frag?raw';

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
 *   adjusted ──blit──▶ canvas              (original view, ASCII placeholder)
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxTextureSize: number;
  private adjust: Program;
  private dither: Program;
  private blit: Program;
  private srcTex: WebGLTexture;
  private adjTex: WebGLTexture;
  private resultTex: WebGLTexture;
  private noiseTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private srcW = 0;
  private srcH = 0;
  private adjW = 0;
  private adjH = 0;
  private hasResult = false;
  private palBuf = new Float32Array(MAX_PALETTE * 3);

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    this.adjust = program(gl, fullscreenVert, adjustFrag);
    this.dither = program(gl, fullscreenVert, ditherFrag);
    this.blit = program(gl, fullscreenVert, blitFrag);

    // Mipmaps give a clean box-filtered downsample when pixel size > 1.
    this.srcTex = texture(gl, gl.LINEAR_MIPMAP_LINEAR);
    this.adjTex = texture(gl, gl.NEAREST);
    this.resultTex = texture(gl, gl.NEAREST);
    this.noiseTex = texture(gl, gl.NEAREST, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, blueNoise(64));

    this.fbo = gl.createFramebuffer()!;
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

  /** Pass 1: source → adjusted FBO at output resolution. */
  renderAdjust(p: Params, bypass: boolean): void {
    const gl = this.gl;
    const [w, h] = this.outputSize(p.pixelSize);
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

  /** True when the canvas already has the current output size (resizing would clear it). */
  get canvasMatches(): boolean {
    return this.canvas.width === this.adjW && this.canvas.height === this.adjH;
  }

  /** Pass 2 (GPU): ordered / pattern / threshold dither to the canvas. */
  renderDither(p: Params, palette: Palette): void {
    const gl = this.gl;
    const algo = getAlgorithm(p.algorithm);
    this.toCanvas();
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
    gl.uniform1ui(u('u_seed'), 1);
    this.setPalette(u, palette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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

  private blitToCanvas(tex: WebGLTexture): void {
    const gl = this.gl;
    this.toCanvas();
    const { prog, u } = this.blit;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u('u_tex'), 0);
    gl.uniform2f(u('u_outSize'), this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private toCanvas(): void {
    const gl = this.gl;
    if (this.canvas.width !== this.adjW || this.canvas.height !== this.adjH) {
      this.canvas.width = this.adjW;
      this.canvas.height = this.adjH;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.adjW, this.adjH);
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
