// The page and its parts (`.page`, `.page-head`, `.backlink`, `.cols`, `.actionbar`) and `useLayout()`, which says whether the
// phone or the desktop layout is showing, so an action is rendered once, in the place its size asks for (spec 4.6).
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/** Phone below 640px. The breakpoint is literal here as in the CSS: a media query cannot read a custom property. */
const PHONE_QUERY = '(max-width: 639.98px)';
export type Layout = 'phone' | 'desktop';

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** `phone` below 640px, otherwise `desktop`; follows a resize or a rotation. */
export function useLayout(): Layout {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(PHONE_QUERY).matches ? 'phone' : 'desktop'),
    () => 'desktop',
  );
}

/** The wide layout (the Loops table, spec 4.5) starts at 1024px; below it the same rows are cells. Literal as in the CSS. */
const WIDE_QUERY = '(min-width: 1024px)';

function subscribeWide(cb: () => void): () => void {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** `true` from 1024px: the layouts that show a table instead of cells. Follows a resize or a rotation. */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

/** What the frame draws at the top of every page (the status banner): the page puts it first inside its `.page`. */
const PageTopContext = createContext<ReactNode>(null);
export const PageTopProvider = PageTopContext.Provider;

/** One `.page` per route (the one `main` landmark): `narrow` for the editor, Settings, Repos and the loop's settings. */
export function Page({ narrow, testId, children }: { narrow?: boolean; testId?: string; children: ReactNode }) {
  const top = useContext(PageTopContext);
  return (
    <main className={cx('page', narrow && 'is-narrow')} data-testid={testId}>
      {top}
      {children}
    </main>
  );
}

/** The large title of a tab root (the phone's own title; the desktop shows the page title). */
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h1 className="large-title">{children}</h1>;
}

/**
 * The head of a page: the page's one `h1` (the large title on a tab root of the phone, the page title elsewhere) and, beside it,
 * the page's actions when the layout puts them in the head. `root` marks a tab root that has an action.
 */
export function PageHead({ title, large, root, children }: { title: ReactNode; large?: boolean; root?: boolean; children?: ReactNode }) {
  const layout = useLayout();
  return (
    <div className={cx('page-head', root && 'is-root')}>
      {layout === 'phone' && large ? <LargeTitle>{title}</LargeTitle> : <h1 className="page-title">{title}</h1>}
      {children}
    </div>
  );
}

/** The desktop's way back, above the page title (the phone shows the navigation bar instead). */
export function BackLink({ onClick, href, children }: { onClick?: () => void; href?: string; children: ReactNode }) {
  const inner = (
    <>
      <Icon name="back" />
      {children}
    </>
  );
  return href ? (
    <a className="backlink" href={href}>
      {inner}
    </a>
  ) : (
    <button className="backlink" type="button" onClick={onClick}>
      {inner}
    </button>
  );
}

/** The phone's fixed bottom bar for the page's main action. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="actionbar">{children}</div>;
}

/** Two columns from 1024px: `main` on the left, `side` on the right. */
export function Cols({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="cols">
      <div className="cols-main">{main}</div>
      <div className="cols-side">{side}</div>
    </div>
  );
}

/**
 * The phone's navigation bar of a pushed page (`.navbar`, hidden from 640px): the way back (`back`, a link the caller builds with
 * `navbar-back`), an empty title (the page's own `h1` names the page, D28) and the page's actions.
 */
export function NavBar({ back, actions }: { back: ReactNode; actions?: ReactNode }) {
  return (
    <nav className="navbar">
      {back}
      <span className="navbar-title" />
      <div className="navbar-actions">{actions}</div>
    </nav>
  );
}
