export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save the processed canvas as PNG, upscaled by `scale` with nearest-neighbour. */
export async function exportPng(source: HTMLCanvasElement, scale: number, filename: string): Promise<void> {
  const out = document.createElement('canvas');
  out.width = source.width * scale;
  out.height = source.height * scale;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  download(blob, filename);
}
