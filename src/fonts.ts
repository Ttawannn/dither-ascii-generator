// Fonts ship with the app (SIL Open Font Licence) so it works offline. Each stylesheet splits its
// font into unicode-range subsets, so the browser only downloads the subsets a page actually uses
// (the Noto fallbacks for non-Latin character sets stay unloaded until one of those sets is chosen).

// UI and ASCII fonts.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/vt323/400.css';
// Thai UI text (after JetBrains Mono in --font, so it only supplies Thai glyphs).
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
// Parchment theme display face.
import '@fontsource/grenze-gotisch/500.css';
import '@fontsource/grenze-gotisch/600.css';
// Fallbacks for glyphs the ASCII font lacks (FALLBACK_FONTS in ascii/charsets.ts).
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans-symbols-2/400.css';
import '@fontsource/noto-sans-math/400.css';
import '@fontsource/noto-sans-runic/400.css';
import '@fontsource/noto-sans-hebrew/400.css';
import '@fontsource/noto-sans-jp/400.css';
