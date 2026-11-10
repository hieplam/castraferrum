// The earlier goal cards of a repo (preview states `card-two-way` and `card-one-way`): one cell each with the title, the status as a pill
// and the day of the decision, newest first. A cell is a link to the issue of the card, as the preview draws it.
import type { GoalCardDto } from '../../../shared/contracts/goal-cards';
import type { GoalCardState } from '../../../shared/domain/goal-card';
import { fmtDayMonth } from '../../data/scoreboard';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Group } from '../../ui/kit/Group';
import { Icon } from '../../ui/kit/Icon';
import { Pill, type PillTone } from '../../ui/kit/Pill';

/** The status word of a card and its tone (the Statuses table of design/ds/SYSTEM.md, "Goal card"). */
export const CARD_PILL: Record<GoalCardState, readonly [PillTone, MessageKey]> = {
  proposed: ['wait', 'goalLoop.card.proposed'],
  accepted: ['ok', 'goalLoop.card.accepted'],
  refused: ['stop', 'goalLoop.card.refused'],
  started: ['run', 'goalLoop.card.started'],
};

/** Every card is a GitHub issue labelled `goal-card` (spec 2.13), so an earlier card opens that issue, in the way the blocker rows of the probe do. */
function issueUrl(c: GoalCardDto): string {
  return `https://github.com/${c.githubRepo}/issues/${c.issueNumber}`;
}

export function CardHistory({ cards, tz }: { cards: readonly GoalCardDto[]; tz: string }) {
  const t = useT();
  return (
    <Group caption={t('goalLoop.cards.history')} testId="card-history">
      {cards.map((c) => {
        const [tone, key] = CARD_PILL[c.state];
        return (
          <a className="cell" key={c.id} href={issueUrl(c)} target="_blank" rel="noopener" data-status={c.state} data-card-id={c.id}>
            <span className="cell-main">
              <span className="cell-title" data-raw="">
                {c.title}
              </span>
              <span className="cell-row">
                <Pill tone={tone}>{t(key)}</Pill>
                <span className="cell-meta is-data">{fmtDayMonth(c.decidedAt ?? c.createdAt, tz)}</span>
              </span>
            </span>
            <Icon name="chev" className="chev" />
          </a>
        );
      })}
    </Group>
  );
}
