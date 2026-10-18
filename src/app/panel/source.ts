import { button, el, section, toggle } from '../../ui/controls';
import { actions, store } from '../core';
import { fileInput } from '../shell';

export const webcamBtn = button('Webcam', () => void actions.toggleWebcam(), 'btn wide');

export const sourceSection = section(
  'Source',
  el(
    'div',
    { class: 'btn-row' },
    button('Upload', () => fileInput.click()),
    button('Sample', () => void actions.openSample()),
    webcamBtn,
  ),
  el('div', { class: 'note source-note' }, 'Images or videos · drop, paste or upload'),
  toggle('mirror', 'Mirror', store),
);
