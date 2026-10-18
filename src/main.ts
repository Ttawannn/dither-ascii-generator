import './styles.css';
// Order matters: the page is mounted before the renderer is created, so a WebGL error can be
// shown; feature modules then register their actions and subscriptions as they load.
import './app/mount';
import './app/gpu';
import './app/render';
import './app/sources';
import './app/exporting';
import './app/input';
import { openSample } from './app/sources';
import { applyShareLink } from './app/panel/presets';
import { syncLfoLoop } from './app/render';
import { currentTheme, THEME_COLOR } from './app/shell';

document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[currentTheme()]);
window.addEventListener('hashchange', applyShareLink);
applyShareLink();
syncLfoLoop();
if (new URLSearchParams(location.search).has('sample')) void openSample();
