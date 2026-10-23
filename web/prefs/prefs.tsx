// Language + light / dark (UC-18): the default is English and follows the system mode; when the user changes it by hand it is remembered in
// the browser (localStorage - only a convenience of one viewer, if reading / writing breaks it still runs with the defaults).
// The mode is applied with `data-theme` on <html> - exactly how design/ds/tokens.css picks the token set; the language goes in `lang` of <html>.
import { createContext, Fragment, createElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { formatParts, MESSAGES, tn as plural, translate, type Lang, type MessageKey, type Params, type PluralBase } from './messages';
import { applyThemeColor, THEME_STORAGE_KEY, writeThemeChoice, type Theme } from './theme';

export type { Theme };

export const STORAGE_KEYS = { lang: 'loop-console.lang', theme: THEME_STORAGE_KEY } as const;

export type Prefs = {
  lang: Lang;
  /** The mode being shown (system included). */
  theme: Theme;
  /** The user chose by hand (`null` = following the system). */
  themeChoice: Theme | null;
  setLang(lang: Lang): void;
  setTheme(theme: Theme): void;
  /** The Appearance setting of the new UI: `null` = Automatic (follow the system again). */
  setThemeChoice(choice: Theme | null): void;
};

type TFn = {
  (key: MessageKey, params?: Params): string;
  /** Plural text (spec D16): `tn('summary.runs', 2)` reads `summary.runs.one`, `.other` or `.zero`, with `{n}` filled in. */
  tn(base: PluralBase, n: number, params?: Params): string;
  /** The parameters are React elements (a bold number, a status tag...). */
  node(key: MessageKey, params: Record<string, ReactNode | string | number>): ReactNode;
  lang: Lang;
};

const PrefsContext = createContext<Prefs | null>(null);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // the browser blocks saving: the choice lives only until the page reloads
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}
function storedLang(): Lang {
  const v = read(STORAGE_KEYS.lang);
  return v === 'en' || v === 'vi' ? v : 'en';
}
function storedTheme(): Theme | null {
  const v = read(STORAGE_KEYS.theme);
  return v === 'light' || v === 'dark' ? v : null;
}

/** Applied at page load (before the first draw) so the wrong mode does not flash - web/main.tsx calls it before `render`. */
export function applyStoredPrefs(): void {
  const root = document.documentElement;
  root.lang = storedLang();
  root.dataset.theme = storedTheme() ?? systemTheme();
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const [themeChoice, setThemeChoice] = useState<Theme | null>(storedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = themeChoice ?? system;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyThemeColor();
  }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    write(STORAGE_KEYS.lang, l);
    setLangState(l);
  }, []);
  const setTheme = useCallback((th: Theme) => {
    write(STORAGE_KEYS.theme, th);
    setThemeChoice(th);
  }, []);

  const setThemeChoiceBoth = useCallback((choice: Theme | null) => {
    try {
      writeThemeChoice(window.localStorage, choice);
    } catch {
      // storage blocked
    }
    setThemeChoice(choice);
  }, []);

  const value = useMemo<Prefs>(
    () => ({ lang, theme, themeChoice, setLang, setTheme, setThemeChoice: setThemeChoiceBoth }),
    [lang, theme, themeChoice, setLang, setTheme, setThemeChoiceBoth],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const p = useContext(PrefsContext);
  if (!p) throw new Error('usePrefs() must be inside <PrefsProvider>');
  return p;
}

/** `const t = useT(); t('home.title'); t.node('top.stats.activeLoops', { n: <b>3</b> })`. */
export function useT(): TFn {
  const { lang } = usePrefs();
  return useMemo(() => {
    const fn = ((key: MessageKey, params?: Params) => translate(lang, key, params)) as TFn;
    fn.tn = (base, n, params) => plural(lang, base, n, params);
    fn.node = (key, params) =>
      createElement(Fragment, null, ...formatParts(MESSAGES[lang][key], params).map((part, i) => createElement(Fragment, { key: i }, part)));
    fn.lang = lang;
    return fn;
  }, [lang]);
}
