import { describe, expect, it } from 'vitest';
import { sanitizeUiPrefs } from './prefs';

describe('panel preferences', () => {
  it('start new visitors in Basic mode and people with saved settings in Advanced', () => {
    expect(sanitizeUiPrefs(null, false)).toEqual({ mode: 'basic', folded: {} });
    expect(sanitizeUiPrefs(null, true)).toEqual({ mode: 'advanced', folded: {} });
  });

  it('keep a stored choice whatever was saved before', () => {
    expect(sanitizeUiPrefs({ mode: 'basic', folded: { adjust: false } }, true)).toEqual({ mode: 'basic', folded: { adjust: false } });
  });

  it('drop malformed entries', () => {
    expect(sanitizeUiPrefs({ mode: 'expert', folded: { mask: 'yes', export: true, [('x').repeat(50)]: true } }, false)).toEqual({
      mode: 'basic',
      folded: { export: true },
    });
    expect(sanitizeUiPrefs(['basic'], true).mode).toBe('advanced');
  });
});
