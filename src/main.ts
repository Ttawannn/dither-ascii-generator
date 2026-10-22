import './fonts';
import './styles.css';
// Order matters: the page is mounted before the renderer is created, so a WebGL error can be
// shown; feature modules then register their actions and subscriptions as they load.
import './app/mount';
import './app/sheet';
import './app/gpu';
import './app/render';
import './app/split';
import './app/sources';
import './app/exporting';
import './app/undo';
import './app/thumbs';
import './app/input';
import './app/project';
import { openSample } from './app/sources';
import { applyShareLink } from './app/panel/presets';
import { syncLfoLoop } from './app/render';
import { currentTheme, THEME_COLOR } from './app/shell';
import { userFontsLoaded } from './app/ascii-view';
import { loadUserFonts } from './user-fonts';

document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[currentTheme()]);
window.addEventListener('hashchange', applyShareLink);
applyShareLink();
syncLfoLoop();
void loadUserFonts().then(userFontsLoaded);

// Offline support (built site only; in dev the worker would cache stale modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
if (new URLSearchParams(location.search).has('sample')) void openSample();
