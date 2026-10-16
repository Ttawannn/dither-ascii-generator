import type { Params } from '../state';
import fullscreenVert from './shaders/fullscreen.vert?raw';
import adjustFrag from './shaders/adjust.frag?raw';

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

/** Uniform setter cache keyed by name. */
function uniforms(gl: WebGL2RenderingContext, prog: WebGLProgram) {
  const cache = new Map<string, WebGLUniformLocation | null>();
  return (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name)!;
  };
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxTextureSize: number;
  private adjust: WebGLProgram;
  private u: ReturnType<typeof uniforms>;
  private srcTex: WebGLTexture;
  private srcW = 0;
  private srcH = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    this.adjust = link(gl, fullscreenVert, adjustFrag);
    this.u = uniforms(gl, this.adjust);

    this.srcTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Mipmaps give a clean box-filtered downsample when pixel size > 1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
  }

  /** Processed (output) resolution for the given pixel size. */
  outputSize(pixelSize: number): [number, number] {
    return [Math.max(1, Math.round(this.srcW / pixelSize)), Math.max(1, Math.round(this.srcH / pixelSize))];
  }

  render(p: Params, bypass = false): void {
    if (!this.hasSource) return;
    const gl = this.gl;
    const [w, h] = this.outputSize(p.pixelSize);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.adjust);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);

    const u = this.u;
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
}
