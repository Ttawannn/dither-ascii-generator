import { ASCII_KEYS, DITHER_KEYS } from '../../state';
import { button, el, section } from '../../ui/controls';
import { store } from '../core';
import { adjustSection } from './adjust';
import { animationSection } from './animation';
import { asciiControls } from './ascii';
import { ditherControls } from './dither';
import { effectsSection } from './effects';
import { exportFoot, exportSection } from './export';
import { maskSection } from './mask';
import { presetsSection } from './presets';
import { sourceSection } from './source';

// The settings panel, top to bottom. Each section lives in its own module.

const effectSection = section('Effect', ditherControls, asciiControls);
effectSection.head.append(
  button('Reset', () => store.reset(store.params.mode === 'ascii' ? ASCII_KEYS : DITHER_KEYS), 'link'),
);

export const panel = el(
  'aside',
  { class: 'panel' },
  el(
    'div',
    { class: 'panel-scroll' },
    sourceSection.root,
    presetsSection.root,
    adjustSection.root,
    effectSection.root,
    animationSection.root,
    effectsSection.root,
    maskSection.root,
    exportSection.root,
  ),
  exportFoot,
);
