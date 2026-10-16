export interface LoadedImage {
  bitmap: ImageBitmap;
  name: string;
  /** Original size before any downscale. */
  originalWidth: number;
  originalHeight: number;
}

const ACCEPTED = /^image\/(png|jpe?g|webp|gif|bmp|avif|svg\+xml)$/;

export function isImageFile(file: File): boolean {
  return ACCEPTED.test(file.type);
}

/** Decode a file into an ImageBitmap, downscaling so the long edge fits `maxSize`. */
export async function loadImageFile(file: File, maxSize: number): Promise<LoadedImage> {
  const full = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = full;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  let bitmap = full;
  if (scale < 1) {
    bitmap = await createImageBitmap(full, {
      resizeWidth: Math.round(width * scale),
      resizeHeight: Math.round(height * scale),
      resizeQuality: 'high',
    });
    full.close();
  }
  return { bitmap, name: file.name.replace(/\.[^.]+$/, '') || 'image', originalWidth: width, originalHeight: height };
}

/** Procedural test image: tonal ramps, colour and shapes — useful for judging dither quality. */
export async function sampleImage(): Promise<LoadedImage> {
  const w = 1200;
  const h = 800;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d')!;

  const bg = g.createRadialGradient(w * 0.35, h * 0.35, 40, w * 0.5, h * 0.5, w * 0.75);
  bg.addColorStop(0, '#f2efe6');
  bg.addColorStop(0.55, '#7d7f86');
  bg.addColorStop(1, '#101014');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // Shaded spheres
  const sphere = (x: number, y: number, r: number, light: string, dark: string) => {
    const s = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    s.addColorStop(0, light);
    s.addColorStop(1, dark);
    g.fillStyle = s;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  sphere(330, 330, 190, '#ffffff', '#1b1b1f');
  sphere(760, 300, 120, '#ffd27a', '#7a1f12');
  sphere(960, 470, 90, '#9fe3ff', '#0d2a5c');

  // Grey ramp + hue ramp along the bottom
  const ramp = g.createLinearGradient(60, 0, w - 60, 0);
  ramp.addColorStop(0, '#000');
  ramp.addColorStop(1, '#fff');
  g.fillStyle = ramp;
  g.fillRect(60, h - 170, w - 120, 50);
  for (let i = 0; i < w - 120; i++) {
    g.fillStyle = `hsl(${(i / (w - 120)) * 360} 90% 55%)`;
    g.fillRect(60 + i, h - 110, 1, 50);
  }

  await document.fonts.load('500 64px "JetBrains Mono"').catch(() => undefined);
  g.fillStyle = '#0a0a0a';
  g.font = '500 64px "JetBrains Mono", monospace';
  g.fillText('DITHER/ASCII', 620, 640);

  return { bitmap: await createImageBitmap(c), name: 'sample', originalWidth: w, originalHeight: h };
}
