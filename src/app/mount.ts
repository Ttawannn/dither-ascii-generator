import { el } from '../ui/controls';
import { panel } from './panel';
import { fileInput, footer, header, help, stage } from './shell';

// Put the page in place before the renderer is created (gpu.ts), so that a missing-WebGL
// error can still be shown in the stage.
document.querySelector('#app')!.append(el('div', { class: 'app' }, header, stage, footer, panel), fileInput, help);
