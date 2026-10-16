const MAX_COLORS = 32;

/** Read a canvas (WebGL or 2D) back as RGBA pixels. */
export function readPixels(source: HTMLCanvasElement): ImageData {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

const hex = (r: number, g: number, b: number) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

/**
 * Vector version of a low-colour image: the most common colour becomes the background,
 * every other colour one <path> of horizontal runs. Returns null when the image has too many colours.
 */
export function canvasToSvg(source: HTMLCanvasElement, scale: number): string | null {
  const { data, width: w, height: h } = readPixels(source);

  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.size > MAX_COLORS) return null;
  }
  const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const paths = new Map<number, string[]>();
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = (y * w + x) * 4;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let run = 1;
      while (x + run < w) {
        const j = (y * w + x + run) * 4;
        if (((data[j] << 16) | (data[j + 1] << 8) | data[j + 2]) !== key) break;
        run++;
      }
      if (key !== bg) {
        if (!paths.has(key)) paths.set(key, []);
        paths.get(key)!.push(`M${x} ${y}h${run}v1h-${run}z`);
      }
      x += run;
    }
  }

  const color = (k: number) => hex((k >> 16) & 255, (k >> 8) & 255, k & 255);
  const body = [...paths.entries()].map(([k, d]) => `<path fill="${color(k)}" d="${d.join('')}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">
<rect width="${w}" height="${h}" fill="${color(bg)}"/>
${body}
</svg>
`;
}
