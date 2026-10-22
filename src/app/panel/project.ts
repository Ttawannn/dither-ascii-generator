import { button, el, section } from '../../ui/controls';
import { actions } from '../core';

const picker = el('input', { type: 'file', accept: '.dither-project', hidden: '' });
picker.addEventListener('change', () => {
  const file = picker.files?.[0]; picker.value = '';
  if (file) void actions.openProject(file);
});
const save = button('Save project', () => void actions.saveProject(), 'btn small');
const open = button('Open project', () => picker.click(), 'btn small');
const cancel = button('Cancel', () => actions.cancelProject(), 'btn small');
cancel.hidden = true;
const status = el('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
actions.projectStatus = (message, busy) => {
  status.textContent = message; save.disabled = open.disabled = busy; cancel.hidden = !busy;
};
export const projectSection = section('Project',
  el('div', { class: 'btn-row' }, save, open, cancel),
  el('div', { class: 'note' }, 'Projects include source files and settings. Webcam saves the current frame.'), status, picker);
