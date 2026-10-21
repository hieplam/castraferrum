// "/" when no loop is selected (main pane). No loop at all (archived included) -> a large EmptyState "Create your first loop" + instructions
// (preview `list-empty`); otherwise -> a short 3-step guide + Create loop (preview `list-overview`). The loop count comes from
// `GET /api/stats` (data/overview.ts) - the same query as the overview bar.
import { useNavigate } from 'react-router';
import { useOverview } from '../data/overview';
import { useT } from '../prefs/prefs';
import { Button, Crumbs, EmptyState, PaneHeader, PaneSub } from '../ui/components';

function Guide() {
  const t = useT();
  return (
    <ol className="guide">
      {([1, 2, 3] as const).map((i) => (
        <li key={i}>
          <b>
            <span className="n">0{i}</span> · {t(`home.step${i}.title`)}
          </b>
          {t(i === 1 ? 'home.step1.bodyRepo' : `home.step${i}.body`)}
        </li>
      ))}
    </ol>
  );
}

export function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const counts = useOverview().data?.loops;
  if (counts && counts.all + counts.archived === 0) {
    return (
      <>
        <EmptyState glyph="▍_" title={t('empty.first.title')} testId="home-empty"
          action={<Button variant="primary" size="lg" onClick={() => navigate('/loops/new')}>{t('empty.first.cta')}</Button>}>
          {t('empty.first.bodyRepo')}
        </EmptyState>
        <Guide />
      </>
    );
  }
  return (
    <>
      <Crumbs>{t('crumb.loops')}</Crumbs>
      <PaneHeader title={t('home.title')} />
      <PaneSub>{t('home.lead')}</PaneSub>
      <Guide />
      <div>
        <Button variant="primary" size="lg" onClick={() => navigate('/loops/new')}>
          {t('list.create')}
        </Button>
      </div>
    </>
  );
}
