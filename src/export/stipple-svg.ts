import type { StippleResult } from '../pipeline/stipple';
import type { SvgSize } from './halftone-svg';

export function stippleSvg(result: StippleResult, ink: string, paper: string, scale: number, size?: SvgSize): string {
  const { width: w, height: h, points } = result;
  const num = (v: number) => String(Math.round(v * 1000) / 1000);
  const circles: string[] = [];
  for (let i = 0; i < points.length; i += 3)
    circles.push(`<circle cx="${num(points[i])}" cy="${num(points[i + 1])}" r="${num(points[i + 2])}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${size?.width ?? w * scale}" height="${size?.height ?? h * scale}"><defs><clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath></defs><rect width="${w}" height="${h}" fill="${paper}"/><g clip-path="url(#frame)" fill="${ink}">${circles.join('')}</g></svg>`;
}
