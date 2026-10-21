import { BAND_IMAGE_SIZE, decodeBandImage, encodeBandImage, type ShapeBand } from '../pipeline/shape-bands';
import { loadImageFile } from '../source/image';

/** Fit inside a transparent tile, preserving aspect ratio and the uploaded alpha channel. */
export async function loadBandImage(file: File): Promise<Pick<ShapeBand, 'image' | 'imageName'>> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG or WebP image under 10 MB');
  }
  const source = await loadImageFile(file, BAND_IMAGE_SIZE);
  try {
    const tile = new OffscreenCanvas(BAND_IMAGE_SIZE, BAND_IMAGE_SIZE);
    const ctx = tile.getContext('2d')!;
    const scale = BAND_IMAGE_SIZE / Math.max(source.width, source.height);
    const width = source.width * scale, height = source.height * scale;
    ctx.drawImage(source.element, (BAND_IMAGE_SIZE - width) / 2, (BAND_IMAGE_SIZE - height) / 2, width, height);
    return { image: encodeBandImage(ctx.getImageData(0, 0, BAND_IMAGE_SIZE, BAND_IMAGE_SIZE).data),
      imageName: file.name.slice(0, 80) };
  } finally {
    source.dispose();
  }
}

export function imagePreview(image: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BAND_IMAGE_SIZE;
  canvas.className = 'luma-image-preview';
  const pixels = new Uint8ClampedArray(decodeBandImage(image));
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, BAND_IMAGE_SIZE, BAND_IMAGE_SIZE), 0, 0);
  return canvas;
}
