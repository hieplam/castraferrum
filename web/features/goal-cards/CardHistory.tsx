// The earlier goal cards of a repo (preview states `card-two-way` and `card-one-way`): one cell each with the title, the status as a pill
// and the day of the decision, newest first.
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

export function CardHistory({ cards, tz }: { cards: readonly GoalCardDto[]; tz: string }) {
  const t = useT();
  return (
    <Group caption={t('goalLoop.cards.history')} testId="card-history">
      {cards.map((c) => {
        const [tone, key] = CARD_PILL[c.state];
        return (
          <div className="cell" key={c.id} data-status={c.state} data-card-id={c.id}>
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
          </div>
        );
      })}
    </Group>
  );
}
