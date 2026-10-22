import { describe, expect, it } from 'vitest';
import { exportFileName } from './file-name';

const values = { name: 'photo', mode: 'dither', algo: 'atkinson', date: new Date(2026, 9, 23, 9, 5, 7) };

describe('exportFileName', () => {
  it('fills every tag', () => {
    expect(exportFileName('{name}-{mode}', values, 'png')).toBe('photo-dither.png');
    expect(exportFileName('{algo}_{date}_{time}', values, 'jpg')).toBe('atkinson_2026-10-23_090507.jpg');
  });

  it('leaves unknown tags as written', () => {
    expect(exportFileName('{name}-{look}', values, 'webp')).toBe('photo-{look}.webp');
  });

  it('drops characters file systems reject, and falls back to the source name', () => {
    expect(exportFileName('a/b\\c:d*e?"f"<g>|h', values, 'png')).toBe('abcdefgh.png');
    expect(exportFileName(' ..{name}.. ', values, 'png')).toBe('photo.png');
    expect(exportFileName('', values, 'png')).toBe('photo.png');
    expect(exportFileName('///', { ...values, name: '' }, 'svg')).toBe('export.svg');
  });

  it('keeps names in any script', () => {
    expect(exportFileName('ภาพ {name}', values, 'png')).toBe('ภาพ photo.png');
  });
});
