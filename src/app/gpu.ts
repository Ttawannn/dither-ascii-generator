import type { DiffusionResult } from '../pipeline/diffuse';
import { Diffuser } from '../pipeline/diffuser';
import { Renderer } from '../pipeline/gl';
import { el } from '../ui/controls';
import { Viewer } from '../ui/viewer';
import { actions, activeLayer, group, requestRender, rt, store } from './core';
import { canvas, flash, info, setStatus, stage } from './shell';

function createRenderer(): Renderer {
  try {
    return new Renderer(canvas);
  } catch (err) {
    // Without WebGL2 nothing else can run: say so in the stage and stop loading the app.
    stage.classList.remove('empty');
    stage.replaceChildren(el('div', { class: 'error' }, (err as Error).message));
    throw err;
  }
}

export const renderer = createRenderer();

// Mobile browsers and GPU driver resets can take the WebGL context away. preventDefault()
// asks for it back; on restore every GPU object is rebuilt and the source re-uploaded.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  flash('GPU reset — restoring…');
});
canvas.addEventListener('webglcontextrestored', () => {
  renderer.restore();
  if (rt.current) renderer.setSource(rt.current.element, rt.current.width, rt.current.height);
  requestRender();
  flash('Preview restored');
});

export const viewer = new Viewer(stage, canvas);
viewer.onChange = () => {
  info.zoom.textContent = renderer.hasSource ? `${Math.round(viewer.zoom * 100)}%` : '';
};
actions.fit = () => viewer.fit();
actions.zoom100 = () => viewer.setZoom(1);

/**
 * Error diffusion runs in a worker per layer; results arrive asynchronously and are drawn if still
 * relevant. With layer 2 on, a result updates that layer's texture and the layers are blended again.
 */
function onDiffused(layer: number, result: DiffusionResult): void {
  if (rt.showOriginal) return;
  const active = activeLayer(store.params);
  const p = layer === 0 ? store.params : active?.params;
  if (!p || p.mode !== 'dither' || group(p) !== 'diffusion') return;
  if (active) {
    renderer.setLayerTarget(layer);
    renderer.renderResult(result, layer);
    renderer.setLayerTarget(null);
    renderer.recomposite();
  } else if (layer === 0) {
    renderer.renderResult(result);
  }
  if (layer === 0) setStatus(`${Math.round(result.ms)} ms`);
}

export const diffusers = [new Diffuser((r) => onDiffused(0, r)), new Diffuser((r) => onDiffused(1, r))];
