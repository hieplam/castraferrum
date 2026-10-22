// Not found (spec 5.1): an unknown URL shows an empty state with a link to Loops, inside the frame. The title is the page's one
// heading: the empty state draws it as the bold line of `.empty`, so it carries the heading role instead of an `h1` element.
import { Link } from 'react-router';
import { useT } from '../prefs/prefs';
import { Page } from '../ui/kit/Layout';

export function MissingRoute() {
  const t = useT();
  return (
    <Page testId="missing-route">
      <div className="empty">
        <b role="heading" aria-level={1}>
          {t('missing.title')}
        </b>
        <span>{t('missing.body')}</span>
        <Link className="btn" to="/">
          {t('missing.home')}
        </Link>
      </div>
    </Page>
  );
}
