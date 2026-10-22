// The Appearance setting of the new UI: which part of the light / dark choice is stored, and the colour the phone's browser chrome
// takes (`<meta name="theme-color">`, spec 4.9). Pure where it can be; the DOM part is one small function.
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'loop-console.theme';
export type ThemeStorage = Pick<Storage, 'setItem' | 'removeItem'>;

/**
 * Remembers the viewer's choice: `light` or `dark` is stored, `null` (Automatic) removes it so the system decides again. A browser
 * that blocks storage keeps the choice only until the page reloads.
 */
export function writeThemeChoice(storage: ThemeStorage, choice: Theme | null): void {
  try {
    if (choice === null) storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // storage blocked
  }
}

/** Sets `<meta name="theme-color">` (created when missing) to the computed `--bg` of the page, so the browser bar matches the paper. */
export function applyThemeColor(doc: Document = document): void {
  const bg = getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  meta.content = bg;
}
