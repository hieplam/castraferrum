// The frame of a page pushed from the Loops page (spec 4.6): on the phone a navigation bar with the way back and the page's actions;
// on the desktop a back link above the page title. Also the two states every pushed page shares: loading (a skeleton) and not
// found (an empty state with a link to Loops).
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { isApiError } from '../../api/loops-api';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Icon } from '../../ui/kit/Icon';
import { NavBar, Page, useLayout } from '../../ui/kit/Layout';

export type Back = { to: string; label: ReactNode; testId?: string };

/**
 * `back` is where the way back leads; `backlink: false` leaves the desktop's back link out (the loading and not-found states).
 * `actions` sit in the phone's navigation bar; the desktop page puts its own actions in its head.
 */
export function PushedPage({
  back,
  backlink = true,
  actions,
  narrow,
  testId,
  top,
  children,
}: {
  back: Back;
  backlink?: boolean;
  actions?: ReactNode;
  narrow?: boolean;
  testId?: string;
  /** What comes first in the page, above the way back (the hold banner of a loop with a probe). */
  top?: ReactNode;
  children: ReactNode;
}) {
  const phone = useLayout() === 'phone';
  return (
    <>
      {phone ? (
        <NavBar
          back={
            <Link className="navbar-back" to={back.to} data-testid={back.testId}>
              <Icon name="back" />
              {back.label}
            </Link>
          }
          actions={actions}
        />
      ) : null}
      <Page narrow={narrow} testId={testId}>
        {top}
        {!phone && backlink ? (
          <Link className="backlink" to={back.to} data-testid={back.testId}>
            <Icon name="back" />
            {back.label}
          </Link>
        ) : null}
        {children}
      </Page>
    </>
  );
}

/** The way back to the Loops page. */
export function useBackToLoops(): Back {
  const t = useT();
  return { to: '/', label: t('nav.loops') };
}

/** Loading a pushed page: placeholder lines and blocks in the page's two columns. */
export function PageSkeleton() {
  return (
    <PushedPage back={useBackToLoops()} backlink={false}>
      <div className="cols" aria-busy="true">
        <div className="cols-main">
          <span className="skeleton is-line" />
          <span className="skeleton is-block" />
          <span className="skeleton is-block" />
        </div>
        <div className="cols-side">
          <span className="skeleton is-block" />
          <span className="skeleton is-block" />
        </div>
      </div>
    </PushedPage>
  );
}

/** A loop, a period or a run that does not exist (or could not load): its title is the page's one heading (D28). */
export function PageNotFound({ title, testId }: { title: string; testId?: string }) {
  const t = useT();
  return (
    <PushedPage back={useBackToLoops()} backlink={false}>
      <div className="empty is-err" role="alert" data-testid={testId}>
        <b role="heading" aria-level={1}>
          {title}
        </b>
        <span>{t('missing.body')}</span>
        <Link className="btn" to="/">
          {t('missing.home')}
        </Link>
      </div>
    </PushedPage>
  );
}

/** The title of a page that could not load: `notFound` when the item does not exist, the error's own text otherwise. */
export function errorTitle(t: (key: MessageKey) => string, err: unknown, notFound: MessageKey): string {
  if (!isApiError(err)) return t('error.NETWORK');
  return err.code.endsWith('_NOT_FOUND') ? t(notFound) : t(`error.${err.code}` as MessageKey);
}
