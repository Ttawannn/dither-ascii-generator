import { download } from '../../export/png';
import {
  BAND_SHAPES, MAX_SHAPE_BANDS, MAX_SHAPE_JSON, SHAPE_SETS, distributeShapeBands, moveShapeBoundary, parseShapeBands,
  resizeShapeBand, reverseShapeBands, shapeBandWidthLimit, shapeSet, splitShapeBand, type ShapeBand,
} from '../../pipeline/shape-bands';
import { imagePreview, loadBandImage } from '../../ui/band-image';
import { DITHER_SLIDERS, type ParamStore } from '../../state';
import { button, colorInput, el, select, slider, toggle } from '../../ui/controls';

export function lumaShapesEditor(store: ParamStore): HTMLElement {
  let selected = 0;
  const bands = () => parseShapeBands(store.params.shapeBands) ?? shapeSet();
  const write = (next: ShapeBand[]) => store.set('shapeBands', JSON.stringify(next));
  const edit = (patch: Partial<ShapeBand>) => write(bands().map((b, i) => i === selected ? { ...b, ...patch } : b));
  const strip = el('div', { class: 'luma-strip', 'aria-label': 'Brightness bands' });
  strip.append(el('div', { class: 'luma-rail', 'aria-hidden': 'true' }));
  const segmentLayer = el('div', { class: 'luma-segments' });
  const handleLayer = el('div', { class: 'luma-handles' });
  strip.append(segmentLayer, handleLayer);
  const list = el('div', { class: 'luma-bands' });
  const status = el('div', { class: 'note', role: 'status' });
  const setPicker = el('select', { 'aria-label': 'Shape set' },
    el('option', { value: '', disabled: '' }, 'Custom shapes'),
    ...SHAPE_SETS.map((s) => el('option', { value: s.id }, s.label)));
  setPicker.addEventListener('change', () => { selected = 0; write(shapeSet(setPicker.value)); });
  // ‹ › step through the supplied sets (from custom shapes, › starts at the first and ‹ at the last).
  const stepSet = (dir: number) => {
    const i = SHAPE_SETS.findIndex((s) => s.id === setPicker.value);
    const next = i < 0 ? (dir > 0 ? 0 : SHAPE_SETS.length - 1) : (i + dir + SHAPE_SETS.length) % SHAPE_SETS.length;
    selected = 0;
    write(shapeSet(SHAPE_SETS[next].id));
  };
  const prevSet = button('‹', () => stepSet(-1), 'btn small luma-step');
  prevSet.setAttribute('aria-label', 'Previous shape set');
  prevSet.title = 'Previous shape set';
  const nextSet = button('›', () => stepSet(1), 'btn small luma-step');
  nextSet.setAttribute('aria-label', 'Next shape set');
  nextSet.title = 'Next shape set';
  const count = el('span', { class: 'luma-count', title: 'Number of bands' });
  const shapePicker = el('select', { 'aria-label': 'Band shape' },
    ...BAND_SHAPES.map((s) => el('option', { value: s.id }, s.label)));
  shapePicker.addEventListener('change', () => {
    if (shapePicker.value === 'image' && !bands()[selected].image) {
      shapePicker.value = bands()[selected].shape;
      imageFile.click();
    } else edit({ shape: shapePicker.value as ShapeBand['shape'] });
  });
  const size = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Band size' });
  const sizeValue = el('span', { class: 'control-value' });
  const rotation = el('input', { type: 'range', min: '-180', max: '180', step: '1', 'aria-label': 'Band rotation' });
  const rotationValue = el('span', { class: 'control-value' });
  rotation.addEventListener('input', () => edit({ rotation: Number(rotation.value) }));
  size.addEventListener('input', () => edit({ size: Number(size.value) }));
  const boundary = el('input', { type: 'range', step: '1', 'aria-label': 'Band width' });
  const boundaryValue = el('span', { class: 'control-value' });
  boundary.addEventListener('input', () => write(resizeShapeBand(bands(), selected, Number(boundary.value))));
  const imageFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif', hidden: '' });
  const imageName = el('span', { class: 'luma-image-name', translate: 'no' });
  const selectedImage = el('div', { class: 'luma-upload-preview', 'aria-hidden': 'true' });
  const clearImage = button('Remove image', () => {
    const next = bands();
    const band = { ...next[selected] };
    delete band.image;
    delete band.imageName;
    if (band.shape === 'image') band.shape = 'circle';
    next[selected] = band;
    write(next);
  }, 'btn small');
  imageFile.addEventListener('change', async () => {
    const uploaded = imageFile.files?.[0];
    imageFile.value = '';
    if (!uploaded) return;
    const before = store.params.shapeBands;
    const index = selected;
    status.textContent = 'Loading shape image…';
    try {
      const image = await loadBandImage(uploaded);
      if (store.params.shapeBands !== before || selected !== index) {
        status.textContent = 'Settings changed; upload the image again';
        return;
      }
      edit({ ...image, shape: 'image', size: bands()[selected].size || 80, color: '#ffffff' });
      status.textContent = 'Shape image loaded';
    } catch {
      status.textContent = 'Could not load image: choose an image under 10 MB';
    }
  });
  const title = el('span', { class: 'control-label' });
  const split = button('Split band', () => write(splitShapeBand(bands(), selected)), 'btn small');
  /** Remove band i; the band below takes its range (the last band's neighbour takes it up to 255). */
  const removeBand = (i: number) => {
    const next = bands();
    if (next.length <= 2) return;
    const end = next[i].end;
    next.splice(i, 1);
    if (i === next.length) next[next.length - 1].end = end;
    if (selected >= i && selected > 0) selected--;
    selected = Math.min(selected, next.length - 1);
    write(next);
  };
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
  file.addEventListener('change', async () => {
    const imported = file.files?.[0];
    file.value = '';
    if (!imported) return;
    try {
      if (imported.size > MAX_SHAPE_JSON) throw new Error();
      const next = parseShapeBands(await imported.text());
      if (!next) throw new Error();
      selected = 0;
      write(next);
      status.textContent = 'Shape set imported';
    } catch {
      status.textContent = 'Invalid shape set: use an exported JSON file';
    }
  });
  let rows: {
    root: HTMLElement;
    button: HTMLButtonElement;
    icon: HTMLElement;
    label: HTMLElement;
    range: HTMLElement;
    swatch: HTMLInputElement;
    remove: HTMLButtonElement;
  }[] = [];
  let segments: HTMLButtonElement[] = [];
  let handles: HTMLButtonElement[] = [];
  const previewKeys = new WeakMap<HTMLElement, string>();
  function preview(root: HTMLElement, band: ShapeBand): void {
    const key = band.shape === 'image' ? band.image! : band.shape;
    if (previewKeys.get(root) !== key) {
      if (band.shape === 'image' && band.image) root.replaceChildren(imagePreview(band.image));
      else root.textContent = BAND_SHAPES.find((s) => s.id === band.shape)!.symbol;
      previewKeys.set(root, key);
    }
    root.style.color = band.color;
    root.style.backgroundColor = store.params.shapeBackground;
  }
  function makeHandle(index: number): HTMLButtonElement {
    const handle = el('button', { type: 'button', class: 'luma-boundary', role: 'slider', tabindex: '0',
      'aria-label': `Band boundary ${index + 1}`, 'aria-orientation': 'horizontal' });
    let pointer: number | null = null;
    const move = (x: number) => {
      const rect = strip.getBoundingClientRect();
      if (rect.width > 0) write(moveShapeBoundary(bands(), index, (x - rect.left) / rect.width * 256 - 1));
    };
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      pointer = e.pointerId;
      selected = index;
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(e.pointerId);
      sync();
    });
    handle.addEventListener('pointermove', (e) => { if (pointer === e.pointerId) move(e.clientX); });
    handle.addEventListener('pointerup', (e) => {
      if (pointer !== e.pointerId) return;
      move(e.clientX);
      pointer = null;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) handle.addEventListener(type, () => { pointer = null; });
    handle.addEventListener('keydown', (e) => {
      const current = bands();
      let end = current[index].end;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') end -= e.shiftKey ? 10 : 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') end += e.shiftKey ? 10 : 1;
      else if (e.key === 'Home') end = (current[index - 1]?.end ?? -1) + 1;
      else if (e.key === 'End') end = current[index + 1].end - 1;
      else return;
      e.preventDefault();
      e.stopPropagation();
      selected = index;
      write(moveShapeBoundary(current, index, end));
    });
    return handle;
  }
  function sync(): void {
    const current = bands();
    selected = Math.min(selected, current.length - 1);
    if (rows.length !== current.length) {
      rows = current.map((_, i) => {
        const icon = el('span', { class: 'luma-icon', 'aria-hidden': 'true' });
        const label = el('span', {});
        const range = el('span', { class: 'control-value', translate: 'no' });
        const pick = button('', () => { selected = i; sync(); }, 'luma-band-pick');
        pick.append(el('span', { class: 'luma-index', translate: 'no' }, `${i + 1}`), icon, label, range);
        const swatch = el('input', { type: 'color', class: 'luma-swatch', 'aria-label': `Band ${i + 1} colour` });
        swatch.addEventListener('input', () => write(bands().map((b, k) => (k === i ? { ...b, color: swatch.value } : b))));
        const remove = button('×', () => removeBand(i), 'luma-band-x');
        remove.setAttribute('aria-label', `Remove band ${i + 1}`);
        remove.title = `Remove band ${i + 1}`;
        const root = el('div', { class: 'luma-band' }, pick, swatch, remove);
        return { root, button: pick, icon, label, range, swatch, remove };
      });
      list.replaceChildren(...rows.map((r) => r.root));
      segments = current.map((_, i) => {
        const segment = button('', () => { selected = i; sync(); }, 'luma-segment');
        segment.append(el('span', { class: 'luma-icon', 'aria-hidden': 'true' }));
        return segment;
      });
      segmentLayer.replaceChildren(...segments);
      handles = current.slice(0, -1).map((_, i) => makeHandle(i));
      handleLayer.replaceChildren(...handles);
    }
    current.forEach((band, i) => {
      const start = i ? current[i - 1].end + 1 : 0;
      const shape = BAND_SHAPES.find((s) => s.id === band.shape)!;
      const row = rows[i];
      row.root.classList.toggle('active', i === selected);
      row.button.setAttribute('aria-pressed', `${i === selected}`);
      row.swatch.value = band.color;
      row.swatch.disabled = band.shape === 'empty';
      row.remove.disabled = current.length <= 2;
      preview(row.icon, band);
      row.label.textContent = shape.label;
      row.range.textContent = `${start}–${band.end}`;
      const segment = segments[i];
      segment.style.left = `${start / 256 * 100}%`;
      segment.style.width = `${(band.end - start + 1) / 256 * 100}%`;
      preview(segment.firstElementChild as HTMLElement, band);
      segment.classList.toggle('active', i === selected);
      segment.setAttribute('aria-label', `Band ${i + 1}: ${start}–${band.end}`);
      segment.setAttribute('aria-pressed', `${i === selected}`);
      segment.title = `${start}–${band.end}`;
      if (i < handles.length) {
        const handle = handles[i];
        handle.style.left = `${(band.end + 1) / 256 * 100}%`;
        handle.setAttribute('aria-valuemin', `${start}`);
        handle.setAttribute('aria-valuemax', `${current[i + 1].end - 1}`);
        handle.setAttribute('aria-valuenow', `${band.end}`);
        handle.setAttribute('aria-valuetext', `${band.end} / 255`);
        handle.title = `${band.end}`;
      }
    });
    const band = current[selected];
    const start = selected ? current[selected - 1].end + 1 : 0;
    title.textContent = `Band ${selected + 1}`;
    shapePicker.value = band.shape;
    count.textContent = `${current.length}`;
    size.value = `${band.size}`;
    size.style.setProperty('--fill', `${band.size}%`);
    sizeValue.textContent = `${band.size}%`;
    size.disabled = band.shape === 'empty';
    rotation.value = `${band.rotation ?? 0}`;
    rotationValue.textContent = `${band.rotation ?? 0}°`;
    const width = band.end - start + 1;
    boundary.min = '1';
    boundary.max = `${shapeBandWidthLimit(current, selected)}`;
    boundary.value = `${width}`;
    boundary.style.setProperty('--fill', `${(width - 1) / Math.max(1, Number(boundary.max) - 1) * 100}%`);
    boundaryValue.textContent = `${width}`;
    selectedImage.hidden = !band.image;
    clearImage.hidden = !band.image;
    imageName.textContent = band.imageName ?? '';
    if (band.image) preview(selectedImage, { ...band, shape: 'image' });
    split.disabled = current.length >= MAX_SHAPE_BANDS || band.end <= start;
    setPicker.value = SHAPE_SETS.find((s) => JSON.stringify(shapeSet(s.id)) === store.params.shapeBands)?.id ?? '';
  }
  store.subscribe((_, key) => { if (key === 'shapeBands' || key === 'shapeBackground') sync(); });
  sync();
  return el('div', { class: 'luma-editor' },
    el('label', { class: 'control' }, el('span', { class: 'control-label' }, 'Shape set'),
      el('div', { class: 'luma-set-row' }, el('div', { class: 'select' }, setPicker), prevSet, nextSet)),
    el('div', { class: 'pal-actions' },
      button('Import shapes', () => file.click(), 'btn small'),
      button('Export shapes', () => download(new Blob([JSON.stringify(bands(), null, 2)],
        { type: 'application/json' }), 'luma-shapes.json'), 'btn small')),
    file,
    el('div', { class: 'luma-head' }, el('div', { class: 'subhead' }, 'Brightness bands'), count), strip,
    el('div', { class: 'luma-scale', translate: 'no', 'aria-hidden': 'true' },
      ...[0, 64, 128, 192, 255].map((v) => el('span', { style: `left: ${(v / 255) * 100}%` }, `${v}`))),
    el('div', { class: 'note' }, 'Drag a divider to change brightness ranges'),
    el('div', { class: 'pal-actions' }, split,
      button('Distribute', () => write(distributeShapeBands(bands())), 'btn small'),
      button('Reverse bands', () => write(reverseShapeBands(bands())), 'btn small')),
    list,
    el('div', { class: 'luma-selected' },
      el('div', { class: 'control-row' }, title),
      el('label', { class: 'control' }, el('span', { class: 'control-label' }, 'Band shape'),
        el('div', { class: 'select' }, shapePicker)),
      el('div', { class: 'luma-upload' }, selectedImage, imageName,
        el('div', { class: 'pal-actions' }, button('Upload shape image', () => imageFile.click(), 'btn small'), clearImage),
        el('div', { class: 'note' }, 'PNG keeps transparency · images fit inside a 64×64 tile'), imageFile),
      el('label', { class: 'control' }, el('div', { class: 'control-row' }, 'Band size', sizeValue), size),
      el('label', { class: 'control' }, el('div', { class: 'control-row' }, 'Band rotation', rotationValue), rotation),
      el('label', { class: 'control' }, el('div', { class: 'control-row' }, 'Band width', boundaryValue), boundary)),
    colorInput('shapeBackground', 'Background', store),
    toggle('shapeTransparent', 'Transparent shapes background', store),
    select('shapeLayout', 'Shape layout', [{ value: 'grid', label: 'Grid' }, { value: 'staggered', label: 'Staggered' }, { value: 'scatter', label: 'Scatter' }], store),
    ...['shapeJitter', 'shapeSizeJitter', 'shapeAngleJitter', 'shapeSeed'].map((k) => slider(DITHER_SLIDERS[k], store)),
    slider(DITHER_SLIDERS.shapeFeather, store),
    select('shapeFeatherPattern', 'Feather pattern', [
      { value: 'ordered', label: 'Ordered' }, { value: 'scatter', label: 'Scatter' },
    ], store),
    status,
    el('div', { class: 'note' }, 'Save this look in Presets to keep all settings'),
  );
}
