import type { GoalCard, GoalCardDoor, GoalCardState } from '../../shared/domain/goal-card';

/** One row of `goal_cards` (spec 2.13). `epicNumber`, `prNumber` and `loopId` hold the results of the starter. */
export type GoalCardRecord = {
  id: string;
  repoId: string;
  /** `owner/name`. */
  githubRepo: string;
  issueNumber: number;
  title: string;
  /** The door of `effectiveDoor`, not the door that the card says. */
  door: GoalCardDoor;
  card: GoalCard;
  state: GoalCardState;
  /** Set only with the window on and a `two-way` door. */
  startAfter: Date | null;
  changed: boolean;
  epicNumber: number | null;
  prNumber: number | null;
  loopId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

export type NewGoalCardRecord = Pick<GoalCardRecord, 'id' | 'repoId' | 'githubRepo' | 'issueNumber' | 'title' | 'door' | 'card' | 'startAfter' | 'createdAt'>;

/** What a decision changes. Each field is written, so a caller starts from the row that it read. */
export type GoalCardUpdate = Pick<GoalCardRecord, 'state' | 'title' | 'door' | 'card' | 'startAfter' | 'changed' | 'decidedAt'>;

export interface GoalCardRepository {
  /** `taken`: the repository already has a `proposed` card, or a row of this issue. Nothing changes. */
  insert(card: NewGoalCardRecord): Promise<'inserted' | 'taken'>;
  get(id: string): Promise<GoalCardRecord | null>;
  /** Newest first. `null` lists the cards of every repository. */
  list(repoId: string | null): Promise<GoalCardRecord[]>;
  /** Changes the row only while it is in state `from`. `null` when it is not: another decision came first. */
  update(id: string, from: GoalCardState, change: GoalCardUpdate): Promise<GoalCardRecord | null>;
}
