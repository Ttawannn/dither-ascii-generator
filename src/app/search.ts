import { translate } from '../i18n';
import { button, el } from '../ui/controls';
import { setFolded } from '../ui/prefs';
import { matchScore, revealConditions, searchOptions } from '../ui/search';
import { actions } from './core';
import { currentLang, englishAttribute, englishText, onLangChange } from './lang';
import { panel } from './panel';
import { searchablePresets } from './panel/presets';
import { flash, header } from './shell';

interface Command { label: string; detail: string; aliases: string; run(): void }
const dialog = el('dialog', { class: 'command-dialog', 'aria-label': 'Search settings and commands' });
const input = el('input', {
  type: 'search', class: 'command-input', placeholder: 'Search settings, palettes, presets…',
  'aria-label': 'Search settings and commands', role: 'combobox', 'aria-autocomplete': 'list',
  'aria-controls': 'command-results', 'aria-expanded': 'true', autocomplete: 'off',
});
const results = el('div', { class: 'command-results', id: 'command-results', role: 'listbox', 'aria-label': 'Search results' });
const status = el('div', { class: 'note command-status', role: 'status' });
const close = button('Close', () => dialog.close(), 'link');
dialog.append(el('div', { class: 'command-head' }, input, close), results, status);
document.body.append(dialog);
let commands: Command[] = [];
let shown: Command[] = [];
let selected = 0;
let previousFocus: HTMLElement | null = null;
let skipRestore = false;

function reveal(target: HTMLElement): boolean {
  // A collapsed mobile sheet must open before scrolling / focusing its controls.
  panel.dispatchEvent(new Event('reveal-settings'));
  const section = target.closest<HTMLElement>('[data-section]');
  if (section) {
    setFolded(section.dataset.section!, false);
    section.classList.add('show-adv');
    const more = section.querySelector('.more-settings');
    if (more) { more.textContent = 'Fewer settings'; more.setAttribute('aria-expanded', 'true'); }
  }
  const body = target.closest<HTMLElement>('.effect-body');
  if (body) body.hidden = false;
  if (!revealConditions(target)) { flash('This setting is unavailable for the current source'); return false; }
  (target.closest('.control, .color-input') ?? target).scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
  return true;
}

const tr = (s: string) => translate(s, currentLang());

function indexCommands(): Command[] {
  const list: Command[] = [];
  const indexed = new Set<HTMLElement>();
  const addControl = (target: HTMLElement, name: string, english: string) => {
    const section = target.closest('[data-section]')?.querySelector('.section-title');
    const detail = section?.textContent ?? '';
    list.push({ label: name, detail, aliases: `${english} ${translate(english, 'th')}`, run: () => { reveal(target); } });
    indexed.add(target);
  };
  for (const label of panel.querySelectorAll<HTMLElement>('.control-label')) {
    const root = label.closest<HTMLElement>('.control, .color-input');
    const target = root?.matches('button') ? root : root?.classList.contains('picker')
      ? root.querySelectorAll<HTMLSelectElement>('select')[englishText(label).trim() === 'Category' ? 0 : 1]
      : root?.querySelector<HTMLElement>('input:not([type=number]), select, textarea, [role=slider]') ?? root?.querySelector<HTMLElement>('button');
    if (!target) continue;
    addControl(target, label.textContent ?? '', englishText(label));
  }
  for (const target of panel.querySelectorAll<HTMLElement>('input[aria-label]:not([type=number]):not([type=file]), select[aria-label], textarea[aria-label], [role=slider][aria-label]')) {
    if (!indexed.has(target)) addControl(target, target.getAttribute('aria-label') ?? '', englishAttribute(target, 'aria-label'));
  }
  for (const select of panel.querySelectorAll('select')) {
    if (englishAttribute(select, 'aria-label').endsWith(' category')) continue;
    const label = tr(englishAttribute(select, 'aria-label'));
    const options = searchOptions.get(select)?.() ?? [...select.options].filter((o) => !o.disabled).map((o) => ({
      label: englishText(o), choose: () => { select.value = o.value; select.dispatchEvent(new Event('change')); },
    }));
    for (const opt of options) {
      list.push({
        label: tr(opt.label), detail: label, aliases: `${opt.label} ${translate(opt.label, 'th')}`,
        run: () => { if (reveal(select)) opt.choose(); },
      });
    }
  }
  for (const b of panel.querySelectorAll<HTMLButtonElement>('.fx-menu-item')) {
    if (panel.querySelector<HTMLButtonElement>('.fx-add > button')?.disabled) continue;
    const name = englishText(b).trim();
    const section = b.closest<HTMLElement>('[data-section]')!;
    list.unshift({
      label: `${tr('Add effect')} · ${tr(name)}`, detail: tr('Effects'), aliases: `${name} ${translate(name, 'th')} Add effect เพิ่มเลเยอร์`,
      run: () => {
        if (panel.querySelector<HTMLButtonElement>('.fx-add > button')?.disabled) { flash('Up to 16 effect layers'); return; }
        setFolded(section.dataset.section!, false);
        panel.dispatchEvent(new Event('reveal-settings'));
        b.click();
        const card = section.querySelector<HTMLElement>('.effect-card:last-of-type');
        card?.scrollIntoView({ block: 'center' });
        card?.querySelector<HTMLButtonElement>('.fx-name')?.focus();
      },
    });
  }
  for (const preset of searchablePresets()) {
    list.push({ label: preset.label, detail: tr('Presets'), aliases: preset.label, run: () => { preset.choose(); } });
  }
  return list;
}

function selectResult(index: number): void {
  selected = index;
  const rows = [...results.querySelectorAll<HTMLElement>('[role=option]')];
  rows.forEach((row, i) => row.setAttribute('aria-selected', `${i === selected}`));
  if (rows[selected]) {
    input.setAttribute('aria-activedescendant', rows[selected].id);
    rows[selected].scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function run(index: number): void {
  const command = shown[index];
  if (!command) return;
  skipRestore = true;
  dialog.close();
  actions.beginUndo();
  command.run();
}

function render(): void {
  shown = commands.map((command, order) => ({ command, order, score: Math.min(matchScore(input.value, command.label), matchScore(input.value, command.aliases)) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, 80).map((item) => item.command);
  results.replaceChildren(...shown.map((cmd, i) => {
    const row = el('div', { role: 'option', id: `command-${i}`, class: 'command-result', 'aria-selected': 'false', translate: 'no' },
      el('span', {}, cmd.label), el('small', {}, cmd.detail));
    row.addEventListener('pointerdown', (e) => e.preventDefault());
    row.addEventListener('click', () => run(i));
    return row;
  }));
  status.textContent = shown.length ? '↑ ↓ to choose · Enter to open · Esc to close' : 'No matching settings or commands';
  selectResult(0);
}

input.addEventListener('input', render);
dialog.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); dialog.close();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (shown.length) selectResult((selected + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
  } else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); run(selected); }
  e.stopPropagation();
});
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { if (!skipRestore) previousFocus?.focus(); skipRestore = false; });
onLangChange(() => { if (dialog.open) { commands = indexCommands(); render(); } });

export function openSearch(): void {
  if (dialog.open) { dialog.close(); return; }
  previousFocus = document.activeElement as HTMLElement | null;
  commands = indexCommands();
  input.value = '';
  dialog.showModal();
  render();
  input.focus();
}

const searchButton = button('⌕', openSearch, 'btn small search-btn');
searchButton.title = 'Search settings and commands (Ctrl+K)';
searchButton.setAttribute('aria-label', searchButton.title);
header.insertBefore(searchButton, header.querySelector('.lang-btn'));
