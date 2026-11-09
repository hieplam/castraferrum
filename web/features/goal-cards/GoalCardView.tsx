// The goal cards page of a repo (goals G19 and G20, preview states `card-two-way` and `card-one-way`): the card that waits for an answer
// with its status, its door, its size and one sentence about when it starts, Accept and Refuse, the goal rows of the card, the next
// card, and the earlier cards. A page pushed from the Repos tab: the phone keeps the tab bar under the navigation bar. The server decides
// the door and the start time; the web shows them.
import type { GoalCardDto } from '../../../shared/contracts/goal-cards';
import { isApiError } from '../../api/loops-api';
import { fmtHm, splitGoalCards, useDecideGoalCard, useGoalCards } from '../../data/goal-cards';
import { browserTimeZone } from '../../data/overview';
import { useRepos } from '../../data/repos';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button } from '../../ui/kit/Button';
import { Group, RowCell } from '../../ui/kit/Group';
import { PageHead, useLayout } from '../../ui/kit/Layout';
import { Pill } from '../../ui/kit/Pill';
import { useToast } from '../../ui/toast';
import { errorTitle, PushedPage } from '../loop-detail/PushedPage';
import { CARD_PILL, CardHistory } from './CardHistory';

const data = (text: string) => <span className="data">{text}</span>;

/** The sentence of the card about when it starts: the time (two-way with a start time), the wait for Accept, or the one-way rule. */
function Sentence({ card, tz }: { card: GoalCardDto; tz: string }) {
  const t = useT();
  if (card.door === 'one-way') return <>{t('goalLoop.cards.oneWayText')}</>;
  if (card.startAfter === null) return <>{t('goalLoop.cards.twoWayOff')}</>;
  return <>{t.node('goalLoop.cards.twoWayText', { t: data(fmtHm(card.startAfter, tz)) })}</>;
}

function Proposed({ card, tz, busy, onAnswer }: { card: GoalCardDto; tz: string; busy: boolean; onAnswer(answer: 'accept' | 'refuse'): void }) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const [tone, key] = CARD_PILL.proposed;
  const next = card.card.next[0];
  return (
    <>
      <div className="page-meta">
        <Pill tone={tone} testId="card-status" status="proposed">
          {t(key)}
        </Pill>
        <Pill tone={card.door === 'one-way' ? 'warn' : 'skip'} testId="card-door" status={card.door}>
          {t(card.door === 'one-way' ? 'goalLoop.door.oneWay' : 'goalLoop.door.twoWay')}
        </Pill>
        <span>{t.node('goalLoop.cards.size', { n: data(String(card.card.size.planWindows)) })}</span>
      </div>
      <div className="card" data-testid="goal-card" data-card-id={card.id}>
        <div className="now">
          <div className="now-text">
            <b data-raw="">{card.title}</b>
            <Sentence card={card} tz={tz} />
          </div>
          <span className="now-actions">
            <Button variant="primary" block={phone} disabled={busy} onClick={() => onAnswer('accept')} data-testid="card-accept">
              {t('goalLoop.cards.accept')}
            </Button>
            <Button variant="danger" block={phone} disabled={busy} onClick={() => onAnswer('refuse')} data-testid="card-refuse">
              {t('goalLoop.cards.refuse')}
            </Button>
          </span>
        </div>
      </div>
      <Group caption={t('goalLoop.cards.rows')} testId="card-rows">
        {card.card.rows.map((row) => (
          <RowCell key={row.id}>
            <span className="cell-main">
              <span className="run-top">
                <span className="run-id">{row.id}</span>
                <span className="run-meta" data-raw="">
                  {row.oracle}
                </span>
              </span>
              <span className="cell-sum" data-raw="">
                {row.outcome}
              </span>
              <span className="cell-meta" data-raw="">
                {row.threshold}
              </span>
            </span>
          </RowCell>
        ))}
      </Group>
      {next === undefined ? null : (
        <p className="note" data-raw="">
          {t('goalLoop.cards.next', { text: next })}
        </p>
      )}
    </>
  );
}

export function GoalCardView({ repoId }: { repoId: string }) {
  const t = useT();
  const toast = useToast();
  const tz = browserTimeZone();
  const cards = useGoalCards(repoId);
  const repos = useRepos();
  const decide = useDecideGoalCard(repoId);
  const name = repos.data?.find((r) => r.id === repoId)?.name;
  const back = { to: '/repos', label: name === undefined ? t('nav.repos') : <span data-raw="">{name}</span>, testId: 'card-back' };

  if (cards.isError) {
    return (
      <PushedPage back={back} backlink={false} narrow>
        <div className="empty is-err" data-testid="card-load-error" role="alert">
          <b>{errorTitle(t, cards.error, 'error.REPO_NOT_FOUND')}</b>
        </div>
      </PushedPage>
    );
  }
  const answer = (id: string, how: 'accept' | 'refuse') =>
    decide.mutate({ id, answer: how }, { onError: (err) => toast.show(t('toast.failed', { msg: t(`error.${isApiError(err) ? err.code : 'NETWORK'}` as MessageKey) }), 'err') });
  const { proposed, history } = splitGoalCards(cards.data?.items ?? []);
  return (
    <PushedPage back={back} narrow>
      <PageHead title={t('goalLoop.cards.title')} />
      {!cards.data ? (
        <span className="skeleton is-block" aria-busy="true" />
      ) : (
        <>
          {proposed ? (
            <Proposed card={proposed} tz={tz} busy={decide.isPending} onAnswer={(how) => answer(proposed.id, how)} />
          ) : (
            <p className="note" data-testid="card-none">
              {t('goalLoop.cards.none')}
            </p>
          )}
          {history.length > 0 ? <CardHistory cards={history} tz={tz} /> : null}
        </>
      )}
    </PushedPage>
  );
}
